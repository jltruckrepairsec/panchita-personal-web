/*
 * ============================================================================
 * Gate 0B — demostración medida del problema #4: read-modify-write no atómico
 * ============================================================================
 * NO es una prueba de que algo funcione. Es una prueba que MIDE una limitación
 * conocida y la fija por escrito, para que:
 *   - nadie afirme que el presupuesto es infalible bajo concurrencia
 *   - si alguien lo arregla, esta prueba lo detecte y haya que actualizarla
 *
 * Las tablas de datos de n8n no ofrecen escritura condicional ni incremento
 * atómico verificables desde aquí. El patrón real es:
 *      leer fila  ->  calcular  ->  escribir fila
 * Si dos peticiones se solapan, ambas leen el mismo estado y la segunda
 * escritura pisa a la primera ("last writer wins"): se pierden incrementos.
 *
 * IMPORTANTE — esto NO es exclusivo de Gate 0B. El limitador que YA está en
 * producción (Get Rate Limit State -> Decide Authorization -> Update Rate Limit
 * State) usa exactamente el mismo patrón, así que hereda la misma debilidad.
 * Gate 0B no la introduce.
 *
 * ALCANCE DEL DAÑO: el limitador es un control de COSTE y ABUSO, no una
 * frontera de autorización. Ganar la carrera no da acceso a nada: identidad,
 * permisos, tenant y sesión se comprueban antes y no se ven afectados. Lo que
 * se puede desbordar es el gasto, no los datos.
 *
 *   node voice-v2/budget/test-concurrency.js
 * ============================================================================
 */

'use strict';

var B = require('./voice-budget.js');

var rows = [];
function note(k, v) { rows.push([k, String(v)]); }

function principal(extra) {
  return Object.assign({
    verified: true, identity_id: 'owner-luis',
    tenant_id: 'jl-truck-repair-test', session_hash: 'h'
  }, extra || {});
}

// Simula el patrón de n8n: todas las peticiones concurrentes leen el MISMO
// estado y la última escritura gana.
function raceBurst(state, vsid, n, t) {
  var allowed = 0, lastState = state;
  for (var i = 0; i < n; i++) {
    var out = B.decide(state, principal({
      lane: 'voice', voice_session_id: vsid, transcript: 'concurrente-' + i + '-' + t
    }), t);
    if (out.verdict.allow) allowed++;
    lastState = out.state;
  }
  return { allowed: allowed, state: lastState };
}

// Ejecución secuencial correcta, para comparar.
function sequential(state, vsid, n, t0) {
  var allowed = 0, s = state, t = t0;
  for (var i = 0; i < n; i++) {
    t += 800;   // respeta el debounce
    var out = B.decide(s, principal({
      lane: 'voice', voice_session_id: vsid, transcript: 'secuencial-' + i
    }), t);
    s = out.state;
    if (out.verdict.allow) allowed++;
  }
  return { allowed: allowed, state: s };
}

var base = B.decide(B.createInitialState('owner-luis', 'jl-truck-repair-test'),
  principal({ lane: 'mint' }), 0).state;
var vsid = base.voice_session.id;

// ---- Secuencial (comportamiento correcto) ---------------------------------
var seq = sequential(base, vsid, 5, 1000);
note('SECUENCIAL: peticiones permitidas', seq.allowed + ' de 5');
note('SECUENCIAL: turns_used registrado', seq.state.voice_session.turns_used);
note('SECUENCIAL: se contaron todas', seq.state.voice_session.turns_used === seq.allowed ? 'SI' : 'NO');

// ---- Concurrente (comportamiento real bajo carrera) ------------------------
var r = raceBurst(base, vsid, 5, 2000);
note('', '');
note('CONCURRENTE: peticiones permitidas', r.allowed + ' de 5');
note('CONCURRENTE: turns_used registrado', r.state.voice_session.turns_used);
note('CONCURRENTE: incrementos perdidos', (r.allowed - r.state.voice_session.turns_used));

// ---- ¿Cuánto se puede desbordar sostenidamente? ---------------------------
// Ráfagas concurrentes repetidas, respetando el reloj.
var s = base, t = 3000, reached = 0, CONC = 4;
for (var round = 0; round < 40; round++) {
  t += 1000;
  var rr = raceBurst(s, vsid, CONC, t);
  reached += rr.allowed;
  s = rr.state;
  if (s.voice_session && s.voice_session.revoked) break;
}
note('', '');
note('40 rondas de ' + CONC + ' concurrentes: llegaron a Central', reached);
note('40 rondas: turns_used contabilizado', s.voice_session ? s.voice_session.turns_used : 'n/a');
note('factor de desbordamiento aproximado',
  s.voice_session && s.voice_session.turns_used
    ? (reached / s.voice_session.turns_used).toFixed(1) + 'x'
    : 'n/a');

// ---- Lo que la carrera NO puede romper -------------------------------------
var unauth = B.decide(s, { lane: 'voice', verified: false, transcript: 'x' }, t);
note('', '');
note('bajo carrera, ¿un no autenticado pasa?',
  unauth.verdict.allow ? 'SI (GRAVE)' : 'NO — sigue denegado');
var cross = B.decide(s, principal({ lane: 'voice', tenant_id: 'otro-tenant', voice_session_id: vsid, transcript: 'x' }), t);
note('bajo carrera, ¿cruza el tenant?',
  cross.verdict.allow ? 'SI (GRAVE)' : 'NO — sigue denegado');
var stolen = B.decide(s, principal({ lane: 'voice', session_hash: 'otro', voice_session_id: vsid, transcript: 'x' }), t);
note('bajo carrera, ¿sirve un voice_session_id robado?',
  stolen.verdict.allow ? 'SI (GRAVE)' : 'NO — sigue denegado');

console.log('');
console.log('==========================================================');
console.log(' Gate 0B — problema #4 medido: read-modify-write no atómico');
console.log('==========================================================');
rows.forEach(function (r) {
  if (!r[0]) { console.log(''); return; }
  console.log('  ' + r[0].padEnd(48, '.') + ' ' + r[1]);
});
console.log('----------------------------------------------------------');
console.log(' CONCLUSIÓN: la concurrencia desborda el LÍMITE DE GASTO,');
console.log(' pero NO rompe autenticación, tenant ni vinculación de sesión.');
console.log(' Es un riesgo de coste, no de acceso.');
console.log('==========================================================');
console.log('');
