/*
 * ============================================================================
 * Pre-flight checks for the free Voice v2 phone prototype
 * ============================================================================
 * Extracts the PURE HELPERS block verbatim out of voice-v2.html and exercises
 * it, so the duplicate-suppression, echo-guard and denial-classification logic
 * is verified as it actually ships -- not as a re-typed copy.
 *
 * Also runs static assertions over the whole file for the invariants that
 * cannot be unit tested (no fixed silence timer, continuous mode on, no paid
 * engine reachable, Gateway payload unchanged, no business writes).
 *
 * Offline, deterministic, $0.  node voice-v2/test/test-voice-client.js
 * ============================================================================
 */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var PROTO = path.join(ROOT, 'voice-v2.html');
var PROD = path.join(ROOT, 'index.html');

var html = fs.readFileSync(PROTO, 'utf8');
var prod = fs.readFileSync(PROD, 'utf8');

var pass = 0, fail = 0, rows = [];
function check(name, cond, detail) {
  if (cond) { pass++; rows.push(['PASS', name, detail || '']); }
  else { fail++; rows.push(['FAIL', name, detail || '']); }
}

// ---------------------------------------------------------------------------
// Extract and evaluate the real helper block
// ---------------------------------------------------------------------------
var START = '// ===== BEGIN PURE HELPERS';
var END = '// ===== END PURE HELPERS';
var si = html.indexOf(START), ei = html.indexOf(END);
if (si < 0 || ei < 0) {
  console.error('Could not locate the PURE HELPERS block in voice-v2.html');
  process.exit(1);
}
var helperSrc = html.slice(si, ei);
var sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  helperSrc + '\n;this.normalizeSpeech=normalizeSpeech;this.createDedupe=createDedupe;' +
  'this.createEchoGuard=createEchoGuard;this.classifyDenial=classifyDenial;this.fnv1a=fnv1a;',
  sandbox
);
check('helper block extracted from the shipping file', typeof sandbox.createDedupe === 'function',
  helperSrc.length + ' chars evaluated');

// ---------------------------------------------------------------------------
// CHECK 8 -- duplicate recognition events are suppressed
// ---------------------------------------------------------------------------
(function duplicates() {
  var dd = sandbox.createDedupe(15000, 12);
  var now = 1000;
  check('dedupe: first utterance is not a duplicate',
    dd.isDuplicate('cuanto cuesta el filtro de aceite', now) === false);
  dd.remember('cuanto cuesta el filtro de aceite', now);

  check('dedupe: exact repeat suppressed',
    dd.isDuplicate('cuanto cuesta el filtro de aceite', now + 500) === true);
  check('dedupe: repeat with different case/accents/punctuation suppressed',
    dd.isDuplicate('¿Cuánto cuesta el FILTRO de aceite?', now + 900) === true,
    'normalisation handles Android casing and punctuation drift');
  check('dedupe: same phrase after the window is allowed again',
    dd.isDuplicate('cuanto cuesta el filtro de aceite', now + 16000) === false);
  check('dedupe: a different sentence is not suppressed',
    dd.isDuplicate('y cuanto cuesta la instalacion', now + 1000) === false);

  // Simulated Android repeated-final burst
  var dd2 = sandbox.createDedupe(15000, 12);
  var t = 0, sent = 0;
  for (var i = 0; i < 6; i++) {
    if (!dd2.isDuplicate('necesito una cotizacion', t)) { dd2.remember('necesito una cotizacion', t); sent++; }
    t += 400;
  }
  check('dedupe: a 6x repeated-final burst reaches Central once', sent === 1, sent + ' submission(s)');
})();

// ---------------------------------------------------------------------------
// CHECK 9 -- Panchita's own speech cannot create an echo loop
// ---------------------------------------------------------------------------
(function echo() {
  var eg = sandbox.createEchoGuard(9000);
  var now = 5000;
  eg.spoke('El filtro de aceite cuesta cuarenta y cinco dolares', now);

  check('echo: exact playback of Panchita is suppressed',
    eg.isEcho('El filtro de aceite cuesta cuarenta y cinco dolares', now + 500) === true);
  check('echo: partial playback of Panchita is suppressed',
    eg.isEcho('cuesta cuarenta y cinco dolares', now + 800) === true);
  check('echo: a genuine new question is NOT suppressed',
    eg.isEcho('y cuanto tarda el servicio', now + 900) === false,
    'barge-in must still work');
  check('echo: very short fragments are not falsely suppressed',
    eg.isEcho('si', now + 900) === false);
  check('echo: stale speech outside the window no longer suppresses',
    eg.isEcho('El filtro de aceite cuesta cuarenta y cinco dolares', now + 10000) === false);

  // The acknowledgement phrase must also be echo-guarded, and must not block
  // the real answer afterwards.
  var eg2 = sandbox.createEchoGuard(9000);
  eg2.spoke('Dejame ver.', 0);
  check('echo: the "let me check" acknowledgement is guarded',
    eg2.isEcho('dejame ver', 300) === true);
  eg2.spoke('El precio es cincuenta dolares', 2000);
  check('echo: history keeps guarding the earlier phrase after a new one',
    eg2.isEcho('dejame ver', 2500) === true,
    'a late echo of the ack is still caught');

  check('echo: clear() disarms the guard',
    (function () { eg2.clear(); return eg2.isEcho('dejame ver', 2600); })() === false);
})();

// ---------------------------------------------------------------------------
// CHECK 10 (part) -- a rate limit must NOT log Luis out
// ---------------------------------------------------------------------------
(function denials() {
  var C = sandbox.classifyDenial;
  check('denial: rate_limited keeps the session',
    C({ error: { detail: 'rate_limited' } }) === 'throttle');
  check('denial: expired session logs out',
    C({ error: { detail: 'identity_session_expired' } }) === 'logout');
  check('denial: cross tenant logs out',
    C({ error: { detail: 'identity_cross_tenant' } }) === 'logout');
  check('denial: login lockout logs out',
    C({ error: { detail: 'identity_rate_limited' } }) === 'logout');
  check('denial: unknown reason keeps the session (fails soft on the UI)',
    C({ error: { detail: 'something_new' } }) === 'soft');
  check('denial: missing error object keeps the session',
    C({}) === 'soft');
  check('denial: voice budget exhaustion is not a logout',
    C({ error: { detail: 'voice_budget_exhausted' } }) === 'voice_exhausted');
})();

// ---------------------------------------------------------------------------
// Static invariants over the shipping file
// ---------------------------------------------------------------------------
function has(re) { return re.test(html); }

// CHECK 7 -- no fixed silence timer
check('CHECK 7: no SILENCE_MS constant anywhere',
  !/var\s+SILENCE_MS/.test(html), 'production had var SILENCE_MS = 3500');
check('CHECK 7: no MAX_TURN_MS end-of-turn timer',
  !/var\s+MAX_TURN_MS/.test(html));
check('CHECK 7: no armSilenceTimer',
  !/armSilenceTimer/.test(html));
check('CHECK 7: production DOES still have the fixed timer (baseline sanity)',
  /var\s+SILENCE_MS\s*=\s*3500/.test(prod), 'confirms the check is meaningful');

// One tap, continuous
check('continuous recognition enabled (removes push-to-talk)',
  /r\.continuous\s*=\s*true/.test(html));
check('production baseline uses continuous = false',
  /r\.continuous\s*=\s*false/.test(prod));

// CHECK 3 -- no paid engine, no new vendor
check('CHECK: paid Realtime disabled',
  /PAID_REALTIME_ENABLED\s*=\s*false/.test(html));
check('CHECK: no OpenAI endpoint referenced',
  !/api\.openai\.com/.test(html));
check('CHECK: no API key or bearer token in the file',
  !/Bearer\s|api[_-]?key/i.test(html));
check('CHECK: no voice mint relay call',
  !/voice-mint/.test(html));

// CHECK 1 -- authentication/session behaviour preserved
check('CHECK 1: same Gateway URL as production',
  html.indexOf('panchita-personal-gateway-v01') > -1 &&
  prod.indexOf('panchita-personal-gateway-v01') > -1);
check('CHECK 1: same login payload fields (phone_hint + factor_provided)',
  /phone_hint/.test(html) && /factor_provided/.test(html));
check('CHECK 1: same logout action',
  /action:\s*"logout"/.test(html));
check('CHECK 1: session token never persisted',
  !/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(html),
  'memory-only, matching production');
check('CHECK 1: session expiry watchdog retained',
  /sessionExpiresAt/.test(html) && /15000\)/.test(html));

// CHECK 2 -- Central is the only source of assistant content
check('CHECK 2: bot text comes only from human_readable_response',
  (html.match(/human_readable_response/g) || []).length >= 3);
check('CHECK 2: no generative call of any kind in the client',
  !/response\.create|conversation\.item\.create|completions|generateContent/.test(html));

// CHECK 3 -- no business permissions or writes added
// Assert on the ACTUAL request payloads rather than on raw file text: a naive
// substring scan produces false positives (for example "ghl" inside the
// production CSS property -webkit-tap-highlight-color, and "no_permission_grant",
// which READS a denial reason and grants nothing).
var payloadBlocks = html.match(/callGateway\(\{[\s\S]*?\n\s*\}\)/g) || [];
var inlineBlocks = html.match(/callGateway\(\{[^\n]*\}\)/g) || [];
var allPayloads = payloadBlocks.concat(inlineBlocks);
check('CHECK 3: found the Gateway call sites', allPayloads.length >= 3,
  allPayloads.length + ' call sites');

var ALLOWED_FIELDS = ['message', 'language', 'session_id', 'phone_hint', 'factor_provided', 'action'];
var offending = [];
allPayloads.forEach(function (blk) {
  var keys = blk.match(/(\w+)\s*:/g) || [];
  keys.forEach(function (k) {
    var name = k.replace(/\s*:$/, '');
    if (ALLOWED_FIELDS.indexOf(name) < 0) offending.push(name);
  });
});
check('CHECK 3: Gateway payloads carry only the production fields',
  offending.length === 0,
  offending.length ? 'unexpected: ' + offending.join(', ')
                   : 'only ' + ALLOWED_FIELDS.join(', '));

check('CHECK 3: no business-system integration in the client',
  !/\bshopmonkey\b|\bgohighlevel\b|\binvoice\b|\bpayment\b/i.test(html));

var grantsPermission = /permission\s*[:=]\s*['"]/.test(html) || /\bgrant\w*\s*\(/.test(html);
check('CHECK 3: client never grants or asserts a permission', !grantsPermission,
  'permission strings appear only when READING a denial reason');

// CHECK 5 -- mute really stops listening
check('CHECK 5: mute aborts the recogniser (releases the device)',
  /v\.paused\s*=\s*true[\s\S]{0,400}abort\(\)/.test(html));
check('CHECK 5: restart loop refuses to reopen while paused',
  /if \(!v\.active \|\| v\.stopping \|\| v\.paused\) return;/.test(html));

// CHECK 6 -- clean exit back to the existing mode
check('CHECK 6: endVoice tears down recogniser and timers',
  /function endVoice[\s\S]{0,600}clearTimers\(\)[\s\S]{0,400}abort\(\)/.test(html));
check('CHECK 6: ending voice does not clear the session token',
  !/function endVoice[\s\S]{0,700}sessionToken\s*=\s*null/.test(html));
check('CHECK 6: fallback link back to production exists',
  /PRODUCTION_URL\s*=\s*"\.\/index\.html"/.test(html));

// CHECK 4 -- microphone lifecycle
check('CHECK 4: permission probed before recognition, tracks released',
  /getUserMedia\(\{ audio: true \}\)[\s\S]{0,200}tr\.stop\(\)/.test(html));
check('CHECK 4: backgrounding mutes rather than pretending to listen',
  /visibilitychange[\s\S]{0,220}toggleMute\(\)/.test(html));
check('CHECK 4: pagehide tears voice down',
  /pagehide[\s\S]{0,80}endVoice/.test(html));
check('CHECK 4: expiry tears voice down BEFORE returning to login',
  /endVoice\(true\);\s*\n\s*clearSessionAndReturnToLogin\(t\("sessionExpired"\)\);/.test(html));

// CHECK 10 -- voice failure cannot break the normal interface
check('CHECK 10: failVoice stops voice but keeps the app usable',
  /function failVoice[\s\S]{0,300}endVoice\(true\)/.test(html));
check('CHECK 10: text send path is independent of voice state',
  /submitTurn\(d\["text-input"\]\.value, false\)/.test(html));

// Interface preservation
[['login-card','login card'], ['chat-header','chat header'], ['input-bar','input bar'],
 ['mic-btn','microphone button'], ['send-btn','send button'], ['mic-diag','diagnostic panel'],
 ['session-pill','session pill'], ['logout-btn','logout button'], ['lang-toggle','language toggle']
].forEach(function (p) {
  check('interface preserved: ' + p[1] + ' present', html.indexOf(p[0]) > -1);
});
check('interface preserved: production pulse animation retained',
  /@keyframes pulse/.test(html) && /@keyframes pulse/.test(prod));
check('interface preserved: production colour tokens unchanged',
  /--accent: #3fa9f5/.test(html) && /--accent: #3fa9f5/.test(prod));

// ---------------------------------------------------------------------------
console.log('');
console.log('==========================================================');
console.log(' Voice v2 free prototype -- phone-test pre-flight');
console.log('==========================================================');
rows.forEach(function (r) {
  console.log((r[0] === 'PASS' ? '  PASS  ' : '* FAIL  ') + r[1] + (r[2] ? '\n          ' + r[2] : ''));
});
console.log('----------------------------------------------------------');
console.log(' ' + pass + ' passed, ' + fail + ' failed');
console.log('==========================================================');
console.log('');
process.exit(fail === 0 ? 0 : 1);
