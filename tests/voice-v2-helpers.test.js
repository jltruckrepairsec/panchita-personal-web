"use strict";
/*
 * Unit tests for the pure helper block of voice-v2.html.
 *
 * The helpers are extracted verbatim from the shipped page, so these tests
 * cannot drift away from the code that runs on Luis's phone.
 */
const test = require("node:test");
const assert = require("node:assert");
const { readPureHelpers, createClock } = require("./harness.js");

const H = new Function(
  readPureHelpers() +
  "\nreturn { normalizeSpeech, fnv1a, createDedupe, createEchoGuard," +
  " mergeFinalHypotheses, createTurnAssembler, classifyDenial };"
)();

test("normalizeSpeech folds case, accents and punctuation", () => {
  assert.strictEqual(H.normalizeSpeech("  ¿Panchita, Quiero!  "), "panchita quiero");
  assert.strictEqual(H.normalizeSpeech("Ayúdame"), "ayudame");
  assert.strictEqual(H.normalizeSpeech(null), "");
});

test("mergeFinalHypotheses: cumulative restatement replaces the buffer", () => {
  let buf = "";
  ["Panchita", "Panchita quiero", "Panchita quiero que", "Panchita quiero que me ayudes"]
    .forEach((h) => { buf = H.mergeFinalHypotheses(buf, h); });
  assert.strictEqual(buf, "Panchita quiero que me ayudes");
});

test("mergeFinalHypotheses: restatement match survives punctuation and case drift", () => {
  const buf = H.mergeFinalHypotheses("panchita quiero", "Panchita, quiero que me ayudes");
  assert.strictEqual(buf, "Panchita, quiero que me ayudes");
});

test("mergeFinalHypotheses: a shorter restatement never truncates the turn", () => {
  assert.strictEqual(H.mergeFinalHypotheses("Panchita quiero que", "Panchita"), "Panchita quiero que");
});

test("mergeFinalHypotheses: a genuinely new segment is appended, not dropped", () => {
  assert.strictEqual(
    H.mergeFinalHypotheses("Panchita quiero", "que me ayudes"),
    "Panchita quiero que me ayudes"
  );
});

test("mergeFinalHypotheses: empty inputs are inert", () => {
  assert.strictEqual(H.mergeFinalHypotheses("", "Hola"), "Hola");
  assert.strictEqual(H.mergeFinalHypotheses("Hola", ""), "Hola");
  assert.strictEqual(H.mergeFinalHypotheses("", ""), "");
});

/* ---- the assembler ------------------------------------------------------ */
function assembler(ms) {
  const clock = createClock();
  const emitted = [];
  const a = H.createTurnAssembler(ms, {
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock)
  });
  return { clock, emitted, a, push: (t) => a.pushFinal(t, (x) => emitted.push(x)) };
}

test("one burst of cumulative finals emits exactly one turn", () => {
  const h = assembler(400);
  ["Panchita", "Panchita quiero", "Panchita quiero que", "Panchita quiero que me ayudes"]
    .forEach((t) => { h.push(t); h.clock.tick(30); });
  assert.deepStrictEqual(h.emitted, []);          // nothing while the burst runs
  h.clock.tick(400);
  assert.deepStrictEqual(h.emitted, ["Panchita quiero que me ayudes"]);
});

test("each further hypothesis restarts the window instead of emitting again", () => {
  const h = assembler(400);
  for (let i = 0; i < 20; i++) { h.push("uno".repeat(1) + " ".repeat(0)); h.clock.tick(399); }
  assert.strictEqual(h.emitted.length, 0);
  h.clock.tick(400);
  assert.strictEqual(h.emitted.length, 1);
});

test("two separated turns emit twice", () => {
  const h = assembler(400);
  h.push("Hola Panchita");
  h.clock.tick(500);
  h.push("Cierra la orden");
  h.clock.tick(500);
  assert.deepStrictEqual(h.emitted, ["Hola Panchita", "Cierra la orden"]);
});

test("discard() drops incomplete speech and cancels the pending emit", () => {
  const h = assembler(400);
  h.push("Panchita quiero");
  assert.strictEqual(h.a.hasPending(), true);
  h.a.discard();
  assert.strictEqual(h.a.hasPending(), false);
  h.clock.tick(5000);
  assert.deepStrictEqual(h.emitted, []);
});

test("blank hypotheses never open a turn", () => {
  const h = assembler(400);
  h.push("   "); h.push("");
  h.clock.tick(5000);
  assert.deepStrictEqual(h.emitted, []);
});

/* ---- existing behaviour must not regress -------------------------------- */
test("dedupe still suppresses an identical final inside the window", () => {
  const d = H.createDedupe(15000, 12);
  assert.strictEqual(d.isDuplicate("Hola Panchita", 1000), false);
  d.remember("Hola Panchita", 1000);
  assert.strictEqual(d.isDuplicate("hola, panchita!", 2000), true);
  assert.strictEqual(d.isDuplicate("Hola Panchita", 20000), false);
});

test("echo guard still catches Panchita hearing herself", () => {
  const g = H.createEchoGuard(9000);
  g.spoke("Déjame ver la orden de trabajo", 1000);
  assert.strictEqual(g.isEcho("dejame ver la orden", 2000), true);
  assert.strictEqual(g.isEcho("cierra la factura del jueves", 2000), false);
});

test("denial classification is unchanged", () => {
  assert.strictEqual(H.classifyDenial({ error: { detail: "identity_session_expired" } }), "logout");
  assert.strictEqual(H.classifyDenial({ error: { detail: "rate_limited" } }), "throttle");
  assert.strictEqual(H.classifyDenial({ error: { detail: "no_permission_grant" } }), "forbidden");
  assert.strictEqual(H.classifyDenial({}), "soft");
});
