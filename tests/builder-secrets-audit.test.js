"use strict";
/*
 * "No secrets anywhere" and "every change has an audit trail", as tests.
 */
const test = require("node:test");
const assert = require("node:assert");
const secrets = require("../builder/src/secrets.js");
const audit = require("../builder/src/audit.js");

/* Test fixtures below are shaped like credentials but are not credentials:
   they are literal nonsense chosen to trip the detector. */
const FAKE = {
  anthropic: "sk-ant-" + "A".repeat(24),
  aws: "AKIA" + "B".repeat(16),
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r",
  bearer: "Bearer " + "c".repeat(32),
  n8n: "n8n_api_" + "d".repeat(24),
  github: "ghp_" + "e".repeat(30),
  google: "AIza" + "f".repeat(32),
  urlcreds: "https://user:hunter2@example.invalid/hook"
};

test("credential-shaped values are detected wherever they hide", () => {
  Object.keys(FAKE).forEach((k) => {
    const found = secrets.blockingFindings({ deep: { nested: [{ text: FAKE[k] }] } });
    assert.ok(found.length > 0, k + " should be detected");
  });
});

test("an inline credential assignment in free text is blocked", () => {
  assert.ok(secrets.blockingFindings("the password: correcthorse").length > 0);
  assert.ok(secrets.blockingFindings("factor_provided=abcd1234").length > 0);
  assert.ok(secrets.blockingFindings({ note: "api_key: zzzzzzzzzz" }).length > 0);
});

test("ordinary Spanish and English prose is not flagged", () => {
  [
    "Panchita, mejora tu memoria para que recuerdes lo que hablamos ayer.",
    "Improve your memory so you remember what we discussed yesterday.",
    "Add a capability to summarize the shop's open work orders."
  ].forEach((t) => assert.deepStrictEqual(secrets.blockingFindings(t), [], "false positive on: " + t));
});

test("a private key block is blocked", () => {
  assert.ok(secrets.blockingFindings("-----BEGIN RSA PRIVATE KEY-----\nzzzz\n").length > 0);
});

test("sensitive field names are redacted, not merely reported", () => {
  const out = secrets.redact({
    session_id: "abc123",
    password: "whatever",
    nested: { access_token: "t", authorization: "Basic zzz" },
    keep: "visible"
  });
  assert.strictEqual(out.session_id, secrets.MASK);
  assert.strictEqual(out.password, secrets.MASK);
  assert.strictEqual(out.nested.access_token, secrets.MASK);
  assert.strictEqual(out.nested.authorization, secrets.MASK);
  assert.strictEqual(out.keep, "visible");
});

test("redact never mutates its input", () => {
  const input = { password: "secret-value", nested: { token: "t" } };
  const copy = JSON.parse(JSON.stringify(input));
  secrets.redact(input);
  assert.deepStrictEqual(input, copy);
});

test("assertClean throws on a credential and passes on a sensitive key name", () => {
  assert.throws(() => secrets.assertClean({ x: FAKE.anthropic }), /credential/i);
  assert.strictEqual(secrets.assertClean({ session_id: "opaque-reference" }), true);
});

test("a circular structure is refused rather than followed", () => {
  const a = { name: "a" };
  a.self = a;
  assert.throws(() => secrets.assertClean(a), /credential/i);
});

/* ---- audit chain -------------------------------------------------------- */

function chain() {
  let log = audit.createLog("bt-test");
  log = audit.append(log, { event: "TASK_CREATED", actor: "builder", to_state: "DRAFT" });
  log = audit.append(log, { event: "SPECIFY", actor: "builder", from_state: "DRAFT", to_state: "SPECIFIED" });
  log = audit.append(log, { event: "PLAN", actor: "builder", from_state: "SPECIFIED", to_state: "PLANNED" });
  return log;
}

test("a well-formed chain verifies", () => {
  const log = chain();
  assert.deepStrictEqual(audit.verify(log), { valid: true, broken_at: null, reason: null });
  assert.strictEqual(log.entries.length, 3);
  assert.strictEqual(log.entries[0].prev_hash, audit.GENESIS_HASH);
  assert.strictEqual(log.entries[1].prev_hash, log.entries[0].hash);
});

test("editing a recorded entry breaks the chain", () => {
  const log = chain();
  const tampered = {
    task_id: log.task_id,
    entries: log.entries.map((e, i) => (i === 1 ? Object.assign({}, e, { event: "APPROVE_PLAN" }) : e))
  };
  const v = audit.verify(tampered);
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.broken_at, 1);
  assert.strictEqual(v.reason, "content_tampered");
});

test("removing an entry breaks the chain", () => {
  const log = chain();
  const truncated = { task_id: log.task_id, entries: [log.entries[0], log.entries[2]] };
  const v = audit.verify(truncated);
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.reason, "sequence_gap");
});

test("re-hashing a tampered entry still breaks the chain at the next link", () => {
  const log = chain();
  const forged = Object.assign({}, log.entries[1], { event: "APPROVE_PLAN" });
  forged.hash = audit.sha256(audit.canonical(Object.assign({}, forged, { hash: undefined })));
  /* Recompute the way append() does, so the entry is self-consistent... */
  const rebuilt = Object.assign({}, forged);
  delete rebuilt.hash;
  forged.hash = audit.sha256(audit.canonical(rebuilt));
  const tampered = { task_id: log.task_id, entries: [log.entries[0], forged, log.entries[2]] };
  const v = audit.verify(tampered);
  /* ...and the entry after it no longer points at the right predecessor. */
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.broken_at, 2);
  assert.strictEqual(v.reason, "chain_break");
});

test("recorded entries are frozen, so an in-place edit does not take", () => {
  const log = chain();
  assert.throws(() => { log.entries[0].event = "HACKED"; }, TypeError);
  assert.throws(() => { log.entries.push({}); }, TypeError);
  assert.strictEqual(audit.verify(log).valid, true);
});

test("appending returns a new log and leaves the old one intact", () => {
  const one = chain();
  const two = audit.append(one, { event: "PROVISION", actor: "builder" });
  assert.strictEqual(one.entries.length, 3);
  assert.strictEqual(two.entries.length, 4);
  assert.strictEqual(audit.verify(one).valid, true);
  assert.strictEqual(audit.verify(two).valid, true);
});

test("the audit log cannot become the leak", () => {
  const log = audit.createLog("bt-test");
  assert.throws(
    () => audit.append(log, { event: "X", actor: "builder", detail: { note: FAKE.jwt } }),
    /credential/i
  );
  const masked = audit.append(log, { event: "X", actor: "builder", detail: { session_id: "opaque" } });
  assert.strictEqual(masked.entries[0].detail.session_id, secrets.MASK);
});

test("an entry with no event or no actor is refused", () => {
  const log = audit.createLog("bt-test");
  assert.throws(() => audit.append(log, { actor: "builder" }), /event/i);
  assert.throws(() => audit.append(log, { event: "X" }), /actor/i);
});

test("canonical form is stable across key order", () => {
  assert.strictEqual(audit.canonical({ a: 1, b: [2, { d: 4, c: 3 }] }), audit.canonical({ b: [2, { c: 3, d: 4 }], a: 1 }));
});
