"use strict";
/*
 * End-to-end regression tests for Voice v2 Android turn assembly.
 *
 * These drive the REAL voice-v2.html script inside a sandbox with a scripted
 * SpeechRecognition and a stubbed Gateway. They exist to prove the properties
 * the deployment gate requires, and they read the page's own diagnostic panel
 * rather than its private state.
 *
 * No network, no credentials, no external service.
 */
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("./harness.js");

const BURST = ["Panchita", "Panchita quiero", "Panchita quiero que", "Panchita quiero que me ayudes"];
const GRACE_MS = 1500;   // TURN_SILENCE_MS in voice-v2.html

async function live(opts) {
  const a = createApp(opts);
  await a.login();
  await a.startVoice();
  return a;
}

/* -- GATE 1: interim hypotheses never reach Gateway ----------------------- */
test("interim hypotheses produce zero Gateway submissions", async () => {
  const a = await live();
  const r = a.current();
  ["Pan", "Panchi", "Panchita qui", "Panchita quiero que me"].forEach((t) => r.emitAppend(t, false));
  await a.settle(5000);
  assert.strictEqual(a.turnRequests().length, 0, "an interim reached Gateway");
  assert.ok(a.stat("interims ignored") >= 4, "interims were not counted as ignored");
});

/* -- GATE 2: one utterance, one submission -------------------------------- */
test("a cumulative final burst produces exactly one Gateway submission", async () => {
  const a = await live();
  const r = a.current();
  for (const t of BURST) { r.emitAppend(t, true); await a.settle(40); }
  await a.settle(GRACE_MS + 200);
  const reqs = a.turnRequests();
  assert.strictEqual(reqs.length, 1, "expected 1 submission, got " + reqs.length);
  assert.strictEqual(reqs[0].body.message, "Panchita quiero que me ayudes");
});

test("the same burst delivered as independent result events also sends once", async () => {
  const a = await live();
  const r = a.current();
  for (const t of BURST) { r.emitOne(t, true); await a.settle(40); }
  await a.settle(GRACE_MS + 200);
  assert.strictEqual(a.turnRequests().length, 1);
  assert.strictEqual(a.turnRequests()[0].body.message, "Panchita quiero que me ayudes");
});

test("interims interleaved with the cumulative finals change nothing", async () => {
  const a = await live();
  const r = a.current();
  for (const t of BURST) {
    r.emitAppend(t.slice(0, Math.max(1, t.length - 2)), false);
    r.emitAppend(t, true);
    await a.settle(40);
  }
  await a.settle(GRACE_MS + 200);
  assert.strictEqual(a.turnRequests().length, 1);
  assert.strictEqual(a.turnRequests()[0].body.message, "Panchita quiero que me ayudes");
});

/* -- GATE 3: stale recogniser callbacks submit nothing --------------------- */
test("a recogniser replaced after a failed restart submits nothing when it fires late", async () => {
  const a = await live();
  const stale = a.current();
  stale.failNextStart = true;            // Android refuses to reopen this one...
  stale.fireEnd();
  await a.settle(1500);                  // ...so the page builds a fresh recogniser
  assert.ok(a.recognizers.length >= 2, "the page did not replace the recogniser");
  stale.emitAppend("Panchita cierra la orden", true);   // the OLD one fires late
  await a.settle(GRACE_MS + 600);
  assert.strictEqual(a.turnRequests().length, 0, "a stale recogniser submitted");
  assert.ok(a.stat("stale callbacks ignored") >= 1);
});

test("the recogniser replaced by unmute leaves the old one unable to submit", async () => {
  const a = await live();
  const stale = a.current();
  await a.mute();
  await a.mute();                        // unmute builds a fresh recogniser
  assert.ok(a.recognizers.length >= 2, "unmute did not build a new recogniser");
  stale.emitAppend("Panchita borra la orden", true);
  await a.settle(GRACE_MS + 600);
  assert.strictEqual(a.turnRequests().length, 0, "the pre-mute recogniser submitted");
  assert.strictEqual(a.voiceActive(), true);
});

test("a recogniser aborted by mute submits nothing when it fires late", async () => {
  const a = await live();
  const r = a.current();
  await a.mute();
  r.emitAppend("Panchita borra todo", true);
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.turnRequests().length, 0);
});

test("a recogniser aborted by End voice submits nothing when it fires late", async () => {
  const a = await live();
  const r = a.current();
  await a.endVoice();
  r.emitAppend("Panchita borra todo", true);
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.turnRequests().length, 0);
});

test("stale error and end callbacks cannot restart or fail the session", async () => {
  const a = await live();
  const stale = a.current();
  stale.failNextStart = true;
  stale.fireEnd();
  await a.settle(1500);                  // a fresh recogniser now owns the session
  const restartsBefore = a.stat("recogniser restarts");
  stale.fireError("not-allowed");        // would have killed voice before the fix
  stale.fireEnd();
  await a.settle(1500);
  assert.strictEqual(a.stat("recogniser restarts"), restartsBefore, "a stale onend restarted the mic");
  assert.strictEqual(a.voiceActive(), true, "a stale callback tore the session down");
  assert.ok(a.stat("stale callbacks ignored") >= 2);
});

/* -- GATE 4: mute and End voice discard incomplete speech ----------------- */
test("mute discards speech buffered mid-sentence", async () => {
  const a = await live();
  const r = a.current();
  r.emitAppend("Panchita quiero", true);
  await a.settle(100);                   // still inside the coalesce window
  await a.mute();
  await a.settle(GRACE_MS + 800);
  assert.strictEqual(a.turnRequests().length, 0, "muting still submitted the half sentence");
  assert.strictEqual(a.state(), "MANUALLY_MUTED");
});

test("End voice discards speech buffered mid-sentence", async () => {
  const a = await live();
  const r = a.current();
  r.emitAppend("Panchita quiero", true);
  await a.settle(100);
  await a.endVoice();
  await a.settle(GRACE_MS + 800);
  assert.strictEqual(a.turnRequests().length, 0, "ending voice still submitted the half sentence");
  assert.strictEqual(a.voiceActive(), false);
});

/* -- GATE 5: no rate-limit flood ------------------------------------------ */
test("a long dictation with many cumulative finals sends one request", async () => {
  const a = await live();
  const r = a.current();
  const words = ("Panchita quiero que me ayudes a cerrar la orden de trabajo del camion " +
                 "azul que entro el jueves por la manana").split(" ");
  let acc = "";
  for (const w of words) {
    acc = acc ? acc + " " + w : w;
    r.emitAppend(acc, true);
    await a.settle(60);                  // faster than the coalesce window
  }
  await a.settle(GRACE_MS + 300);
  assert.strictEqual(a.turnRequests().length, 1,
    "flood: " + words.length + " hypotheses became " + a.turnRequests().length + " requests");
  assert.strictEqual(a.turnRequests()[0].body.message, acc);
});

test("three real turns send exactly three requests, never more", async () => {
  const a = await live();
  const said = ["Hola Panchita", "Cierra la orden del jueves", "Mandame la factura"];
  for (const phrase of said) {
    const r = a.current();
    let acc = "";
    for (const w of phrase.split(" ")) {
      acc = acc ? acc + " " + w : w;
      r.emitAppend(acc, true);
      await a.settle(50);
    }
    await a.settle(GRACE_MS + 2000);  // let the answer be spoken
  }
  const reqs = a.turnRequests();
  assert.strictEqual(reqs.length, 3, "expected 3, got " + reqs.length);
  assert.deepStrictEqual(reqs.map((q) => q.body.message), said);
});

/* -- GATE 6: continuous listening survives a completed turn ---------------- */
test("the microphone is still listening after a full turn completes", async () => {
  const a = await live();
  const r = a.current();
  for (const t of BURST) { r.emitAppend(t, true); await a.settle(40); }
  await a.settle(GRACE_MS + 3000);
  assert.strictEqual(a.voiceActive(), true, "voice session died after one turn");
  assert.strictEqual(a.phase(), "listening", "phase stuck at " + a.phase());
  assert.strictEqual(a.stat("turns sent"), 1);
});

test("the recogniser is reopened when Android closes it", async () => {
  const a = await live();
  a.current().fireEnd();
  await a.settle(1500);
  assert.ok(a.stat("recogniser restarts") >= 1, "the mic was not reopened");
  assert.strictEqual(a.voiceActive(), true);
});

test("a second turn works after the first one is answered", async () => {
  const a = await live();
  a.current().emitAppend("Hola Panchita", true);
  await a.settle(GRACE_MS + 3000);
  a.current().emitAppend("Cierra la orden", true);
  await a.settle(GRACE_MS + 3000);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Hola Panchita", "Cierra la orden"]);
});

/* -- Barge-in, echo, duplicates ------------------------------------------- */
test("barge-in stops Panchita, and the speech she is interrupted with is not submitted", async () => {
  // The contract changed with the self-echo fix, deliberately: nothing heard
  // while her loudspeaker is live may become a turn, because at that moment
  // her own audio and Luis's are indistinguishable. Barge-in still works --
  // she stops -- and what Luis says once she is silent is an ordinary turn.
  const a = await live();
  a.current().emitAppend("Hola Panchita", true);
  await a.settle(GRACE_MS + 500);
  assert.strictEqual(a.speaking(), true, "she should be speaking by now");

  a.current().emitAppend("Espera", true);          // Luis talks over her
  await a.settle(60);
  assert.strictEqual(a.speaking(), false, "barge-in did not stop her");
  assert.ok(a.stat("barge-ins") >= 1);

  await a.settle(1500);                            // gate opens, mic reset
  assert.strictEqual(a.gate(), "open");
  a.current().emitAppend("mejor manana", true);    // he keeps talking
  await a.settle(GRACE_MS + 2000);

  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Hola Panchita", "mejor manana"]);
});

test("Panchita's own words are never submitted as a turn", async () => {
  const a = await live({
    gateway: (p) => p.factor_provided !== undefined
      ? { status: "completed", session_token: "test-session-1", human_readable_response: "Hola." }
      : { status: "completed", human_readable_response: "La orden del jueves ya esta cerrada" }
  });
  a.current().emitAppend("Como esta la orden", true);
  await a.settle(GRACE_MS + 2000);
  a.current().emitAppend("la orden del jueves ya esta cerrada", true);   // echo
  await a.settle(GRACE_MS + 1500);
  assert.strictEqual(a.turnRequests().length, 1, "an echo was submitted as a turn");
  assert.ok(a.stat("echoes suppressed") >= 1);
});

test("a repeated identical turn is still suppressed", async () => {
  const a = await live();
  a.current().emitAppend("Hola Panchita", true);
  await a.settle(GRACE_MS + 2500);
  a.current().emitAppend("Hola Panchita", true);
  await a.settle(GRACE_MS + 2500);
  assert.strictEqual(a.turnRequests().length, 1);
  assert.ok(a.stat("duplicates suppressed") >= 1);
});

/* -- Text fallback and auth/session boundaries ---------------------------- */
test("typed text still submits, with voice off and with voice on", async () => {
  const a = createApp();
  await a.login();
  a.el("text-input").value = "Cuanto debo de refacciones";
  a.el("send-btn").fire("click");
  await a.settle(500);
  assert.strictEqual(a.turnRequests().length, 1);

  await a.startVoice();
  a.el("text-input").value = "Y de mano de obra";
  a.el("text-input").fire("keydown", { key: "Enter" });
  await a.settle(500);
  assert.deepStrictEqual(a.turnRequests().map((q) => q.body.message),
    ["Cuanto debo de refacciones", "Y de mano de obra"]);
});

test("every voice turn carries the session token and nothing else new", async () => {
  const a = await live();
  a.current().emitAppend("Hola Panchita", true);
  await a.settle(GRACE_MS + 2000);
  const body = a.turnRequests()[0].body;
  assert.deepStrictEqual(Object.keys(body).sort(), ["language", "message", "session_id"]);
  assert.strictEqual(body.session_id, "test-session-1");
});

test("the login handshake payload is unchanged", async () => {
  const a = createApp();
  await a.login();
  const login = a.gatewayCalls[0].body;
  assert.deepStrictEqual(Object.keys(login).sort(),
    ["factor_provided", "language", "message", "phone_hint"]);
  assert.strictEqual(login.phone_hint, "XXX-XXX-1234");
});

test("an expired session still forces re-login and stops voice", async () => {
  let expire = false;
  const a = await live({
    gateway: (p) => {
      if (p.factor_provided !== undefined) {
        return { status: "completed", session_token: "test-session-1", human_readable_response: "Hola." };
      }
      return expire
        ? { status: "denied", error: { detail: "identity_session_expired" }, human_readable_response: "Expiro." }
        : { status: "completed", human_readable_response: "Ok." };
    }
  });
  expire = true;
  a.current().emitAppend("Hola Panchita", true);
  await a.settle(GRACE_MS + 2000);
  assert.strictEqual(a.loggedIn(), false, "an expired session did not return to login");
  assert.strictEqual(a.voiceActive(), false, "voice kept running after session expiry");
});

test("voice cannot start without a session", async () => {
  const a = createApp();
  await a.startVoice();
  await a.settle(500);
  assert.strictEqual(a.voiceActive(), false);
  assert.strictEqual(a.recognizers.length, 0, "a recogniser was opened while logged out");
});

/* -- The page must not claim the long-pause problem is solved -------------- */
test("the silence grace period is declared, and engine endpointing is advisory", async () => {
  const a = await live();
  const diag = a.diag();
  assert.match(diag["silence grace"], /^1500ms \(resets on speech\)$/);
  assert.strictEqual(diag["engine endpointing"], "advisory only (never ends a turn)");
});
