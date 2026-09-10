"use strict";
/*
 * Lifecycle regression tests for the failure seen on the phone:
 *
 *   Recognition worked, Luis's speech was transcribed and answered, and then
 *   SpeechRecognition returned `not-allowed`. The app declared the microphone
 *   permission revoked and killed the whole voice session -- a claim it had
 *   no evidence for, since the microphone had demonstrably just worked.
 *
 * Also covers the probe/start ordering asymmetry found in the same pass:
 * startVoice() started the recogniser inside probe.then(), while page.visible
 * and unmute fired getUserMedia and started synchronously, so the probe's own
 * getTracks().stop() could land underneath a running recogniser.
 */
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("./harness.js");

const RESTART_MS = 350;

/* The harness's normal start(), so a test can re-enable successful starts
   after having forced rejections. */
function OrigStart(a) {
  return function () {
    this.started++;
    this.live = true;
    const gen = ++this._startGen;
    a.clock.setTimeout(() => {
      if (gen !== this._startGen || !this.live) return;
      if (this.onstart) this.onstart();
      if (this.onaudiostart) this.onaudiostart();
    }, 200);
  };
}

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
  await a.settle(500);
  return a;
}

/* Give this session a demonstrated working microphone. */
async function proveAudioWorks(a, opts) {
  const o = opts || {};
  const r = a.current();
  if (r.onspeechstart) r.onspeechstart();
  a.current().emitAppend("Panchita quiero que me ayudes", true);
  await a.settle(80);
  if (o.audioExpected !== false) {
    assert.strictEqual(a.diag()["audio ever flowed"], "true", "audio never flowed in setup");
  }
  // A processed FINAL is on its own proof that this session recognised speech.
  assert.strictEqual(a.diag()["finals ever"], "true", "no FINAL was processed in setup");
}

/* -- 1. Genuine permission denial is preserved ---------------------------- */
test("not-allowed BEFORE any audio is still a real permission denial", async () => {
  const a = app();
  await a.login();
  a.denyMic(true);                       // the probe itself is refused
  await a.startVoice();
  await a.settle(600);
  assert.strictEqual(a.voiceActive(), false, "voice should stop on a genuine denial");
  assert.ok(a.messages().some((m) => /Permiso de micr[oó]fono denegado/i.test(m)),
    "the real permission-denied message was not shown: " + JSON.stringify(a.messages()));
});

test("not-allowed from the recogniser before any audio is a real denial too", async () => {
  // spinUpMs keeps the engine from ever reporting onstart/onaudiostart, which
  // is what a start rejected outright actually looks like.
  const a = app({ spinUpMs: 100000 });
  await a.login();
  await a.startVoice();
  await a.settle(600);
  assert.strictEqual(a.diag()["audio ever flowed"], "false", "audio flowed unexpectedly");
  assert.strictEqual(a.diag()["finals ever"], "false");
  a.current().fireError("not-allowed");
  await a.settle(800);
  assert.strictEqual(a.voiceActive(), false, "a genuine denial should stop voice");
  assert.ok(a.messages().some((m) => /Permiso de micr[oó]fono denegado/i.test(m)));
});

/* -- 2. After working audio, it is NOT a permission claim ----------------- */
test("not-allowed AFTER working audio does not claim revoked permission", async () => {
  const a = await live();
  await proveAudioWorks(a);
  a.current().fireError("not-allowed");
  await a.settle(120);

  assert.ok(!a.messages().some((m) => /Permiso de micr[oó]fono denegado/i.test(m)),
    "falsely reported revoked permission: " + JSON.stringify(a.messages()));
  assert.strictEqual(a.voiceActive(), true, "the whole voice session was killed");
  assert.strictEqual(a.stat("not-allowed after audio"), 1);
});

/* -- 3. Exactly one automatic retry --------------------------------------- */
test("exactly one automatic retry follows, and it is traced", async () => {
  const a = await live();
  await proveAudioWorks(a);
  const startsBefore = a.recognizers.length;
  a.current().fireError("not-allowed");
  await a.settle(RESTART_MS + 600);

  assert.ok(a.traceHas("not-allowed.retry"), "the automatic retry was not traced");
  assert.strictEqual(a.recognizers.length, startsBefore + 1,
    "expected exactly one new recogniser, got " + (a.recognizers.length - startsBefore));
  assert.strictEqual(a.voiceActive(), true);
  assert.strictEqual(a.diag()["awaiting gesture"].indexOf("false"), 0,
    "should not be waiting for a gesture after only one rejection");
});

/* -- 4. A second rejection requires a user gesture ------------------------ */
test("a second rejection stops retrying and asks for a tap", async () => {
  // Long spin-up: every start attempt is rejected before onstart, exactly as
  // Android does when it refuses the operation.
  const a = await live({ spinUpMs: 100000 });
  await proveAudioWorks(a, { audioExpected: false });
  a.current().fireError("not-allowed");
  await a.settle(RESTART_MS + 600);
  const afterFirst = a.recognizers.length;

  a.current().fireError("not-allowed");   // the retry is rejected too
  await a.settle(RESTART_MS + 1500);

  assert.ok(a.traceHas("gesture.required"), "the gesture gate was not entered");
  assert.strictEqual(a.state(), "AWAITING_USER_GESTURE", "state was " + a.state());
  assert.strictEqual(a.el("v-state").textContent, "EN PAUSA");
  assert.strictEqual(a.el("chat-hint").textContent, "Toca el micrófono para continuar.");
  assert.strictEqual(a.muted(), false, "the gesture pause must not read as muted");
  assert.strictEqual(a.voiceActive(), true, "voice was ended instead of paused");
  assert.ok(!a.messages().some((m) => /Permiso de micr[oó]fono denegado/i.test(m)),
    "still claimed revoked permission");

  // And it must NOT keep retrying by itself.
  const settled = a.recognizers.length;
  await a.settle(8000);
  assert.strictEqual(a.recognizers.length, settled,
    "kept retrying automatically: " + (a.recognizers.length - settled) + " more");
  assert.ok(settled <= afterFirst + 1, "retried more than once before the gate");
});

test("tapping the microphone resumes from the gesture gate", async () => {
  const a = await live({ spinUpMs: 100000 });
  await proveAudioWorks(a, { audioExpected: false });
  a.current().fireError("not-allowed");
  await a.settle(RESTART_MS + 600);
  a.current().fireError("not-allowed");
  await a.settle(RESTART_MS + 1200);
  assert.strictEqual(a.state(), "AWAITING_USER_GESTURE");
  const before = a.recognizers.length;

  a.el("mic-btn").fire("click");          // the tap IS the user activation
  await a.settle(900);

  assert.ok(a.traceHas("gesture.resume"), "the resume was not traced");
  assert.strictEqual(a.voiceActive(), true, "the tap ended voice instead of resuming");
  assert.strictEqual(a.diag()["awaiting gesture"].indexOf("false"), 0,
    "still waiting for a gesture after the tap");
  assert.ok(a.recognizers.length > before, "the tap did not start a recogniser");
  assert.ok(a.sessionRows().some((r) => /via=gesture/.test(r)),
    "the gesture start is not in the ledger");
});

test("a gesture resume produces a real, started session", async () => {
  // Test 37 proves the tap starts a recogniser when every start is being
  // rejected. This one lets the start succeed and checks the session actually
  // comes up: started=Y in the ledger, and the page listening again.
  const a = await live({ spinUpMs: 100000 });
  await proveAudioWorks(a, { audioExpected: false });
  a.current().fireError("not-allowed");
  await a.settle(RESTART_MS + 600);
  a.current().fireError("not-allowed");
  await a.settle(RESTART_MS + 1200);
  assert.strictEqual(a.state(), "AWAITING_USER_GESTURE");

  // From here on, starts succeed again.
  a.sandbox.window.SpeechRecognition.prototype.start = OrigStart(a);
  a.el("mic-btn").fire("click");
  await a.settle(1200);

  assert.strictEqual(a.diag()["awaiting gesture"].indexOf("false"), 0,
    "still gated after a successful resume");
  assert.ok(a.sessionRows().some((r) => /via=gesture/.test(r)),
    "no gesture session in the ledger: " + JSON.stringify(a.sessionRows().slice(0, 3)));
  assert.strictEqual(a.voiceActive(), true);
  assert.strictEqual(a.muted(), false);
});

/* -- 5 & 6. Probe completes before the recogniser starts ------------------ */
test("page.visible waits for the probe before starting the recogniser", async () => {
  const a = await live();
  await a.setVisibility("hidden");
  await a.settle(300);
  a.resetMicOrder();
  await a.setVisibility("visible");
  await a.settle(900);

  const order = a.micOrder();
  const start = order.indexOf("rec.start");
  const resolved = order.indexOf("probe.resolved");
  const stopped = order.indexOf("probe.stop");
  assert.ok(start >= 0, "the recogniser never started: " + JSON.stringify(order));
  assert.ok(resolved >= 0 && resolved < start,
    "started before the probe resolved: " + JSON.stringify(order));
  assert.ok(stopped >= 0 && stopped < start,
    "the temporary stream was stopped underneath a running recogniser: " + JSON.stringify(order));
});

test("unmute waits for the probe before starting the recogniser", async () => {
  const a = await live();
  await a.mute();
  a.resetMicOrder();
  await a.mute();
  await a.settle(900);

  const order = a.micOrder();
  const start = order.indexOf("rec.start");
  const resolved = order.indexOf("probe.resolved");
  const stopped = order.indexOf("probe.stop");
  assert.ok(start >= 0, "the recogniser never started: " + JSON.stringify(order));
  assert.ok(resolved >= 0 && resolved < start,
    "started before the probe resolved: " + JSON.stringify(order));
  assert.ok(stopped >= 0 && stopped < start,
    "the temporary stream was stopped underneath a running recogniser: " + JSON.stringify(order));
});

test("startVoice keeps the ordering it always had", async () => {
  const a = app();
  await a.login();
  a.resetMicOrder();
  await a.startVoice();
  await a.settle(700);
  const order = a.micOrder();
  assert.ok(order.indexOf("probe.resolved") < order.indexOf("rec.start"),
    "startVoice regressed: " + JSON.stringify(order));
});

/* -- C. rec.error carries id, via and what the session had achieved ------- */
test("rec.error records instance, call site and session evidence", async () => {
  const a = await live();
  await proveAudioWorks(a);
  a.current().fireError("network");
  await a.settle(200);
  const line = a.trace().find((l) => l.indexOf("rec.error") >= 0);
  assert.ok(line, "rec.error was not traced");
  assert.match(line, /#\d+/, "no recogniser id: " + line);
  assert.match(line, /via=\S+/, "no call site: " + line);
  assert.match(line, /audioEver=Y/, "no audio evidence: " + line);
  assert.match(line, /finEver=Y/, "no finals evidence: " + line);
  assert.match(line, /retry=\d+/, "no retry number: " + line);
});

/* -- 4 (ledger). A rejected start still appears -------------------------- */
test("a start rejected before onstart still gets a ledger row", async () => {
  const a = await live();
  await proveAudioWorks(a);
  const before = a.sessionRows().length;
  a.current().fireError("not-allowed");
  await a.settle(RESTART_MS + 600);
  const rows = a.sessionRows();
  assert.ok(rows.length > before, "the retry attempt produced no ledger row");
  assert.ok(rows.some((r) => /via=not-allowed\.retry/.test(r)),
    "the retry's call site is not in the ledger: " + JSON.stringify(rows.slice(0, 3)));
});

test("every restart path names itself in the ledger", async () => {
  const a = await live();
  a.current().androidNoSpeech();
  await a.settle(900);
  assert.ok(a.sessionRows().some((r) => /via=onend/.test(r)),
    "the onend restart is unattributed: " + JSON.stringify(a.sessionRows().slice(0, 3)));
});

/* -- 7. The rollback stays in place --------------------------------------- */
test("HOLD_MIC_STREAM is still false and the restart delay is still 350ms", async () => {
  const a = await live();
  assert.strictEqual(a.diag()["hold mic stream"].indexOf("false"), 0,
    "the held stream was re-enabled: " + a.diag()["hold mic stream"]);
  assert.strictEqual(a.diag()["restart delay"], "350ms");
  assert.strictEqual(a.micStreamsOpen(), 0, "a capture stream is being held");
});

test("the turn-boundary window was NOT touched by this change", async () => {
  const a = await live();
  assert.strictEqual(a.diag()["silence grace"], "1800ms (resets on speech)");
});
