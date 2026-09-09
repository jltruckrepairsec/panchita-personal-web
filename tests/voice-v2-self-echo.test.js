"use strict";
/*
 * Regression tests for the REAL Android self-echo feedback loop.
 *
 * Reproduced on Luis's phone: Voice v2 stayed in ESCUCHANDO, Panchita spoke
 * through the loudspeaker, the open microphone recognised her own TTS as user
 * speech, fragments of her answer ("Claro", "Aqui", "dime", and stretches of
 * the answer itself) appeared as user bubbles, she answered herself, and the
 * loop ran until "Limite de mensajes alcanzado".
 *
 * The harness models the thing that causes it: the loudspeaker is live for a
 * real span of time, and whatever it is playing can be fed straight back into
 * the recogniser.
 *
 * INVARIANT UNDER TEST: audio produced by Panchita's own loudspeaker can never
 * become a Gateway user turn.
 */
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("./harness.js");

const GRACE_MS = 1800;   // TURN_SILENCE_MS in voice-v2.html
const TURN_BREAKER_MAX_EXPECTED = 20;

/* The answer she speaks, and the fragments Android fed back from it. */
const ANSWER = "Claro, dime en que te puedo ayudar. Aqui esta la orden del jueves.";
const ECHO_FRAGMENTS = ["Claro", "Aqui", "dime", "dime en que te puedo ayudar",
                        "Aqui esta la orden del jueves", "en que te puedo ayudar"];

function answeringApp(answer) {
  return createApp({
    gateway: (p) => p.factor_provided !== undefined
      ? { status: "completed", session_token: "test-session-1", human_readable_response: "Hola Luis." }
      : { status: "completed", human_readable_response: answer || ANSWER }
  });
}

async function askOnce(a, question) {
  a.current().emitAppend(question, true);
  await a.settle(GRACE_MS + 300);
}

/* -- The reproduction ----------------------------------------------------- */
test("REPRO: Panchita's own TTS fed back into the mic makes ZERO Gateway submissions", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();

  await askOnce(a, "Hola Panchita");
  assert.strictEqual(a.turnRequests().length, 1, "the real question should have been sent");
  assert.strictEqual(a.speaking(), true, "she should be speaking through the loudspeaker");

  // The loudspeaker feeds back into the open microphone, exactly as on Android.
  for (const fragment of ECHO_FRAGMENTS) {
    a.current().emitAppend(fragment, true);
    await a.settle(80);
  }
  await a.settle(6000);

  assert.strictEqual(a.turnRequests().length, 1,
    "self-echo produced " + (a.turnRequests().length - 1) + " extra Gateway turns");
  assert.ok(a.stat("gated while she spoke") >= ECHO_FRAGMENTS.length,
    "the fragments were not stopped by the TTS gate");
  assert.strictEqual(a.messages().filter((m) => m.startsWith("msg user")).length, 1,
    "a fragment of her own answer became a user bubble");
});

test("REPRO: the short fragments that actually got through before are contained", async () => {
  // "Claro" (5 chars), "Aqui" (4), "dime" (4) all fell under the old echo
  // guard's six-character floor and were submitted as user turns.
  for (const fragment of ["Claro", "Aqui", "dime", "si", "ok"]) {
    const a = answeringApp();
    await a.login();
    await a.startVoice();
    await askOnce(a, "Hola Panchita");
    a.current().emitAppend(fragment, true);
    await a.settle(6000);
    assert.strictEqual(a.turnRequests().length, 1,
      "fragment " + JSON.stringify(fragment) + " reached Gateway");
  }
});

test("REPRO: a mis-transcription of her audio is contained too", async () => {
  // The gate is lifecycle, not text, so audio her own speaker produced is
  // contained even when the recogniser garbles it into words she never said.
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  for (const garbled of ["clara dile", "aquiles ta la orden", "puerta el jueves"]) {
    a.current().emitAppend(garbled, true);
    await a.settle(80);
  }
  await a.settle(6000);
  assert.strictEqual(a.turnRequests().length, 1, "a garbled echo reached Gateway");
});

test("REPRO: the runaway loop cannot start — 10 rounds of feedback, still 1 turn", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");

  for (let round = 0; round < 10; round++) {
    for (const fragment of ECHO_FRAGMENTS) {
      a.current().emitAppend(fragment, true);
      await a.settle(50);
    }
    await a.settle(300);
  }
  await a.settle(8000);

  assert.strictEqual(a.turnRequests().length, 1,
    "the loop ran: " + a.turnRequests().length + " Gateway turns");
  assert.strictEqual(a.stat("turns sent"), 1);
  assert.strictEqual(a.stat("breaker"), 0, "the breaker should not have been needed");
  assert.strictEqual(a.voiceActive(), true, "voice should survive a contained echo storm");
});

test("REPRO: the acknowledgement she speaks while thinking cannot echo back either", async () => {
  // speak(ack) fires the moment a turn is submitted, before the answer exists.
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  a.current().emitAppend("Cuanto debo", true);
  await a.settle(GRACE_MS + 100);          // ack is playing, answer not back yet
  for (const fragment of ["Dejame", "Dejame ver", "ver"]) {
    a.current().emitAppend(fragment, true);
    await a.settle(60);
  }
  await a.settle(6000);
  assert.strictEqual(a.turnRequests().length, 1, "the ack echoed back into Gateway");
});

/* -- The gate itself ------------------------------------------------------ */
test("nothing at all can be submitted while the loudspeaker is live", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  assert.strictEqual(a.gate(), "held");
  assert.strictEqual(a.speaking(), true);

  // Words she never said, that no echo test could reject.
  a.current().emitAppend("cierra la orden del camion azul", true);
  await a.settle(GRACE_MS + 200);
  assert.strictEqual(a.turnRequests().length, 1, "the gate let a turn through while she spoke");
});

test("the gate opens once she is silent, and the microphone is reset", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  const before = a.stat("mic resets after tts");
  await askOnce(a, "Hola Panchita");
  await a.settle(8000);
  assert.strictEqual(a.gate(), "open");
  assert.strictEqual(a.speaking(), false);
  assert.ok(a.stat("mic resets after tts") > before, "the microphone was not reset after TTS");
  assert.strictEqual(a.phase(), "listening");
  assert.strictEqual(a.voiceActive(), true);
});

test("a normal turn still works after the gate has opened", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  await a.settle(8000);
  a.current().emitAppend("Cierra la orden del jueves", true);
  await a.settle(GRACE_MS + 500);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Hola Panchita", "Cierra la orden del jueves"]);
});

test("the gate never wedges shut when TTS never reports an end", async () => {
  const a = answeringApp();
  // A speechSynthesis that starts and then goes silent without firing onend,
  // the known Android failure mode.
  a.sandbox.window.speechSynthesis.speak = function (u) {
    a.spoken.push(u.text);
    this.speaking = true;
    a.clock.setTimeout(() => { this.speaking = false; }, 900);   // no onend, ever
  };
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  await a.settle(8000);
  assert.strictEqual(a.gate(), "open", "the gate wedged shut with no onend");
  a.current().emitAppend("Cierra la orden", true);
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.turnRequests().length, 2, "voice was dead after a missing onend");
});

/* -- Intentional barge-in still works ------------------------------------- */
test("Luis can still interrupt Panchita intentionally", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  assert.strictEqual(a.speaking(), true);

  a.current().emitAppend("Espera un momento", true);     // not her words
  await a.settle(80);
  assert.strictEqual(a.speaking(), false, "she did not stop when interrupted");
  assert.ok(a.stat("barge-ins") >= 1);
});

test("an interruption is followed by a normal turn once she is silent", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  a.current().emitAppend("Espera", true);
  await a.settle(2000);
  assert.strictEqual(a.gate(), "open");
  a.current().emitAppend("mejor mandame la factura", true);
  await a.settle(GRACE_MS + 800);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Hola Panchita", "mejor mandame la factura"]);
});

test("she never interrupts herself: her own fragments do not stop her speaking", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  const bargeBefore = a.stat("barge-ins");
  for (const fragment of ECHO_FRAGMENTS) {
    a.current().emitAppend(fragment, true);
    await a.settle(50);
  }
  assert.strictEqual(a.speaking(), true, "her own echo cut her off mid-answer");
  assert.strictEqual(a.stat("barge-ins"), bargeBefore, "her own echo counted as a barge-in");
});

/* -- Stale events during and after TTS ------------------------------------ */
test("the recogniser that was live during TTS cannot submit after the reset", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  const duringTts = a.current();
  await askOnce(a, "Hola Panchita");
  await a.settle(8000);                        // gate opens, mic is reset
  assert.notStrictEqual(a.current(), duringTts, "the microphone was not replaced");

  duringTts.emitAppend("Aqui esta la orden del jueves", true);   // late echo
  duringTts.fireEnd();
  duringTts.fireError("network");
  await a.settle(GRACE_MS + 2000);
  assert.strictEqual(a.turnRequests().length, 1, "a stale recogniser submitted after TTS");
  assert.ok(a.stat("stale callbacks ignored") >= 1);
  assert.strictEqual(a.voiceActive(), true);
});

test("speech buffered when she starts speaking is discarded, not submitted later", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  // A half-finished hypothesis arrives just as the answer starts playing.
  a.current().emitAppend("y tambien", true);
  await a.settle(8000);
  assert.strictEqual(a.turnRequests().length, 1);
});

/* -- Mute / End voice during TTS ------------------------------------------ */
test("mute during TTS stops everything and submits nothing", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  await a.mute();
  for (const fragment of ECHO_FRAGMENTS) a.current().emitAppend(fragment, true);
  await a.settle(8000);
  assert.strictEqual(a.turnRequests().length, 1);
  assert.strictEqual(a.state(), "MANUALLY_MUTED");
});

test("End voice during TTS stops everything and submits nothing", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  const r = a.current();
  await askOnce(a, "Hola Panchita");
  await a.endVoice();
  ECHO_FRAGMENTS.forEach((f) => r.emitAppend(f, true));
  await a.settle(8000);
  assert.strictEqual(a.turnRequests().length, 1);
  assert.strictEqual(a.voiceActive(), false);
});

test("unmuting after a muted TTS leaves the gate open and voice usable", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");
  await a.mute();
  await a.mute();
  await a.settle(1000);
  assert.strictEqual(a.gate(), "open");
  a.current().emitAppend("Cierra la orden", true);
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.turnRequests().length, 2);
});

/* -- Rate-limit flooding is impossible ------------------------------------ */
test("self-echo cannot flood Gateway: 14 distinct fragments during her answer, still one request", async () => {
  // Every fragment is different, so duplicate suppression cannot mask the
  // flood; and they are spaced past the coalesce window, so they cannot be
  // merged into a single turn either. Only the gate can hold this line.
  const LONG = "Claro, dime en que te puedo ayudar. Aqui esta la orden del jueves " +
               "para el camion azul, con refacciones, mano de obra y el total del " +
               "taller ya calculado para que lo revises con calma.";
  const a = answeringApp(LONG);
  await a.login();
  await a.startVoice();
  await askOnce(a, "Hola Panchita");

  const words = LONG.replace(/[^A-Za-z ]/g, "").split(/\s+/);
  let injected = 0;
  for (let i = 0; i < 14; i++) {
    if (!a.speaking()) break;                        // her answer ended; loop over
    injected++;
    // Alternate the short fragments that actually leaked on the phone with
    // longer slices of her answer.
    const start = i % (words.length - 4);
    const fragment = (i % 2 === 0)
      ? words[start]                                        // one word: "Claro", "Aqui", "dime"
      : words.slice(start, start + 2 + (i % 3)).join(" ");  // a longer slice
    a.current().emitAppend(fragment, true);
    await a.settle(GRACE_MS + 120);      // each fragment is its own finished turn
  }
  await a.settle(12000);
  assert.strictEqual(a.turnRequests().length, 1,
    "self-echo flooded Gateway with " + (a.turnRequests().length - 1) + " extra turns");
  assert.ok(injected >= 5, "only " + injected + " fragments landed during her answer");
  assert.strictEqual(a.stat("barge-ins"), 0,
    "her own audio was mistaken for an interruption and cut her off");
  assert.strictEqual(a.stat("breaker"), 0, "the gate should have held without the breaker");
});

test("the silence grace period structurally caps the voice turn rate", async () => {
  // With a resettable 1.5s silence window every voice turn costs at least that
  // long, so even a browser with no speechSynthesis -- the one configuration
  // the TTS gate cannot cover -- cannot exceed roughly 13 turns per 20s. That
  // bound sits below the breaker threshold, which is why the breaker is now a
  // dormant safety valve rather than the thing holding the line.
  // Run it on a browser with no speech synthesis, so the TTS gate has nothing
  // to hold and the breaker is the only thing left between a loop and Gateway.
  const a = createApp({
    noTts: true,
    gateway: (p) => p.factor_provided !== undefined
      ? { status: "completed", session_token: "test-session-1", human_readable_response: "Hola." }
      : { status: "completed", human_readable_response: "Listo." }
  });
  await a.login();
  await a.startVoice();
  const t0 = a.clock.now();
  for (let i = 0; i < 40 && a.voiceActive(); i++) {
    a.current().emitAppend("pregunta numero " + i, true);
    await a.settle(GRACE_MS + 120);
  }
  await a.settle(2000);
  const elapsed = a.clock.now() - t0;
  const ratePer20s = a.turnRequests().length / (elapsed / 20000);
  assert.ok(ratePer20s < TURN_BREAKER_MAX_EXPECTED,
    "turn rate " + ratePer20s.toFixed(1) + "/20s reached the breaker threshold");
  assert.strictEqual(a.stat("breaker"), 0, "the breaker fired on legitimate turns");
  assert.strictEqual(a.voiceActive(), true, "voice stopped without cause");
});

test("the gate itself paces voice turns, so the breaker is a backstop not a limiter", async () => {
  const a = answeringApp("Listo.");
  await a.login();
  await a.startVoice();
  const t0 = a.clock.now();
  // Hammer as fast as the recogniser could possibly deliver finished turns.
  for (let i = 0; i < 30; i++) {
    a.current().emitAppend("pregunta numero " + i, true);
    await a.settle(GRACE_MS + 60);
  }
  await a.settle(4000);
  const elapsed = a.clock.now() - t0;
  const ratePer20s = a.turnRequests().length / (elapsed / 20000);
  assert.strictEqual(a.stat("breaker"), 0, "the gate should have paced these without the breaker");
  assert.ok(a.turnRequests().length < 30,
    "the gate blocked nothing: " + a.turnRequests().length + " of 30 attempts got through");
  assert.ok(ratePer20s < TURN_BREAKER_MAX_EXPECTED,
    "the gate paced to " + ratePer20s.toFixed(1) + " turns/20s, at or above the breaker threshold");
  assert.strictEqual(a.voiceActive(), true);
});

test("a normal conversation never trips the breaker", async () => {
  const a = answeringApp("Listo.");
  await a.login();
  await a.startVoice();
  for (let i = 0; i < 6; i++) {
    a.current().emitAppend("pregunta numero " + i, true);
    await a.settle(GRACE_MS + 4000);        // human pace, with her answering
  }
  assert.strictEqual(a.stat("breaker"), 0, "the breaker tripped on normal speech");
  assert.strictEqual(a.turnRequests().length, 6);
  assert.strictEqual(a.voiceActive(), true);
});

/* -- The mic reset must not be able to kill the session ------------------- */
test("voice survives Android refusing the first start() after the TTS reset", async () => {
  const a = answeringApp();
  await a.login();
  await a.startVoice();
  // Make the NEXT recogniser refuse its first start(), the known Android
  // InvalidStateError straight after abort().
  const OrigStart = a.sandbox.window.SpeechRecognition.prototype.start;
  let armed = true;
  a.sandbox.window.SpeechRecognition.prototype.start = function () {
    if (armed && this.index > 0) { armed = false; this.started++; throw new Error("InvalidStateError"); }
    return OrigStart.call(this);
  };
  await askOnce(a, "Hola Panchita");
  await a.settle(10000);
  a.sandbox.window.SpeechRecognition.prototype.start = OrigStart;

  assert.strictEqual(a.voiceActive(), true, "a refused start() killed the voice session");
  assert.strictEqual(a.gate(), "open");
  a.current().emitAppend("Cierra la orden", true);
  await a.settle(GRACE_MS + 800);
  assert.strictEqual(a.turnRequests().length, 2, "voice never recovered its microphone");
});
