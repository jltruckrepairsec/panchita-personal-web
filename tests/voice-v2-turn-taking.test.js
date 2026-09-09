"use strict";
/*
 * Regression tests for the two real-phone bugs reported after deployment:
 *
 *   1. Panchita cut Luis off before he finished, because a short natural pause
 *      was treated as end of turn.
 *   2. The UI dropped into SILENCIADO / "Microfono silenciado" on its own,
 *      with nobody having tapped Silenciar.
 *
 * These mirror the six physical phone tests one-for-one, so a pass here is the
 * same claim the phone is being asked to confirm.
 */
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("./harness.js");

const GRACE_MS = 1800;   // TURN_SILENCE_MS in voice-v2.html

function app(answer) {
  return createApp({
    gateway: (p) => p.factor_provided !== undefined
      ? { status: "completed", session_token: "test-session-1", human_readable_response: "Hola Luis." }
      : { status: "completed", human_readable_response: answer || "Listo." }
  });
}

async function live(answer) {
  const a = app(answer);
  await a.login();
  await a.startVoice();
  return a;
}

/* Say a phrase the way an engine really delivers it: interim hypotheses as the
   words arrive, then one final. */
async function say(a, phrase, opts) {
  const o = opts || {};
  const words = phrase.split(" ");
  if (a.current().onspeechstart) a.current().onspeechstart();
  let acc = "";
  for (const w of words) {
    acc = acc ? acc + " " + w : w;
    // Re-read the recogniser each time: the page may legitimately replace it
    // mid-utterance, and a real engine would follow the live one.
    a.current().emitAppend(acc, false);       // interim
    await a.settle(o.wordMs || 180);
  }
  if (!o.noFinal) {
    a.current().emitAppend(acc, true);        // the engine finalises
    if (a.current().onspeechend) a.current().onspeechend();
    await a.settle(o.tailMs || 60);
  }
  return acc;
}

/* -- TEST 1: one continuous long sentence -------------------------------- */
test("TEST 1: a long continuous sentence is captured whole", async () => {
  const a = await live();
  const said = "Panchita quiero que me ayudes a revisar una cita para manana";
  await say(a, said);
  await a.settle(GRACE_MS + 400);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message), [said]);
});

/* -- TEST 2: one natural pause mid-sentence ------------------------------ */
test("TEST 2: a one-second pause mid-sentence does NOT end the turn", async () => {
  const a = await live();
  await say(a, "Quiero que me ayudes con");

  // The pause. Android finalises here, which is what used to cut him off.
  await a.settle(1000);
  assert.strictEqual(a.turnRequests().length, 0,
    "Panchita answered during the pause: " + JSON.stringify(a.turnRequests().map((q) => q.body.message)));
  assert.strictEqual(a.state(), "USER_PAUSED", "state was " + a.state() + ", not USER_PAUSED");
  assert.strictEqual(a.speaking(), false, "she started talking over him");

  await say(a, "Quiero que me ayudes con las citas de manana");
  await a.settle(GRACE_MS + 400);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Quiero que me ayudes con las citas de manana"]);
});

/* -- TEST 3: a completed sentence, then a real 2s silence ---------------- */
test("TEST 3: two seconds of genuine silence does end the turn", async () => {
  const a = await live();
  await say(a, "Cierra la orden del jueves");
  assert.strictEqual(a.turnRequests().length, 0, "submitted before the grace period elapsed");
  await a.settle(2000);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message), ["Cierra la orden del jueves"]);
});

/* -- TEST 5: two thinking pauses in one sentence ------------------------- */
test("TEST 5: two pauses while thinking produce no premature fragments", async () => {
  const a = await live();
  await say(a, "Necesito");
  await a.settle(1100);
  assert.strictEqual(a.turnRequests().length, 0, "fragment 'Necesito' was submitted");

  await say(a, "Necesito que revises");
  await a.settle(1100);
  assert.strictEqual(a.turnRequests().length, 0, "fragment 'Necesito que revises' was submitted");

  await say(a, "Necesito que revises mis citas de manana");
  await a.settle(GRACE_MS + 400);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Necesito que revises mis citas de manana"]);
});

test("a pause longer than the grace period is a finished turn, not a lost one", async () => {
  const a = await live();
  await say(a, "Hola Panchita");
  await a.settle(GRACE_MS + 400);
  assert.strictEqual(a.turnRequests().length, 1);
  assert.strictEqual(a.turnRequests()[0].body.message, "Hola Panchita");
});

test("words not yet finalised survive Android restarting the recogniser", async () => {
  const a = await live();
  const r = a.current();
  if (r.onspeechstart) r.onspeechstart();
  r.emitAppend("Necesito que revises", false);      // interim only, never finalised
  await a.settle(200);
  r.fireEnd();                                       // Android closes the session
  await a.settle(900);                               // page reopens it
  await say(a, "mis citas de manana");
  await a.settle(GRACE_MS + 400);
  const msg = a.turnRequests()[0].body.message;
  assert.match(msg, /Necesito que revises/, "the unfinalised words were lost: " + JSON.stringify(msg));
  assert.match(msg, /mis citas de manana/);
});

/* -- TEST 4: barge-in keeps the interruption ----------------------------- */
test("TEST 4: interrupting Panchita stops her AND keeps the interruption", async () => {
  const a = await live("Claro, dime en que te puedo ayudar con la orden del jueves del camion azul.");
  await say(a, "Hola Panchita");
  await a.settle(GRACE_MS + 400);
  assert.strictEqual(a.speaking(), true, "she should be answering by now");

  // Luis talks over her. The first words arrive as interims while she is
  // still playing; she must stop, and those words must not be thrown away.
  const r = a.current();
  if (r.onspeechstart) r.onspeechstart();
  r.emitAppend("Espera", false);
  await a.settle(120);
  assert.strictEqual(a.speaking(), false, "she did not stop when interrupted");

  r.emitAppend("Espera todavia", false);
  await a.settle(150);
  await a.settle(1200);                               // gate opens, mic resets
  await say(a, "no termino");
  await a.settle(GRACE_MS + 500);

  const msgs = a.turnRequests().map((q) => q.body.message);
  assert.strictEqual(msgs.length, 2, "expected the interruption to become a turn: " + JSON.stringify(msgs));
  assert.match(msgs[1], /Espera/, "the interruption's opening words were lost: " + JSON.stringify(msgs[1]));
  assert.match(msgs[1], /no termino/, "the rest of the interruption was lost: " + JSON.stringify(msgs[1]));
});

/* Settle until her loudspeaker is actually live, so a test never races the
   round trip. Fails loudly rather than silently proceeding. */
async function untilSpeaking(a, label) {
  for (let i = 0; i < 40 && !a.speaking(); i++) await a.settle(200);
  assert.strictEqual(a.speaking(), true, (label || "") + ": she never started speaking");
}

/* Settle until she has finished talking and the gate has reopened, so the next
   round starts from a clean listening state instead of racing the previous
   answer. */
async function untilQuiet(a, label) {
  for (let i = 0; i < 60 && (a.speaking() || a.gate() !== "open"); i++) await a.settle(250);
  assert.strictEqual(a.gate(), "open", (label || "") + ": the gate never reopened");
}

/* -- TEST 5b: barge-in twice in one session ------------------------------ */
test("TEST 5b: barge-in works twice in the same session", async () => {
  const a = await live("Claro, dime en que te puedo ayudar con eso ahora mismo por favor.");
  for (let round = 0; round < 2; round++) {
    await untilQuiet(a, "round " + round + " start");
    await say(a, "Pregunta numero " + round);
    await a.settle(GRACE_MS + 400);
    await untilSpeaking(a, "round " + round);

    // Luis interrupts and says a COMPLETE sentence over her, then stops.
    const r = a.current();
    if (r.onspeechstart) r.onspeechstart();
    r.emitAppend("Espera", false);
    await a.settle(120);
    assert.strictEqual(a.speaking(), false, "round " + round + ": barge-in did not stop her");
    r.emitAppend("Espera mejor manana", false);
    await a.settle(400);
    r.emitAppend("Espera mejor manana", true);
    await a.settle(GRACE_MS + 1500);

    const msgs = a.turnRequests().map((q) => q.body.message);
    assert.ok(msgs.some((m) => /Espera mejor manana/.test(m)),
      "round " + round + ": the interruption was lost (" + JSON.stringify(msgs) + ")");
    assert.ok(msgs.some((m) => m === "Pregunta numero " + round),
      "round " + round + ": the question itself was lost (" + JSON.stringify(msgs) + ")");
  }
  assert.ok(a.stat("barge-ins") >= 2, "only " + a.stat("barge-ins") + " barge-ins registered");
  assert.strictEqual(a.voiceActive(), true);
});

/* -- TEST 6: healthy afterwards ------------------------------------------ */
test("TEST 6: after all of that the next turn works normally", async () => {
  const a = await live("Claro, dime en que te puedo ayudar con eso.");
  await say(a, "Hola Panchita");
  await a.settle(GRACE_MS + 400);
  const r = a.current();
  if (r.onspeechstart) r.onspeechstart();
  r.emitAppend("Espera", false);
  await a.settle(120);
  await a.settle(1300);
  await say(a, "mejor manana");
  await a.settle(GRACE_MS + 4000);

  assert.strictEqual(a.voiceActive(), true, "voice died");
  assert.strictEqual(a.muted(), false, "voice ended up muted on its own");
  const before = a.turnRequests().length;
  await say(a, "Mandame la factura");
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.turnRequests().length, before + 1, "the next turn did not go through");
  assert.strictEqual(a.turnRequests().slice(-1)[0].body.message, "Mandame la factura");
});

/* -- The SILENCIADO bug --------------------------------------------------- */
test("Panchita speaking never shows as SILENCIADO", async () => {
  const a = await live("Claro, dime en que te puedo ayudar con eso ahora.");
  await say(a, "Hola Panchita");
  await a.settle(GRACE_MS + 400);
  assert.strictEqual(a.speaking(), true);
  assert.strictEqual(a.state(), "ASSISTANT_SPEAKING");
  assert.strictEqual(a.muted(), false, "she was reported as muted merely for speaking");
  assert.notStrictEqual(a.el("v-state").textContent, "SILENCIADO");
  assert.strictEqual(a.el("chat-hint").textContent.indexOf("silenciado"), -1);
});

test("backgrounding the page does NOT mute the microphone", async () => {
  // This is the reported screenshot: visibilitychange used to call toggleMute,
  // so a screen dim or the notification shade put the UI into SILENCIADO with
  // nobody having tapped anything.
  const a = await live();
  await a.setVisibility("hidden");
  await a.settle(500);
  assert.strictEqual(a.muted(), false, "backgrounding muted the microphone");
  assert.notStrictEqual(a.el("v-state").textContent, "SILENCIADO");

  await a.setVisibility("visible");
  await a.settle(900);
  assert.strictEqual(a.muted(), false);
  assert.strictEqual(a.voiceActive(), true);
  await say(a, "Cierra la orden");
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.turnRequests().length, 1, "voice did not recover after backgrounding");
});

test("only a Silenciar tap produces SILENCIADO, and Reactivar clears it", async () => {
  const a = await live();
  assert.strictEqual(a.muted(), false);
  await a.mute();
  assert.strictEqual(a.state(), "MANUALLY_MUTED");
  assert.strictEqual(a.el("v-state").textContent, "SILENCIADO");
  await a.mute();
  assert.strictEqual(a.muted(), false);
  assert.strictEqual(a.state(), "LISTENING");
  await say(a, "Cierra la orden");
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.turnRequests().length, 1, "voice did not resume after Reactivar");
});

test("the assistant-speaking and muted axes are independent", async () => {
  const a = await live("Claro, dime en que te puedo ayudar con eso ahora.");
  await say(a, "Hola Panchita");
  await a.settle(GRACE_MS + 400);
  assert.strictEqual(a.diag()["assistant speaking"], "true");
  assert.strictEqual(a.diag()["manually muted"], "false");
  await a.mute();                                   // mute WHILE she is speaking
  assert.strictEqual(a.diag()["manually muted"], "true");
  assert.strictEqual(a.speaking(), false, "muting did not stop her audio");
  assert.strictEqual(a.state(), "MANUALLY_MUTED");
});
