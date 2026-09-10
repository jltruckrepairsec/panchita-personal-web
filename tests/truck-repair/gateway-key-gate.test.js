'use strict';
// Offline proof of the gateway key gate deployed on both public webhooks
// (hardening fix 2, 2026-09-10).
//
// The verification logic below is character-for-character the logic in the
// "Verify Gateway Key" Code node in Panchita Core v0.2 and the GHL Voice
// Bridge. It is exercised here with LOCALLY GENERATED test values -- the
// production secret is never stored in this repository, and never should be.
//
// What this proves: the algorithm accepts exactly the right key and fails
// closed on everything else. What it does NOT prove: that the gate is wired
// in front of the right nodes in n8n. That was proven live -- executions 1655
// (bridge, no key -> 401, trust boundary never ran) and 1656 (Core, forged
// owner claim, no key -> 401, Core Pipeline never ran).

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// --- verbatim from the deployed Code node -----------------------------------
function verify(SALT, VERIFIER_HASH, item) {
  const headers = (item.headers && typeof item.headers === 'object') ? item.headers : {};
  const presented = typeof headers['x-panchita-key'] === 'string' ? headers['x-panchita-key'] : '';

  let authOk = false;
  if (presented.length > 0) {
    const computed = crypto.createHash('sha256').update(SALT + presented).digest('hex');
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(VERIFIER_HASH, 'utf8');
    authOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return authOk;
}
// ---------------------------------------------------------------------------

// Test-only key material, generated here. Not the production key.
const SECRET = 'pk_' + crypto.randomBytes(24).toString('hex');
const SALT = crypto.randomBytes(16).toString('hex');
const HASH = crypto.createHash('sha256').update(SALT + SECRET).digest('hex');

const check = (item) => verify(SALT, HASH, item);

test('the correct key is accepted', () => {
  assert.strictEqual(check({ headers: { 'x-panchita-key': SECRET } }), true);
});

test('a missing header fails closed', () => {
  assert.strictEqual(check({ headers: {} }), false);
  assert.strictEqual(check({}), false);
});

test('an empty or whitespace key fails closed', () => {
  assert.strictEqual(check({ headers: { 'x-panchita-key': '' } }), false);
  assert.strictEqual(check({ headers: { 'x-panchita-key': '   ' } }), false);
});

test('a wrong key fails closed, including near misses', () => {
  assert.strictEqual(check({ headers: { 'x-panchita-key': 'pk_wrong' } }), false);
  // one character short
  assert.strictEqual(check({ headers: { 'x-panchita-key': SECRET.slice(0, -1) } }), false);
  // one character extra
  assert.strictEqual(check({ headers: { 'x-panchita-key': SECRET + 'a' } }), false);
  // correct length, last character flipped
  const flipped = SECRET.slice(0, -1) + (SECRET.slice(-1) === 'a' ? 'b' : 'a');
  assert.strictEqual(check({ headers: { 'x-panchita-key': flipped } }), false);
});

test('the verifier hash itself is not usable as the key', () => {
  // The whole point of storing a verifier rather than the secret: what an
  // attacker could read out of the workflow JSON cannot be replayed.
  assert.strictEqual(check({ headers: { 'x-panchita-key': HASH } }), false);
  assert.strictEqual(check({ headers: { 'x-panchita-key': SALT } }), false);
  assert.strictEqual(check({ headers: { 'x-panchita-key': SALT + HASH } }), false);
});

test('a non-string header value fails closed rather than throwing', () => {
  for (const bad of [null, undefined, 42, true, {}, [], { toString: () => SECRET }]) {
    assert.strictEqual(check({ headers: { 'x-panchita-key': bad } }), false);
  }
});

test('the header name is matched exactly as n8n lowercases it', () => {
  // n8n lowercases inbound header names; a differently-cased key in the item
  // is therefore not the header we verify, and must not authenticate.
  assert.strictEqual(check({ headers: { 'X-Panchita-Key': SECRET } }), false);
  assert.strictEqual(check({ headers: { 'x-panchita-key': SECRET } }), true);
});

test('the comparison is length-checked before timingSafeEqual', () => {
  // timingSafeEqual throws on unequal lengths; the guard must short-circuit.
  // Any hash string of the wrong length must return false, never throw.
  assert.doesNotThrow(() => verify(SALT, 'deadbeef', { headers: { 'x-panchita-key': SECRET } }));
  assert.strictEqual(verify(SALT, 'deadbeef', { headers: { 'x-panchita-key': SECRET } }), false);
});
