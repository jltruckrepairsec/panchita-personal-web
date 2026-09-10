"use strict";
/*
 * The behaviour the offline suite was missing, and the two failures it hid.
 *
 * Android Chrome ends the SpeechRecognition session at its OWN endpointer even
 * with continuous = true. Every natural pause therefore tears the session down;
 * the page must rebuild it, and it is deaf for the whole rebuild. The old
 * harness kept one session alive forever, so a green suite still shipped a
 * build that cut Luis off mid-sentence on the phone.
 *
 * These tests drive that teardown explicitly.
 */
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("./harness.js");

const GRACE_MS = 1800;      // TURN_SILENCE_MS
const SPIN_UP_MS = 250;     // engine start-up before audio flows

function app(extra) {
  return createApp(Object.assign({
    gateway: (p) => p.factor_provided !== undefined
      ? { status: "completed", session_token: "test-session-1", human_readable_response: "Hola Luis." }
      : { status: "completed", human_readable_response: "Listo." }
  }, extra || {}));
}

async function live(extra) {
  const a = app(extra);
  await a.login();
  await a.startVoice();
  await a.settle(400);              // let the first session spin up
  return a;
}

/* Speak a phrase, then let Android tear the session down as it really does. */
async function sayThenAndroidEndpoint(a, phrase, wordMs) {
  const r = a.current();
  if (r.onspeechstart) r.onspeechstart();
  let acc = "";
  for (const w of phrase.split(" ")) {
    acc = acc ? acc + " " + w : w;
    a.current().emitAppend(acc, false);
    await a.settle(wordMs || 160);
  }
  a.current().emitAppend(acc, true);
  await a.settle(40);
  r.androidEndpoint();              // <-- the session dies here, every time
  return acc;
}

/* -- THE REPORTED PHONE FAILURE ------------------------------------------ */
test("REPRO: a natural pause does not split the sentence into two turns", async () => {
  // Exactly what Luis said:
  //   "Panchita quiero que me ayudes... [natural pause] ...las citas de manana"
  // The phone submitted the first half, answered, and made the second half a
  // separate turn.
  const a = await live();
  await sayThenAndroidEndpoint(a, "Panchita quiero que me ayudes");

  // The pause. Measured: the build that failed on the phone splits the
  // sentence at 1600ms; this one holds to 2200ms. 2000ms is inside that gap,
  // so this test fails on the old build and passes on the new one.
  await a.settle(2000);
  assert.strictEqual(a.turnRequests().length, 0,
    "cut off mid-sentence: " + JSON.stringify(a.turnRequests().map((q) => q.body.message)));

  // He resumes. A new session is running by now.
  await sayThenAndroidEndpoint(a, "las citas de manana");
  await a.settle(GRACE_MS + 800);

  const msgs = a.turnRequests().map((q) => q.body.message);
  assert.strictEqual(msgs.length, 1,
    "the sentence was split into " + msgs.length + " turns: " + JSON.stringify(msgs));
  assert.match(msgs[0], /Panchita quiero que me ayudes/);
  assert.match(msgs[0], /las citas de manana/);
});

test("the silence countdown is frozen while the microphone is deaf", async () => {
  const a = await live();
  await sayThenAndroidEndpoint(a, "Necesito que revises");
  await a.settle(60);
  assert.ok(a.traceHas("timer.freeze"), "the countdown kept running through the deaf gap");
  assert.strictEqual(a.diag()["timer left"].indexOf("FROZEN") >= 0, true,
    "timer not reported frozen: " + a.diag()["timer left"]);

  await a.settle(600);              // restart + spin-up
  assert.ok(a.traceHas("timer.resume"), "the countdown never resumed");
  assert.strictEqual(a.diag()["timer left"].indexOf("FROZEN") >= 0, false);
  assert.strictEqual(a.turnRequests().length, 0, "submitted during the gap");
});

test("a genuinely finished turn still goes through promptly", async () => {
  const a = await live();
  await sayThenAndroidEndpoint(a, "Cierra la orden del jueves");
  await a.settle(GRACE_MS + 900);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Cierra la orden del jueves"]);
});

test("two pauses in one sentence still make one turn", async () => {
  const a = await live();
  await sayThenAndroidEndpoint(a, "Necesito");
  await a.settle(1000);
  await sayThenAndroidEndpoint(a, "que revises");
  await a.settle(1000);
  await sayThenAndroidEndpoint(a, "mis citas de manana");
  await a.settle(GRACE_MS + 900);
  const msgs = a.turnRequests().map((q) => q.body.message);
  assert.strictEqual(msgs.length, 1, "split into " + msgs.length + ": " + JSON.stringify(msgs));
  assert.match(msgs[0], /Necesito que revises mis citas de manana/);
});

test("a turn is never stranded if the recogniser never comes back", async () => {
  const a = await live();
  const r = a.current();
  if (r.onspeechstart) r.onspeechstart();
  a.current().emitAppend("Cierra la orden", true);
  await a.settle(40);
  r.failNextStart = true;           // and the replacement never starts either
  a.sandbox.window.SpeechRecognition.prototype.start = function () { this.started++; };
  r.androidEndpoint();
  await a.settle(12000);
  assert.strictEqual(a.turnRequests().length, 1,
    "the buffered turn was stranded by a frozen countdown");
});

/* -- IDLE CHURN: the click suspects -------------------------------------- */
test("idle churn is counted so the phone can be compared against it", async () => {
  const a = await live();
  // Five Android silence teardowns, the loop that runs while nobody speaks.
  for (let i = 0; i < 5; i++) {
    a.current().androidNoSpeech();
    await a.settle(700);
  }
  assert.ok(a.stat("restarts") >= 5, "restarts not counted: " + a.stat("restarts"));
  assert.ok(a.stat("no-speech") >= 5, "no-speech ends not counted: " + a.stat("no-speech"));
  assert.notStrictEqual(a.diag()["restart rate"], undefined);
  assert.ok(a.traceHas("rec.restart"), "restarts are not in the trace");
  assert.strictEqual(a.turnRequests().length, 0, "idle churn submitted something");
  assert.strictEqual(a.voiceActive(), true, "idle churn killed the session");
});

/* DEFAULT: the 149d94e path. The page probes permission and hands the device
   straight back, so SpeechRecognition owns the microphone outright. This is
   the controlled diagnostic rollback, not a confirmed fix. */
test("by default the mic is probed and released, never held", async () => {
  const a = await live();
  assert.strictEqual(a.diag()["hold mic stream"].indexOf("false"), 0,
    "the switch is not defaulting off: " + a.diag()["hold mic stream"]);
  assert.strictEqual(a.micStreamsOpen(), 0, "a capture stream is being held by default");
  for (let i = 0; i < 6; i++) {
    a.current().androidNoSpeech();
    await a.settle(700);
  }
  assert.strictEqual(a.micStreamsOpen(), 0, "a restart left a capture stream open");
  assert.strictEqual(a.diag()["restart delay"], "350ms",
    "restart delay is not back on the known-good value");
});

/* The click hypothesis, still available behind the switch. */
test("with the switch on, the stream is held across restarts", async () => {
  const a = await live({ holdMicStream: true });
  const before = a.micAcquisitions();
  for (let i = 0; i < 6; i++) {
    a.current().androidNoSpeech();
    await a.settle(700);
  }
  assert.strictEqual(a.micAcquisitions(), before,
    "the mic was re-acquired " + (a.micAcquisitions() - before) + " times across restarts");
  assert.strictEqual(a.diag()["mic stream held"], "true", "no stream is being held");
});

test("with the switch on, mute and End voice release the held stream", async () => {
  const a = await live({ holdMicStream: true });
  assert.strictEqual(a.micStreamsOpen(), 1, "no stream held while listening");
  await a.mute();
  assert.strictEqual(a.micStreamsOpen(), 0, "mute did not release the microphone");
  await a.mute();
  await a.settle(400);
  assert.strictEqual(a.micStreamsOpen(), 1, "unmute did not re-acquire the microphone");
  await a.endVoice();
  assert.strictEqual(a.micStreamsOpen(), 0, "End voice did not release the microphone");
});

test("backgrounding never leaves a capture open, either way", async () => {
  for (const hold of [false, true]) {
    const a = await live({ holdMicStream: hold });
    await a.setVisibility("hidden");
    await a.settle(300);
    assert.strictEqual(a.micStreamsOpen(), 0, "hold=" + hold + ": mic stayed open while backgrounded");
    assert.strictEqual(a.muted(), false, "hold=" + hold + ": backgrounding muted the UI");
    await a.setVisibility("visible");
    await a.settle(600);
    assert.strictEqual(a.micStreamsOpen(), hold ? 1 : 0, "hold=" + hold + ": wrong state on return");
  }
});

/* -- The trace itself ----------------------------------------------------- */
test("the trace records the real event order with timings and no full transcripts", async () => {
  const a = await live();
  await sayThenAndroidEndpoint(a, "Panchita quiero que me ayudes con las citas de manana de mi taller");
  await a.settle(700);
  const lines = a.trace();
  assert.ok(lines.length > 4, "trace is empty");
  for (const name of ["rec.start", "speech.start", "FINAL", "speech.end", "rec.end", "rec.restart"]) {
    assert.ok(lines.some((l) => l.indexOf(name) >= 0), "trace is missing " + name);
  }
  assert.ok(lines.every((l) => /\+\s*\d+ms/.test(l)), "trace lines carry no timing");
  // Transcripts are truncated, so the panel cannot become a transcript log.
  assert.ok(!lines.some((l) => l.indexOf("citas de manana de mi taller") >= 0),
    "the trace printed a full transcript");
});

/* -- Grace that costs a finished sentence nothing -------------------------- */
test("a turn left hanging on a dangling word waits much longer", async () => {
  // "quiero que me ayudes CON..." cannot be the end of a sentence, so the
  // pause after it is Luis thinking. Measured tolerance: 3800ms, against
  // 2200ms for a turn that sounds complete.
  const a = await live();
  await sayThenAndroidEndpoint(a, "Quiero que me ayudes con");
  await a.settle(120);
  assert.match(a.diag()["dangling extra"], /ACTIVE/,
    "the dangling-word grace did not engage: " + a.diag()["dangling extra"]);
  await a.settle(2600);
  assert.strictEqual(a.turnRequests().length, 0,
    "cut off after a dangling word: " + JSON.stringify(a.turnRequests().map((q) => q.body.message)));
  await sayThenAndroidEndpoint(a, "las citas de manana");
  await a.settle(GRACE_MS + 900);
  const msgs = a.turnRequests().map((q) => q.body.message);
  assert.strictEqual(msgs.length, 1, "split into " + msgs.length + ": " + JSON.stringify(msgs));
  assert.match(msgs[0], /Quiero que me ayudes con las citas de manana/);
});

test("a complete-sounding turn gets NO extra delay", async () => {
  const a = await live();
  await sayThenAndroidEndpoint(a, "Cierra la orden del jueves");
  await a.settle(120);
  assert.strictEqual(a.diag()["dangling extra"], "0ms",
    "a finished sentence was given the thinking-pause grace");
  await a.settle(GRACE_MS + 900);
  assert.strictEqual(a.turnRequests().length, 1, "the finished turn did not go through");
});

/* -- The instrumentation must be able to name the failure ----------------- */
test("a transcript dropped by the stale guard is reported, not silently lost", async () => {
  // The exact blind spot from the last physical test: results arriving on a
  // recogniser the session no longer owns. Previously this bumped a shared
  // counter and wrote nothing, so it was indistinguishable from "no audio".
  const a = await live();
  const orphan = a.current();
  orphan.failNextStart = true;
  orphan.androidEndpoint();
  await a.settle(1200);                       // page builds a replacement
  assert.notStrictEqual(a.current(), orphan, "the recogniser was not replaced");

  orphan.emitAppend("Panchita quiero que me ayudes", true);   // late, on the old one
  await a.settle(300);

  assert.strictEqual(a.stat("TRANSCRIPTS LOST (stale onresult)"), 1,
    "a lost transcript was not counted");
  assert.ok(a.traceHas("STALE.onresult"), "the stale onresult was not traced");
  assert.ok(a.traceHas("LOST.transcript"), "the lost text was not traced");
  assert.match(a.diag()["stale total"], /onresult=1/,
    "the per-handler breakdown does not name onresult: " + a.diag()["stale total"]);
});

test("the session ledger separates 'got the mic and heard nothing' from 'no mic'", async () => {
  const a = await live();
  // A session that opens an audio route and hears nothing -- the phone's case.
  a.current().androidNoSpeech();
  await a.settle(900);
  const rows = a.diag.sessionRows ? a.diag.sessionRows() : a.sessionRows();
  assert.ok(rows.length >= 1, "no session rows");
  assert.ok(rows.some((r) => /audio=Y/.test(r) && /spch=0/.test(r) && /fin=0/.test(r)),
    "no row describing a session that got the mic and heard nothing: " + JSON.stringify(rows));

  // And a session that does hear something must read differently.
  await sayThenAndroidEndpoint(a, "Cierra la orden");
  await a.settle(400);
  const rows2 = a.sessionRows();
  assert.ok(rows2.some((r) => /spch=[1-9]/.test(r) || /fin=[1-9]/.test(r)),
    "a session with real speech is indistinguishable: " + JSON.stringify(rows2));
});

test("the session-start trace is pinned and cannot scroll away", async () => {
  const a = await live();
  for (let i = 0; i < 40; i++) {            // flood the ring far past its size
    a.current().androidNoSpeech();
    await a.settle(420);
  }
  const head = a.traceHeadLines();
  assert.ok(head.some((l) => l.indexOf("voice.start") >= 0),
    "voice.start scrolled out of the pinned head: " + JSON.stringify(head.slice(0, 4)));
  assert.ok(head.some((l) => l.indexOf("mic.probe") >= 0 || l.indexOf("mic.hold") >= 0),
    "the microphone decision scrolled away");
});

test("each restart records which call site caused it", async () => {
  const a = await live();
  a.current().androidNoSpeech();
  await a.settle(900);
  assert.ok(a.traceHas("via onend"), "the restart source was not recorded");
});
