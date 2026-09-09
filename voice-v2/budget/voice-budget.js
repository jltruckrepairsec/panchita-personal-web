/*
 * ============================================================================
 * Panchita Voice v2 -- Gate 0B: multi-lane request budget
 * ============================================================================
 * ISOLATED. NOT DEPLOYED. Production Gateway (n8n KNuR7CRz7PwDznck) unmodified.
 *
 * Pure, deterministic, side-effect free. `decide()` takes a state object and a
 * request, and returns a NEW state plus a verdict. No I/O, no clock access,
 * no randomness -- `now` is always injected. That is what makes it testable
 * offline at zero cost, and it drops into an n8n Code node unchanged (the node
 * reads the row, calls decide(), writes the row back).
 *
 * WHY NOT JUST RAISE THE EXISTING LIMIT
 * The production rule is RATE_LIMIT_MAX = 10 per RATE_WINDOW_MINUTES = 5,
 * keyed on identity_id, evaluated in "Decide Authorization & Rate Limit".
 * It is the ONLY post-authentication throughput protection in the Gateway and
 * it also bounds spend on the Claude Sonnet 5 agent and Brave Search. Raising
 * it globally would weaken abuse protection and cost control for text traffic
 * in order to help voice. Instead this adds separate lanes, so voice gets the
 * throughput it needs while text keeps the exact limit it has today.
 *
 * WHAT THIS DOES NOT DO
 * It never decides identity, authorization, tenant membership or permissions.
 * Those stay upstream and unchanged. This layer only answers: "may this
 * already-authenticated, already-authorized request proceed right now?"
 * It can only ever DENY a request that upstream would have allowed. It can
 * never allow one upstream would have denied.
 * ============================================================================
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
var CONFIG = {
  // --- text lane: EXACTLY the production rule, preserved bit for bit --------
  TEXT_WINDOW_MS: 5 * 60 * 1000,
  TEXT_MAX: 10,

  // --- voice lane: token bucket --------------------------------------------
  // Measured need: a natural turn cycle (speak ~5s + gateway ~3s + Panchita
  // ~6s + pause ~2s) is ~16s, so ~3.75 turns/min sustained. Rapid short
  // exchanges burst to ~10/min briefly.
  // Burst 12 covers the fastest natural exchange; refill 6/min is ~1.6x the
  // sustained need, leaving headroom without letting a runaway loop exceed
  // 360 requests/hour.
  VOICE_BURST: 12,
  VOICE_REFILL_PER_MIN: 6,

  // --- retry lane: separate, deliberately small ----------------------------
  // A retry must never consume a conversation turn, and a retry storm must
  // never consume the conversation budget.
  RETRY_BURST: 3,
  RETRY_REFILL_PER_MIN: 1,

  // --- system lane: voice-session minting (session control, not content) ---
  MINT_MAX_PER_HOUR: 4,
  MINT_MIN_INTERVAL_MS: 20 * 1000,

  // --- voice session ceilings ----------------------------------------------
  VOICE_SESSION_TTL_MS: 20 * 60 * 1000,
  VOICE_SESSION_MAX_TURNS: 90,

  // --- anti-storm safeguards -----------------------------------------------
  MIN_REQUEST_INTERVAL_MS: 700,   // debounce: kills recogniser double-fires
  DUP_WINDOW_MS: 15 * 1000,       // identical transcript inside this = duplicate
  DUP_MEMORY: 12,                 // recent transcripts remembered
  DUP_ABUSE_THRESHOLD: 20,        // duplicates in one voice session => loop
  MALFORMED_THRESHOLD: 5          // malformed in one voice session => revoke
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// FNV-1a. Not security-relevant -- only used to spot identical transcripts,
// so a non-cryptographic hash is the right tool and avoids a dependency.
function hashText(s) {
  var h = 0x811c9dc5;
  var str = String(s || '');
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

function normalizeTranscript(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function newBucket(capacity) {
  return { tokens: capacity, last_refill: 0 };
}

function refill(bucket, capacity, perMin, now) {
  if (!bucket.last_refill) { bucket.last_refill = now; return bucket; }
  var elapsed = Math.max(0, now - bucket.last_refill);
  var gained = (elapsed / 60000) * perMin;
  bucket.tokens = Math.min(capacity, bucket.tokens + gained);
  bucket.last_refill = now;
  return bucket;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function msUntilToken(bucket, perMin) {
  if (bucket.tokens >= 1) return 0;
  var needed = 1 - bucket.tokens;
  return Math.ceil((needed / perMin) * 60000);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function createInitialState(identity_id, tenant_id) {
  return {
    identity_id: identity_id || null,
    tenant_id: tenant_id || null,
    text: { window_start: 0, count: 0 },
    voice: newBucket(CONFIG.VOICE_BURST),
    retry: newBucket(CONFIG.RETRY_BURST),
    mint: { window_start: 0, count: 0, last_at: 0 },
    voice_session: null,          // { id, session_hash, started_at, turns_used, revoked, revoke_reason }
    recent: [],                   // [{ h, at }]
    dup_count: 0,
    malformed_count: 0,
    last_request_at: 0
  };
}

function verdict(allow, reason, retryAfterMs, extra) {
  var v = {
    allow: !!allow,
    reason: reason || (allow ? 'ok' : 'denied'),
    retry_after_ms: retryAfterMs || 0
  };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) v[k] = extra[k];
  return v;
}

// ---------------------------------------------------------------------------
// decide()
//
// req = {
//   lane: 'text' | 'voice' | 'retry' | 'mint',
//   verified: boolean,              // from upstream identity check
//   identity_id, tenant_id,
//   session_hash,                   // sha256 of the Panchita session token
//   session_expires_at,             // ISO string or ms
//   voice_session_id,               // required for lane 'voice'
//   transcript,                     // required for lane 'voice'
//   malformed: boolean              // from upstream shape validation
// }
// ---------------------------------------------------------------------------
function decide(prevState, req, now) {
  var s = clone(prevState || createInitialState(null, null));
  var r = req || {};
  var audit = [];

  // ---- Fail closed on anything upstream already distrusts -----------------
  // Unauthenticated traffic must never touch, consume, or grow a budget.
  if (!r.verified) {
    audit.push('unverified');
    return { state: s, verdict: verdict(false, 'unauthenticated', 0, { audit: audit }) };
  }
  if (!r.identity_id || !r.tenant_id) {
    audit.push('missing_principal');
    return { state: s, verdict: verdict(false, 'unauthenticated', 0, { audit: audit }) };
  }
  // Tenant isolation: a budget row belongs to exactly one identity+tenant.
  if ((s.identity_id && s.identity_id !== r.identity_id) ||
      (s.tenant_id && s.tenant_id !== r.tenant_id)) {
    audit.push('principal_mismatch');
    return { state: s, verdict: verdict(false, 'principal_mismatch', 0, { audit: audit }) };
  }
  s.identity_id = r.identity_id;
  s.tenant_id = r.tenant_id;

  // Expired Panchita session: deny before any budget is touched.
  if (r.session_expires_at) {
    var exp = (typeof r.session_expires_at === 'number')
      ? r.session_expires_at
      : Date.parse(r.session_expires_at);
    if (isFinite(exp) && exp <= now) {
      audit.push('session_expired');
      return { state: s, verdict: verdict(false, 'session_expired', 0, { audit: audit }) };
    }
  }

  var lane = r.lane || 'text';

  // ---- Malformed: bounded, and never free ---------------------------------
  if (r.malformed) {
    s.malformed_count += 1;
    audit.push('malformed:' + s.malformed_count);
    if (s.voice_session && s.malformed_count >= CONFIG.MALFORMED_THRESHOLD) {
      s.voice_session.revoked = true;
      s.voice_session.revoke_reason = 'malformed_storm';
      audit.push('voice_session_revoked:malformed_storm');
    }
    return { state: s, verdict: verdict(false, 'malformed_request', 0, { audit: audit }) };
  }

  // =========================================================================
  // MINT lane (system/internal: voice-session control, carries no content)
  // =========================================================================
  if (lane === 'mint') {
    if (s.mint.window_start && (now - s.mint.window_start) >= 3600000) {
      s.mint = { window_start: 0, count: 0, last_at: s.mint.last_at };
    }
    if (s.mint.last_at && (now - s.mint.last_at) < CONFIG.MINT_MIN_INTERVAL_MS) {
      audit.push('mint_too_fast');
      return { state: s, verdict: verdict(false, 'reconnect_too_fast',
        CONFIG.MINT_MIN_INTERVAL_MS - (now - s.mint.last_at), { audit: audit }) };
    }
    if (!s.mint.window_start) s.mint.window_start = now;
    if (s.mint.count >= CONFIG.MINT_MAX_PER_HOUR) {
      audit.push('mint_exhausted');
      return { state: s, verdict: verdict(false, 'reconnect_budget_exhausted',
        3600000 - (now - s.mint.window_start), { audit: audit }) };
    }
    s.mint.count += 1;
    s.mint.last_at = now;

    // A new voice session revokes the previous one: one concurrent session per
    // identity, so a reconnect loop cannot accumulate parallel budgets.
    s.voice_session = {
      id: r.voice_session_id || ('vs-' + hashText(String(now) + r.identity_id)),
      session_hash: r.session_hash || null,
      started_at: now,
      turns_used: 0,
      revoked: false,
      revoke_reason: null
    };
    s.dup_count = 0;
    s.malformed_count = 0;
    s.recent = [];
    audit.push('mint_ok:' + s.mint.count + '/' + CONFIG.MINT_MAX_PER_HOUR);
    return { state: s, verdict: verdict(true, 'mint_ok', 0, {
      audit: audit, voice_session_id: s.voice_session.id
    }) };
  }

  // =========================================================================
  // TEXT lane -- production semantics preserved exactly (fixed 5 min window,
  // max 10, counter incremented even when denied)
  // =========================================================================
  if (lane === 'text') {
    if (!s.text.window_start || (now - s.text.window_start) >= CONFIG.TEXT_WINDOW_MS) {
      s.text.window_start = now;
      s.text.count = 1;
      audit.push('text_window_reset');
      return { state: s, verdict: verdict(true, 'ok', 0, { audit: audit }) };
    }
    s.text.count += 1;   // denied requests still consume, as production does
    if (s.text.count > CONFIG.TEXT_MAX) {
      audit.push('text_rate_limited:' + s.text.count);
      return { state: s, verdict: verdict(false, 'rate_limited',
        CONFIG.TEXT_WINDOW_MS - (now - s.text.window_start), { audit: audit }) };
    }
    audit.push('text_ok:' + s.text.count + '/' + CONFIG.TEXT_MAX);
    return { state: s, verdict: verdict(true, 'ok', 0, { audit: audit }) };
  }

  // =========================================================================
  // VOICE and RETRY lanes -- both require a live, bound voice session
  // =========================================================================
  if (lane === 'voice' || lane === 'retry') {
    var vs = s.voice_session;
    if (!vs) {
      audit.push('no_voice_session');
      return { state: s, verdict: verdict(false, 'no_voice_session', 0, { audit: audit }) };
    }
    if (vs.revoked) {
      audit.push('voice_session_revoked:' + vs.revoke_reason);
      return { state: s, verdict: verdict(false, 'voice_session_revoked', 0, { audit: audit }) };
    }
    // Replay / theft protection: the caller must present the SAME voice session
    // id AND it must still be bound to the same authenticated session hash.
    if (r.voice_session_id && r.voice_session_id !== vs.id) {
      audit.push('voice_session_mismatch');
      return { state: s, verdict: verdict(false, 'voice_session_mismatch', 0, { audit: audit }) };
    }
    if (vs.session_hash && r.session_hash && vs.session_hash !== r.session_hash) {
      audit.push('session_binding_mismatch');
      return { state: s, verdict: verdict(false, 'session_binding_mismatch', 0, { audit: audit }) };
    }
    if ((now - vs.started_at) >= CONFIG.VOICE_SESSION_TTL_MS) {
      vs.revoked = true; vs.revoke_reason = 'expired';
      audit.push('voice_session_expired');
      return { state: s, verdict: verdict(false, 'voice_budget_exhausted', 0, { audit: audit }) };
    }
    if (vs.turns_used >= CONFIG.VOICE_SESSION_MAX_TURNS) {
      vs.revoked = true; vs.revoke_reason = 'turn_cap';
      audit.push('voice_turn_cap');
      return { state: s, verdict: verdict(false, 'voice_budget_exhausted', 0, { audit: audit }) };
    }

    // ---- Duplicate suppression -------------------------------------------
    // Covers recogniser repeated-final events and echo re-submission. A
    // duplicate is a client defect, not abuse, so it consumes NO conversation
    // budget -- but it is counted, and a sustained duplicate storm (a genuine
    // loop) revokes the session.
    if (lane === 'voice') {
      var norm = normalizeTranscript(r.transcript);
      if (!norm) {
        audit.push('empty_transcript');
        return { state: s, verdict: verdict(false, 'empty_transcript', 0, { audit: audit }) };
      }
      var h = hashText(norm);
      var i, hit = false;
      for (i = 0; i < s.recent.length; i++) {
        if (s.recent[i].h === h && (now - s.recent[i].at) < CONFIG.DUP_WINDOW_MS) { hit = true; break; }
      }
      if (hit) {
        s.dup_count += 1;
        audit.push('duplicate:' + s.dup_count);
        if (s.dup_count >= CONFIG.DUP_ABUSE_THRESHOLD) {
          vs.revoked = true; vs.revoke_reason = 'duplicate_storm';
          audit.push('voice_session_revoked:duplicate_storm');
          return { state: s, verdict: verdict(false, 'voice_session_revoked', 0, { audit: audit }) };
        }
        return { state: s, verdict: verdict(false, 'duplicate_transcript', 0, { audit: audit }) };
      }
    }

    // ---- Debounce: the cheapest defence against request storms -------------
    if (s.last_request_at && (now - s.last_request_at) < CONFIG.MIN_REQUEST_INTERVAL_MS) {
      audit.push('too_fast');
      return { state: s, verdict: verdict(false, 'too_fast',
        CONFIG.MIN_REQUEST_INTERVAL_MS - (now - s.last_request_at), { audit: audit }) };
    }

    // ---- Token bucket ------------------------------------------------------
    var cap = (lane === 'retry') ? CONFIG.RETRY_BURST : CONFIG.VOICE_BURST;
    var per = (lane === 'retry') ? CONFIG.RETRY_REFILL_PER_MIN : CONFIG.VOICE_REFILL_PER_MIN;
    var bucket = (lane === 'retry') ? s.retry : s.voice;
    refill(bucket, cap, per, now);

    if (bucket.tokens < 1) {
      audit.push(lane + '_throttled');
      return { state: s, verdict: verdict(false,
        lane === 'retry' ? 'retry_budget_exhausted' : 'voice_throttled',
        msUntilToken(bucket, per), { audit: audit }) };
    }

    bucket.tokens -= 1;
    s.last_request_at = now;

    if (lane === 'voice') {
      vs.turns_used += 1;
      s.recent.push({ h: hashText(normalizeTranscript(r.transcript)), at: now });
      if (s.recent.length > CONFIG.DUP_MEMORY) s.recent = s.recent.slice(-CONFIG.DUP_MEMORY);
      audit.push('voice_ok:turn' + vs.turns_used + ' tokens=' + bucket.tokens.toFixed(2));
    } else {
      audit.push('retry_ok tokens=' + bucket.tokens.toFixed(2));
    }
    return { state: s, verdict: verdict(true, 'ok', 0, { audit: audit }) };
  }

  audit.push('unknown_lane');
  return { state: s, verdict: verdict(false, 'unknown_lane', 0, { audit: audit }) };
}

module.exports = {
  CONFIG: CONFIG,
  createInitialState: createInitialState,
  decide: decide,
  normalizeTranscript: normalizeTranscript,
  hashText: hashText
};
