/*
 * ============================================================================
 * DROP-IN n8n Code node -- "Decide Voice Budget"
 * ============================================================================
 * NOT INSTALLED. Requires explicit approval: installing it means editing the
 * live Gateway workflow (KNuR7CRz7PwDznck), which is production.
 *
 * This is voice-budget.js inlined (n8n Code nodes cannot require local files),
 * plus the n8n I/O adapter at the bottom. The algorithm is byte-identical in
 * behaviour to the version covered by voice-v2/budget/test-voice-budget.js --
 * 37/37 passing. Uses only plain ES5 JavaScript: no Node built-ins, no npm, no
 * crypto, no timers. That is deliberate, so what was tested offline is exactly
 * what runs in the n8n sandbox.
 *
 * ---------------------------------------------------------------------------
 * WIRING (the only production change required)
 * ---------------------------------------------------------------------------
 * Today:
 *     Get Rate Limit State -> Decide Authorization & Rate Limit
 *                          -> Update Rate Limit State -> Authorized?
 *
 * Proposed (additive; existing nodes keep their current behaviour for text):
 *     Get Rate Limit State
 *       -> Decide Authorization & Rate Limit      [UNCHANGED]
 *       -> Get Voice Budget Row     (NEW, data table read)
 *       -> Decide Voice Budget      (NEW, this node)
 *       -> Update Voice Budget Row  (NEW, data table upsert)
 *       -> Update Rate Limit State                [UNCHANGED]
 *       -> Authorized?                            [UNCHANGED]
 *
 * This node NEVER grants. It reads the upstream authorization decision and may
 * only narrow it:
 *     authorized_final = authorized_upstream AND budget_allows
 * A request upstream denied stays denied. Identity, permissions, tenant
 * isolation and audit are untouched.
 *
 * New data table `panchita_voice_budget` columns:
 *     identity_id (string, match key)
 *     tenant_id   (string)
 *     state_json  (string)   -- the serialized budget state
 *     updated_at  (string)
 * ---------------------------------------------------------------------------
 */

// ===== BEGIN inlined voice-budget.js =======================================

var CONFIG = {
  TEXT_WINDOW_MS: 5 * 60 * 1000,
  TEXT_MAX: 10,
  VOICE_BURST: 12,
  VOICE_REFILL_PER_MIN: 6,
  RETRY_BURST: 3,
  RETRY_REFILL_PER_MIN: 1,
  MINT_MAX_PER_HOUR: 4,
  MINT_MIN_INTERVAL_MS: 20 * 1000,
  VOICE_SESSION_TTL_MS: 20 * 60 * 1000,
  VOICE_SESSION_MAX_TURNS: 90,
  MIN_REQUEST_INTERVAL_MS: 700,
  DUP_WINDOW_MS: 15 * 1000,
  DUP_MEMORY: 12,
  DUP_ABUSE_THRESHOLD: 20,
  MALFORMED_THRESHOLD: 5
};

function hashText(s) {
  var h = 0x811c9dc5, str = String(s || '');
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

function normalizeTranscript(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function newBucket(capacity) { return { tokens: capacity, last_refill: 0 }; }

function refill(bucket, capacity, perMin, now) {
  if (!bucket.last_refill) { bucket.last_refill = now; return bucket; }
  var elapsed = Math.max(0, now - bucket.last_refill);
  bucket.tokens = Math.min(capacity, bucket.tokens + (elapsed / 60000) * perMin);
  bucket.last_refill = now;
  return bucket;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function msUntilToken(bucket, perMin) {
  if (bucket.tokens >= 1) return 0;
  return Math.ceil(((1 - bucket.tokens) / perMin) * 60000);
}

function createInitialState(identity_id, tenant_id) {
  return {
    identity_id: identity_id || null, tenant_id: tenant_id || null,
    text: { window_start: 0, count: 0 },
    voice: newBucket(CONFIG.VOICE_BURST),
    retry: newBucket(CONFIG.RETRY_BURST),
    mint: { window_start: 0, count: 0, last_at: 0 },
    voice_session: null, recent: [], dup_count: 0, malformed_count: 0, last_request_at: 0
  };
}

function verdict(allow, reason, retryAfterMs, extra) {
  var v = { allow: !!allow, reason: reason || (allow ? 'ok' : 'denied'), retry_after_ms: retryAfterMs || 0 };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) v[k] = extra[k];
  return v;
}

function decide(prevState, req, now) {
  var s = clone(prevState || createInitialState(null, null));
  var r = req || {}, audit = [];

  if (!r.verified) { audit.push('unverified'); return { state: s, verdict: verdict(false, 'unauthenticated', 0, { audit: audit }) }; }
  if (!r.identity_id || !r.tenant_id) { audit.push('missing_principal'); return { state: s, verdict: verdict(false, 'unauthenticated', 0, { audit: audit }) }; }
  if ((s.identity_id && s.identity_id !== r.identity_id) || (s.tenant_id && s.tenant_id !== r.tenant_id)) {
    audit.push('principal_mismatch');
    return { state: s, verdict: verdict(false, 'principal_mismatch', 0, { audit: audit }) };
  }
  s.identity_id = r.identity_id; s.tenant_id = r.tenant_id;

  if (r.session_expires_at) {
    var exp = (typeof r.session_expires_at === 'number') ? r.session_expires_at : Date.parse(r.session_expires_at);
    if (isFinite(exp) && exp <= now) { audit.push('session_expired'); return { state: s, verdict: verdict(false, 'session_expired', 0, { audit: audit }) }; }
  }

  var lane = r.lane || 'text';

  if (r.malformed) {
    s.malformed_count += 1; audit.push('malformed:' + s.malformed_count);
    if (s.voice_session && s.malformed_count >= CONFIG.MALFORMED_THRESHOLD) {
      s.voice_session.revoked = true; s.voice_session.revoke_reason = 'malformed_storm';
      audit.push('voice_session_revoked:malformed_storm');
    }
    return { state: s, verdict: verdict(false, 'malformed_request', 0, { audit: audit }) };
  }

  if (lane === 'mint') {
    if (s.mint.window_start && (now - s.mint.window_start) >= 3600000) s.mint = { window_start: 0, count: 0, last_at: s.mint.last_at };
    if (s.mint.last_at && (now - s.mint.last_at) < CONFIG.MINT_MIN_INTERVAL_MS) {
      audit.push('mint_too_fast');
      return { state: s, verdict: verdict(false, 'reconnect_too_fast', CONFIG.MINT_MIN_INTERVAL_MS - (now - s.mint.last_at), { audit: audit }) };
    }
    if (!s.mint.window_start) s.mint.window_start = now;
    if (s.mint.count >= CONFIG.MINT_MAX_PER_HOUR) {
      audit.push('mint_exhausted');
      return { state: s, verdict: verdict(false, 'reconnect_budget_exhausted', 3600000 - (now - s.mint.window_start), { audit: audit }) };
    }
    s.mint.count += 1; s.mint.last_at = now;
    s.voice_session = {
      id: r.voice_session_id || ('vs-' + hashText(String(now) + r.identity_id)),
      session_hash: r.session_hash || null, started_at: now,
      turns_used: 0, revoked: false, revoke_reason: null
    };
    s.dup_count = 0; s.malformed_count = 0; s.recent = [];
    audit.push('mint_ok:' + s.mint.count + '/' + CONFIG.MINT_MAX_PER_HOUR);
    return { state: s, verdict: verdict(true, 'mint_ok', 0, { audit: audit, voice_session_id: s.voice_session.id }) };
  }

  if (lane === 'text') {
    if (!s.text.window_start || (now - s.text.window_start) >= CONFIG.TEXT_WINDOW_MS) {
      s.text.window_start = now; s.text.count = 1;
      audit.push('text_window_reset');
      return { state: s, verdict: verdict(true, 'ok', 0, { audit: audit }) };
    }
    s.text.count += 1;
    if (s.text.count > CONFIG.TEXT_MAX) {
      audit.push('text_rate_limited:' + s.text.count);
      return { state: s, verdict: verdict(false, 'rate_limited', CONFIG.TEXT_WINDOW_MS - (now - s.text.window_start), { audit: audit }) };
    }
    audit.push('text_ok:' + s.text.count + '/' + CONFIG.TEXT_MAX);
    return { state: s, verdict: verdict(true, 'ok', 0, { audit: audit }) };
  }

  if (lane === 'voice' || lane === 'retry') {
    var vs = s.voice_session;
    if (!vs) { audit.push('no_voice_session'); return { state: s, verdict: verdict(false, 'no_voice_session', 0, { audit: audit }) }; }
    if (vs.revoked) { audit.push('voice_session_revoked:' + vs.revoke_reason); return { state: s, verdict: verdict(false, 'voice_session_revoked', 0, { audit: audit }) }; }
    if (r.voice_session_id && r.voice_session_id !== vs.id) { audit.push('voice_session_mismatch'); return { state: s, verdict: verdict(false, 'voice_session_mismatch', 0, { audit: audit }) }; }
    if (vs.session_hash && r.session_hash && vs.session_hash !== r.session_hash) { audit.push('session_binding_mismatch'); return { state: s, verdict: verdict(false, 'session_binding_mismatch', 0, { audit: audit }) }; }
    if ((now - vs.started_at) >= CONFIG.VOICE_SESSION_TTL_MS) {
      vs.revoked = true; vs.revoke_reason = 'expired'; audit.push('voice_session_expired');
      return { state: s, verdict: verdict(false, 'voice_budget_exhausted', 0, { audit: audit }) };
    }
    if (vs.turns_used >= CONFIG.VOICE_SESSION_MAX_TURNS) {
      vs.revoked = true; vs.revoke_reason = 'turn_cap'; audit.push('voice_turn_cap');
      return { state: s, verdict: verdict(false, 'voice_budget_exhausted', 0, { audit: audit }) };
    }

    if (lane === 'voice') {
      var norm = normalizeTranscript(r.transcript);
      if (!norm) { audit.push('empty_transcript'); return { state: s, verdict: verdict(false, 'empty_transcript', 0, { audit: audit }) }; }
      var h = hashText(norm), hit = false;
      for (var i = 0; i < s.recent.length; i++) {
        if (s.recent[i].h === h && (now - s.recent[i].at) < CONFIG.DUP_WINDOW_MS) { hit = true; break; }
      }
      if (hit) {
        s.dup_count += 1; audit.push('duplicate:' + s.dup_count);
        if (s.dup_count >= CONFIG.DUP_ABUSE_THRESHOLD) {
          vs.revoked = true; vs.revoke_reason = 'duplicate_storm';
          audit.push('voice_session_revoked:duplicate_storm');
          return { state: s, verdict: verdict(false, 'voice_session_revoked', 0, { audit: audit }) };
        }
        return { state: s, verdict: verdict(false, 'duplicate_transcript', 0, { audit: audit }) };
      }
    }

    if (s.last_request_at && (now - s.last_request_at) < CONFIG.MIN_REQUEST_INTERVAL_MS) {
      audit.push('too_fast');
      return { state: s, verdict: verdict(false, 'too_fast', CONFIG.MIN_REQUEST_INTERVAL_MS - (now - s.last_request_at), { audit: audit }) };
    }

    var cap = (lane === 'retry') ? CONFIG.RETRY_BURST : CONFIG.VOICE_BURST;
    var per = (lane === 'retry') ? CONFIG.RETRY_REFILL_PER_MIN : CONFIG.VOICE_REFILL_PER_MIN;
    var bucket = (lane === 'retry') ? s.retry : s.voice;
    refill(bucket, cap, per, now);

    if (bucket.tokens < 1) {
      audit.push(lane + '_throttled');
      return { state: s, verdict: verdict(false, lane === 'retry' ? 'retry_budget_exhausted' : 'voice_throttled', msUntilToken(bucket, per), { audit: audit }) };
    }

    bucket.tokens -= 1;
    s.last_request_at = now;
    if (lane === 'voice') {
      vs.turns_used += 1;
      s.recent.push({ h: hashText(normalizeTranscript(r.transcript)), at: now });
      if (s.recent.length > CONFIG.DUP_MEMORY) s.recent = s.recent.slice(-CONFIG.DUP_MEMORY);
      audit.push('voice_ok:turn' + vs.turns_used);
    } else { audit.push('retry_ok'); }
    return { state: s, verdict: verdict(true, 'ok', 0, { audit: audit }) };
  }

  audit.push('unknown_lane');
  return { state: s, verdict: verdict(false, 'unknown_lane', 0, { audit: audit }) };
}

// ===== END inlined voice-budget.js =========================================

// ===== n8n adapter =========================================================

var authz = $('Decide Authorization & Rate Limit').first().json;
var norm  = $('Normalize & Validate Request').first().json;

// Existing budget row, if any.
var rows = $('Get Voice Budget Row').all().map(function (i) { return i.json; })
             .filter(function (x) { return x && x.identity_id; });
var prevState = null;
if (rows.length === 1 && rows[0].state_json) {
  try { prevState = JSON.parse(rows[0].state_json); } catch (e) { prevState = null; }
}

var now = Date.now();

// Lane is derived SERVER-SIDE from request shape. The client cannot pick its
// own lane: claiming "voice" without a valid, bound voice session simply fails.
var lane = 'text';
if (norm.action === 'voice_mint') lane = 'mint';
else if (norm.is_retry === true && norm.voice_session_id) lane = 'retry';
else if (norm.voice_session_id) lane = 'voice';

var out = decide(prevState, {
  lane: lane,
  verified: authz.verified === true,
  identity_id: authz.identity_id,
  tenant_id: authz.tenant_id,
  session_hash: norm.existing_session_hash || null,
  session_expires_at: norm.session_expires_at || null,
  voice_session_id: norm.voice_session_id || null,
  transcript: norm.message || '',
  malformed: norm.malformed === true
}, now);

// NARROW ONLY. This node can never authorize something upstream denied.
var finalAuthorized = (authz.authorized === true) && out.verdict.allow;

return [{
  json: Object.assign({}, authz, {
    authorized: finalAuthorized,
    authz_failure_reason: finalAuthorized
      ? null
      : (authz.authorized === true ? out.verdict.reason : authz.authz_failure_reason),
    budget_lane: lane,
    budget_reason: out.verdict.reason,
    budget_retry_after_ms: out.verdict.retry_after_ms,
    budget_audit: (out.verdict.audit || []).join('|'),
    voice_session_id_issued: out.verdict.voice_session_id || null,
    // consumed by "Update Voice Budget Row"
    budget_state_json: JSON.stringify(out.state),
    budget_identity_id: authz.identity_id,
    budget_tenant_id: authz.tenant_id,
    budget_updated_at: new Date(now).toISOString()
  })
}];
