/*
 * ============================================================================
 * Gate 0B test harness -- sustained simulated conversation + abuse bounding
 * ============================================================================
 * Offline, deterministic, zero cost. Virtual clock: no sleeping, no network,
 * no n8n, no provider. Run:  node voice-v2/budget/test-voice-budget.js
 *
 * The bar: legitimate conversation must run far past the current failure point
 * (~2.5 min under the 10-per-5-min rule) while every abusive or runaway
 * pattern stays bounded.
 * ============================================================================
 */

'use strict';

var B = require('./voice-budget.js');

var pass = 0, fail = 0;
var results = [];

function check(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail || '']); }
  else { fail++; results.push(['FAIL', name, detail || '']); }
}

function principal(extra) {
  var base = {
    verified: true,
    identity_id: 'owner-luis',
    tenant_id: 'jl-truck-repair-test',
    session_hash: 'abc123hash',
    session_expires_at: null
  };
  for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
  return base;
}

// Fresh authenticated voice session at t.
function startVoice(state, t) {
  var out = B.decide(state, principal({ lane: 'mint', voice_session_id: 'vs-test' }), t);
  return { state: out.state, vsid: out.verdict.voice_session_id };
}

// ---------------------------------------------------------------------------
// 0. Baseline: reproduce the CURRENT production failure
// ---------------------------------------------------------------------------
(function baselineTextFailure() {
  var s = B.createInitialState('owner-luis', 'jl-truck-repair-test');
  var t = 1000000;
  var allowed = 0, firstDenyAt = null;
  // A voice-paced conversation (one turn every 16s) sent down the TEXT lane,
  // which is exactly what the current frontend does today.
  for (var i = 0; i < 40; i++) {
    var out = B.decide(s, principal({ lane: 'text' }), t);
    s = out.state;
    if (out.verdict.allow) allowed++;
    else if (firstDenyAt === null) firstDenyAt = (t - 1000000) / 1000;
    t += 16000;
  }
  check('baseline: text lane still enforces 10 per 5 min',
    allowed < 40 && firstDenyAt !== null,
    'first denial at ' + firstDenyAt + 's, allowed ' + allowed + '/40');
  check('baseline: failure point is ~2-3 minutes (the reported symptom)',
    firstDenyAt >= 120 && firstDenyAt <= 200,
    'first denial at ' + firstDenyAt + 's');
})();

// ---------------------------------------------------------------------------
// 1. Sustained 5-minute natural conversation on the voice lane
// ---------------------------------------------------------------------------
(function fiveMinutes() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 0, allowed = 0, denied = 0, denials = [];
  var turn = 0;
  // 16s natural cycle => ~19 turns in 5 minutes
  while (t < 5 * 60 * 1000) {
    t += 16000;
    turn++;
    var out = B.decide(s, principal({
      lane: 'voice', voice_session_id: init.vsid, transcript: 'pregunta numero ' + turn
    }), t);
    s = out.state;
    if (out.verdict.allow) allowed++; else { denied++; denials.push(out.verdict.reason); }
  }
  check('5 min natural conversation: every turn allowed',
    denied === 0, allowed + ' allowed, ' + denied + ' denied' + (denials.length ? ' [' + denials.join(',') + ']' : ''));
})();

// ---------------------------------------------------------------------------
// 2. Sustained 15-minute conversation
// ---------------------------------------------------------------------------
(function fifteenMinutes() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 0, allowed = 0, denied = 0, reasons = {};
  var turn = 0;
  while (t < 15 * 60 * 1000) {
    t += 16000;
    turn++;
    var out = B.decide(s, principal({
      lane: 'voice', voice_session_id: init.vsid, transcript: 'tema ' + turn
    }), t);
    s = out.state;
    if (out.verdict.allow) allowed++;
    else { denied++; reasons[out.verdict.reason] = (reasons[out.verdict.reason] || 0) + 1; }
  }
  check('15 min natural conversation: every turn allowed',
    denied === 0, allowed + ' allowed, ' + denied + ' denied ' + JSON.stringify(reasons));
  check('15 min: comfortably past the current ~2.5 min failure point',
    allowed >= 50, allowed + ' turns sustained');
})();

// ---------------------------------------------------------------------------
// 3. Burst speech (rapid short exchanges), then recovery
// ---------------------------------------------------------------------------
(function burst() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 0, allowed = 0, throttled = 0;
  // 14 turns as fast as the debounce permits (1s apart)
  for (var i = 0; i < 14; i++) {
    t += 1000;
    var out = B.decide(s, principal({
      lane: 'voice', voice_session_id: init.vsid, transcript: 'rafaga ' + i
    }), t);
    s = out.state;
    if (out.verdict.allow) allowed++; else throttled++;
  }
  check('burst: absorbs a natural rapid exchange (>= 12 turns)',
    allowed >= 12, allowed + ' allowed, ' + throttled + ' throttled');
  check('burst: does NOT allow unbounded rapid-fire',
    throttled > 0, throttled + ' throttled once the burst budget was spent');

  // Recovery after a natural pause
  t += 60000;
  var rec = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'despues de la pausa' }), t);
  check('burst: recovers after a one-minute pause',
    rec.verdict.allow, 'reason=' + rec.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 4. Normal long pauses (thinking) must never be punished
// ---------------------------------------------------------------------------
(function longPauses() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 0, denied = 0;
  for (var i = 0; i < 12; i++) {
    t += 75000;   // 75s of thinking between turns
    var out = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'pausa larga ' + i }), t);
    s = out.state;
    if (!out.verdict.allow) denied++;
  }
  check('long pauses: no penalty for thinking', denied === 0, denied + ' denied');
})();

// ---------------------------------------------------------------------------
// 5. Duplicate recognition events (recogniser repeated finals / echo)
// ---------------------------------------------------------------------------
(function duplicates() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 1000;

  var first = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'cuanto cuesta el filtro' }), t);
  s = first.state;
  var tokensAfterFirst = s.voice.tokens;

  var dupDenied = 0;
  for (var i = 0; i < 5; i++) {
    t += 900;
    var d = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'Cuánto cuesta el filtro!' }), t);
    s = d.state;
    if (!d.verdict.allow && d.verdict.reason === 'duplicate_transcript') dupDenied++;
  }
  check('duplicates: repeated finals suppressed', dupDenied === 5, dupDenied + '/5 suppressed');
  check('duplicates: consume NO conversation budget',
    Math.abs(s.voice.tokens - tokensAfterFirst) < 0.5,
    'tokens ' + tokensAfterFirst.toFixed(2) + ' -> ' + s.voice.tokens.toFixed(2));
  check('duplicates: turn counter not inflated',
    s.voice_session.turns_used === 1, 'turns_used=' + s.voice_session.turns_used);

  // The same words later in the conversation are legitimate, not a duplicate.
  t += 20000;
  var later = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'cuanto cuesta el filtro' }), t);
  check('duplicates: same phrase after the window is allowed again',
    later.verdict.allow, 'reason=' + later.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 6. Duplicate STORM (a genuine runaway loop) must be bounded
// ---------------------------------------------------------------------------
(function duplicateStorm() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 1000;
  s = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'bucle' }), t).state;

  var revoked = false, iterations = 0;
  for (var i = 0; i < 200; i++) {
    t += 50;   // hammering
    iterations++;
    var out = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'bucle' }), t);
    s = out.state;
    if (out.verdict.reason === 'voice_session_revoked') { revoked = true; break; }
  }
  check('duplicate storm: bounded and session revoked', revoked, 'revoked after ' + iterations + ' iterations');
  check('duplicate storm: reached Central at most once',
    s.voice_session.turns_used === 1, 'turns_used=' + s.voice_session.turns_used);
})();

// ---------------------------------------------------------------------------
// 7. Client retry storm
// ---------------------------------------------------------------------------
(function retryStorm() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 1000, allowed = 0, denied = 0;
  for (var i = 0; i < 60; i++) {
    t += 800;
    var out = B.decide(s, principal({ lane: 'retry', voice_session_id: init.vsid }), t);
    s = out.state;
    if (out.verdict.allow) allowed++; else denied++;
  }
  check('retry storm: bounded', allowed <= 5, allowed + ' allowed of 60 attempts');
  check('retry storm: did NOT consume the conversation budget',
    s.voice.tokens >= B.CONFIG.VOICE_BURST - 0.01,
    'voice tokens still ' + s.voice.tokens.toFixed(2) + '/' + B.CONFIG.VOICE_BURST);

  // Conversation must still work after a retry storm.
  t += 2000;
  var conv = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'sigo aqui' }), t);
  check('retry storm: legitimate conversation unaffected', conv.verdict.allow, 'reason=' + conv.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 8. Rapid reconnect loop
// ---------------------------------------------------------------------------
(function reconnectLoop() {
  var s = B.createInitialState('owner-luis', 'jl-truck-repair-test');
  var t = 0, allowed = 0, tooFast = 0, exhausted = 0;
  for (var i = 0; i < 40; i++) {
    t += 5000;   // reconnecting every 5s
    var out = B.decide(s, principal({ lane: 'mint' }), t);
    s = out.state;
    if (out.verdict.allow) allowed++;
    else if (out.verdict.reason === 'reconnect_too_fast') tooFast++;
    else if (out.verdict.reason === 'reconnect_budget_exhausted') exhausted++;
  }
  check('reconnect loop: bounded to the hourly mint budget',
    allowed <= B.CONFIG.MINT_MAX_PER_HOUR,
    allowed + ' mints allowed of 40 attempts (cap ' + B.CONFIG.MINT_MAX_PER_HOUR + ')');
  check('reconnect loop: rapid retries rejected by minimum interval',
    tooFast > 0, tooFast + ' rejected as too fast');

  // A legitimate reconnect much later must succeed.
  t += 3700000;
  var later = B.decide(s, principal({ lane: 'mint' }), t);
  check('reconnect: allowed again in the next hour', later.verdict.allow, 'reason=' + later.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 9. Reconnect mid-conversation: context and budget behave sanely
// ---------------------------------------------------------------------------
(function reconnectMidConversation() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 0;
  for (var i = 0; i < 5; i++) { t += 16000; s = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'antes ' + i }), t).state; }
  var oldVsid = s.voice_session.id;

  t += 30000;
  var re = B.decide(s, principal({ lane: 'mint' }), t);
  s = re.state;
  var newVsid = re.verdict.voice_session_id;

  check('reconnect: issues a new voice session', re.verdict.allow && newVsid, 'new=' + newVsid);
  check('reconnect: previous voice session id no longer accepted',
    (function () {
      var out = B.decide(s, principal({ lane: 'voice', voice_session_id: oldVsid, transcript: 'usando id viejo' }), t + 1000);
      return !out.verdict.allow && out.verdict.reason === 'voice_session_mismatch';
    })(), 'stale id rejected');

  t += 1000;
  var after = B.decide(s, principal({ lane: 'voice', voice_session_id: newVsid, transcript: 'despues de reconectar' }), t);
  check('reconnect: conversation resumes on the new session', after.verdict.allow, 'reason=' + after.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 10. Unauthorized / unauthenticated traffic
// ---------------------------------------------------------------------------
(function unauthorized() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var tokensBefore = s.voice.tokens;
  var t = 5000, denied = 0;

  for (var i = 0; i < 500; i++) {
    t += 10;
    var out = B.decide(s, { lane: 'voice', verified: false, transcript: 'atacante' }, t);
    s = out.state;
    if (!out.verdict.allow && out.verdict.reason === 'unauthenticated') denied++;
  }
  check('unauthenticated: all 500 requests denied', denied === 500, denied + '/500 denied');
  check('unauthenticated: consumed no budget whatsoever',
    s.voice.tokens === tokensBefore,
    'tokens unchanged at ' + s.voice.tokens.toFixed(2));

  // Verified but no principal
  var noPrin = B.decide(s, { lane: 'voice', verified: true, transcript: 'x' }, t);
  check('missing principal: denied', !noPrin.verdict.allow && noPrin.verdict.reason === 'unauthenticated',
    'reason=' + noPrin.verdict.reason);

  // Cross-tenant attempt
  var cross = B.decide(s, principal({ lane: 'voice', tenant_id: 'other-tenant', voice_session_id: init.vsid, transcript: 'x' }), t);
  check('cross-tenant: denied', !cross.verdict.allow && cross.verdict.reason === 'principal_mismatch',
    'reason=' + cross.verdict.reason);

  // Different identity reusing this budget row
  var otherId = B.decide(s, principal({ lane: 'voice', identity_id: 'someone-else', voice_session_id: init.vsid, transcript: 'x' }), t);
  check('identity mismatch: denied', !otherId.verdict.allow && otherId.verdict.reason === 'principal_mismatch',
    'reason=' + otherId.verdict.reason);

  // Stolen voice_session_id without the matching authenticated session hash
  var stolen = B.decide(s, principal({ lane: 'voice', session_hash: 'different-hash', voice_session_id: init.vsid, transcript: 'x' }), t);
  check('stolen voice_session_id without session binding: denied',
    !stolen.verdict.allow && stolen.verdict.reason === 'session_binding_mismatch',
    'reason=' + stolen.verdict.reason);

  // Legitimate traffic still works afterwards
  var ok = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'sigo siendo yo' }), t + 2000);
  check('legitimate conversation survives the attack traffic', ok.verdict.allow, 'reason=' + ok.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 11. Expired session and malformed requests
// ---------------------------------------------------------------------------
(function expiredAndMalformed() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;

  var exp = B.decide(s, principal({
    lane: 'voice', voice_session_id: init.vsid, transcript: 'hola',
    session_expires_at: 5000
  }), 10000);
  check('expired Panchita session: denied before any budget is touched',
    !exp.verdict.allow && exp.verdict.reason === 'session_expired', 'reason=' + exp.verdict.reason);

  var t = 5000, revoked = false;
  for (var i = 0; i < 10; i++) {
    t += 800;
    var m = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, malformed: true, transcript: '{{' }), t);
    s = m.state;
    if (s.voice_session && s.voice_session.revoked) { revoked = true; break; }
  }
  check('malformed storm: bounded and session revoked', revoked,
    'revoked after ' + s.malformed_count + ' malformed requests');

  // Voice session TTL
  var init2 = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s2 = init2.state;
  var ttl = B.decide(s2, principal({ lane: 'voice', voice_session_id: init2.vsid, transcript: 'tarde' }),
    B.CONFIG.VOICE_SESSION_TTL_MS + 1000);
  check('voice session TTL enforced',
    !ttl.verdict.allow && ttl.verdict.reason === 'voice_budget_exhausted', 'reason=' + ttl.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 12. Lane isolation: voice traffic must not consume the text budget
// ---------------------------------------------------------------------------
(function laneIsolation() {
  var init = startVoice(B.createInitialState('owner-luis', 'jl-truck-repair-test'), 0);
  var s = init.state;
  var t = 0;
  for (var i = 0; i < 30; i++) {
    t += 16000;
    s = B.decide(s, principal({ lane: 'voice', voice_session_id: init.vsid, transcript: 'voz ' + i }), t).state;
  }
  check('lane isolation: heavy voice use leaves the text budget untouched',
    s.text.count === 0, 'text.count=' + s.text.count);

  var txt = B.decide(s, principal({ lane: 'text' }), t + 1000);
  check('lane isolation: text still works after heavy voice use', txt.verdict.allow, 'reason=' + txt.verdict.reason);
})();

// ---------------------------------------------------------------------------
// 13. Worst-case bound: what can a fully abusive authenticated client extract?
// ---------------------------------------------------------------------------
(function worstCase() {
  var s = B.createInitialState('owner-luis', 'jl-truck-repair-test');
  var t = 0, reached = 0;
  // Hammer for a simulated hour with unique transcripts, reconnecting whenever possible.
  for (var step = 0; step < 400000; step++) {
    t += 10;
    if (t > 3600000) break;
    var out;
    if (!s.voice_session || s.voice_session.revoked) {
      out = B.decide(s, principal({ lane: 'mint' }), t);
      s = out.state;
      continue;
    }
    out = B.decide(s, principal({
      lane: 'voice', voice_session_id: s.voice_session.id, transcript: 'u' + step
    }), t);
    s = out.state;
    if (out.verdict.allow) reached++;
  }
  check('worst case: an abusive authenticated client is bounded within an hour',
    reached <= 400, reached + ' requests reached Central in a simulated hour (bound 400)');
  results.push(['INFO', 'worst-case hourly ceiling', reached + ' requests/hour maximum']);
})();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('');
console.log('=========================================================');
console.log(' Panchita Voice v2 -- Gate 0B budget test results');
console.log('=========================================================');
results.forEach(function (r) {
  var tag = r[0] === 'PASS' ? '  PASS' : (r[0] === 'FAIL' ? '* FAIL' : '  ....');
  console.log(tag + '  ' + r[1] + (r[2] ? '\n          ' + r[2] : ''));
});
console.log('---------------------------------------------------------');
console.log(' ' + pass + ' passed, ' + fail + ' failed');
console.log('=========================================================');
console.log('');
process.exit(fail === 0 ? 0 : 1);
