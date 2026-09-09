/*
 * ============================================================================
 * Pruebas de la MÁQUINA DE ESTADOS de Voice v2 (no de funciones copiadas)
 * ============================================================================
 * Ejecuta el <script> real de un HTML de Voice v2 dentro del banco de pruebas
 * (DOM, SpeechRecognition, speechSynthesis, fetch y reloj virtuales) y observa
 * su COMPORTAMIENTO: qué manda al Gateway, cuándo aborta el reconocedor,
 * cuándo habla y cuándo se calla.
 *
 * Offline, determinista, coste cero.
 *   node voice-v2/test/test-voice-machine.js [ruta-al-html]
 * ============================================================================
 */

'use strict';

var path = require('path');
var H = require('./harness.js');

var TARGET = process.argv[2] || path.join(__dirname, '..', '..', 'voice-v2.html');

var pass = 0, fail = 0, rows = [];
function check(name, cond, detail) {
  if (cond) { pass++; rows.push(['PASS', name, detail || '']); }
  else { fail++; rows.push(['FAIL', name, detail || '']); }
}
function section(t) { rows.push(['SECT', t, '']); }

async function boot(opts) {
  var app = H.load(TARGET, opts || {});
  await app.login();
  return app;
}

async function main() {

  // -------------------------------------------------------------------------
  section('Arranque de sesión de voz con un solo toque');
  // -------------------------------------------------------------------------
  {
    var app = await boot();
    check('login: sesión iniciada y pantalla de chat activa',
      app.el['chat-screen'].classList.contains('active'),
      'clases: ' + app.el['chat-screen'].className);

    var before = app.log.instances.length;
    await app.micTap();
    check('un toque crea y arranca el reconocedor',
      app.log.instances.length === before + 1 && app.log.starts.length >= 1,
      'instancias=' + app.log.instances.length + ' starts=' + app.log.starts.length);

    if (app.rec()) {
      check('modo continuo activado (sin push-to-talk)',
        app.rec().continuous === true, 'continuous=' + app.rec().continuous);
      check('resultados intermedios activados', app.rec().interimResults === true);
    } else {
      check('modo continuo activado (sin push-to-talk)', false, 'no se creó reconocedor');
      check('resultados intermedios activados', false, 'no se creó reconocedor');
    }
    check('la barra de voz se hace visible',
      app.el['voice-bar'].classList.contains('visible'), 'clases: ' + app.el['voice-bar'].className);
    check('el botón de micrófono muestra estado de escucha',
      app.el['mic-btn'].classList.contains('listening'));
  }

  // -------------------------------------------------------------------------
  section('Conversación de varios turnos sin volver a tocar');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let rec = app.rec();
    for (let i = 1; i <= 4; i++) {
      rec.emitFinal('pregunta numero ' + i);
      await app.tick(4000);
    }
    let calls = app.gatewayCalls();
    check('4 turnos hablados => 4 peticiones al Gateway',
      calls.length === 4, calls.length + ' peticiones');
    check('cada petición lleva el token de sesión',
      calls.length > 0 && calls.every(function (c) { return c.body.session_id === 'tok-abc'; }));
    check('ninguna petición de conversación lleva credenciales de login',
      calls.every(function (c) { return !c.body.factor_provided && !c.body.phone_hint; }));
  }

  // -------------------------------------------------------------------------
  section('Deduplicación de finales repetidos (comportamiento real de Android)');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let rec = app.rec();
    rec.emitFinal('cuanto cuesta el filtro');
    await app.tick(200);
    rec.emitFinal('cuanto cuesta el filtro');
    rec.emitFinal('¿Cuánto cuesta el FILTRO?');
    await app.tick(200);
    check('el final repetido no llega a Central',
      app.gatewayCalls().length === 1, app.gatewayCalls().length + ' peticiones (esperado 1)');
  }

  // -------------------------------------------------------------------------
  section('Eco: Panchita no debe escucharse a sí misma');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    app.queueResponse({ status: 'completed', human_readable_response: 'El filtro cuesta cuarenta y cinco dolares.' });
    await app.micTap();
    let rec = app.rec();
    rec.emitFinal('cuanto cuesta el filtro');
    await app.tick(600);
    let callsBefore = app.gatewayCalls().length;

    rec.emitFinal('El filtro cuesta cuarenta y cinco dolares.');
    await app.tick(200);
    check('el eco de Panchita NO se reenvía como pregunta',
      app.gatewayCalls().length === callsBefore,
      'antes=' + callsBefore + ' despues=' + app.gatewayCalls().length);

    rec.emitFinal('y cuanto tarda el servicio');
    await app.tick(400);
    check('una pregunta genuina sí pasa (el guard no bloquea todo)',
      app.gatewayCalls().length === callsBefore + 1,
      app.gatewayCalls().length + ' peticiones');
  }

  // -------------------------------------------------------------------------
  section('Barge-in: interrumpir a Panchita mientras habla');
  // -------------------------------------------------------------------------
  {
    let app = await boot({ speechMs: 8000 });
    app.queueResponse({ status: 'completed', human_readable_response: 'Una respuesta muy larga que sigue y sigue.' });
    await app.micTap();
    let rec = app.rec();
    rec.emitFinal('dame el precio');
    await app.tick(900);
    let cancelsBefore = app.log.cancels.length;

    rec.emitFinal('mejor dime otra cosa distinta');
    await app.tick(200);
    check('la interrupción cancela la locución',
      app.log.cancels.length > cancelsBefore,
      'cancels ' + cancelsBefore + ' -> ' + app.log.cancels.length);
    check('la interrupción genera un turno nuevo',
      app.gatewayCalls().length === 2, app.gatewayCalls().length + ' turnos');
  }

  // -------------------------------------------------------------------------
  section('Respuesta superada: nunca hablar una respuesta obsoleta');
  // -------------------------------------------------------------------------
  {
    let app = await boot({ speechMs: 500 });
    app.queueResponse({ status: 'completed', human_readable_response: 'RESPUESTA-UNO para la primera.' });
    app.queueResponse({ status: 'completed', human_readable_response: 'RESPUESTA-DOS para la segunda.' });
    await app.micTap();
    let rec = app.rec();
    rec.emitFinal('primera pregunta');
    rec.emitFinal('segunda pregunta que reemplaza');
    await app.tick(5000);
    let spokeOne = app.log.spoken.some(function (s) { return s.indexOf('RESPUESTA-UNO') >= 0; });
    let spokeTwo = app.log.spoken.some(function (s) { return s.indexOf('RESPUESTA-DOS') >= 0; });
    check('no se habla la respuesta de la pregunta superada',
      !(spokeOne && spokeTwo),
      'habló UNO=' + spokeOne + ' DOS=' + spokeTwo + ' | ' + app.log.spoken.join(' | '));
  }

  // -------------------------------------------------------------------------
  section('Mute: debe DEJAR de escuchar de verdad');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let rec = app.rec();
    let abortsBefore = app.log.aborts.length;

    await app.muteTap();
    check('mute aborta el reconocedor (libera el micrófono)',
      app.log.aborts.length > abortsBefore,
      'aborts ' + abortsBefore + ' -> ' + app.log.aborts.length);

    let callsBefore = app.gatewayCalls().length;
    rec.emitFinal('esto no se debe enviar');
    await app.tick(2000);
    check('estando silenciado no se envía nada',
      app.gatewayCalls().length === callsBefore, app.gatewayCalls().length + ' peticiones');
    check('el botón de micrófono ya no indica escucha',
      !app.el['mic-btn'].classList.contains('listening'));

    await app.muteTap();
    let rec2 = app.rec();
    rec2.emitFinal('ahora si escuchame');
    await app.tick(600);
    check('al reactivar vuelve a escuchar',
      app.gatewayCalls().length === callsBefore + 1, app.gatewayCalls().length + ' peticiones');
    let last = app.gatewayCalls().slice(-1)[0];
    check('la sesión de Panchita sobrevive al mute',
      !!last && last.body.session_id === 'tok-abc');
  }

  // -------------------------------------------------------------------------
  section('Terminar voz: vuelve al modo normal sin cerrar sesión');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let rec = app.rec();
    await app.endTap();

    check('terminar oculta la barra de voz',
      !app.el['voice-bar'].classList.contains('visible'));
    check('terminar apaga el indicador del micrófono',
      !app.el['mic-btn'].classList.contains('listening'));

    let callsBefore = app.gatewayCalls().length;
    rec.emitFinal('esto ya no deberia enviarse');
    await app.tick(1000);
    check('tras terminar, el reconocedor viejo no puede enviar nada',
      app.gatewayCalls().length === callsBefore, app.gatewayCalls().length + ' peticiones');

    app.el['text-input'].value = 'pregunta escrita';
    app.el['send-btn'].fire('click');
    await app.tick(600);
    check('el chat de texto sigue funcionando tras terminar la voz',
      app.gatewayCalls().length === callsBefore + 1, app.gatewayCalls().length + ' peticiones');
    check('sigue en la pantalla de chat (no cerró sesión)',
      app.el['chat-screen'].classList.contains('active'));
  }

  // -------------------------------------------------------------------------
  section('Reinicio del reconocedor (Android lo cierra solo)');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let rec = app.rec();
    let startsBefore = app.log.starts.length;
    rec.emitEnd();
    await app.tick(1000);
    check('el reconocedor se reabre solo (sigue escuchando)',
      app.log.starts.length > startsBefore,
      'starts ' + startsBefore + ' -> ' + app.log.starts.length);
    check('no se produjo InvalidStateError al reabrir',
      app.log.invalidStateErrors.length === 0,
      app.log.invalidStateErrors.length + ' errores de estado');
  }

  // -------------------------------------------------------------------------
  section('Reconocedor obsoleto: su onend no debe reiniciar al activo');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let first = app.rec();
    await app.muteTap();
    await app.muteTap();
    let second = app.rec();
    check('reactivar crea un reconocedor distinto',
      first !== second, 'first#' + first._id + ' second#' + (second && second._id));

    let errorsBefore = app.log.invalidStateErrors.length;
    first.emitEnd();
    await app.tick(1500);
    check('el onend del reconocedor viejo no provoca InvalidStateError',
      app.log.invalidStateErrors.length === errorsBefore,
      'errores ' + errorsBefore + ' -> ' + app.log.invalidStateErrors.length);

    let callsBefore = app.gatewayCalls().length;
    app.rec().emitFinal('sigo hablando normal');
    await app.tick(600);
    check('el reconocedor activo sigue funcionando',
      app.gatewayCalls().length === callsBefore + 1, app.gatewayCalls().length + ' peticiones');
  }

  // -------------------------------------------------------------------------
  section('Errores de reconocimiento');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let rec = app.rec();
    rec.emitError('no-speech');
    await app.tick(200);
    check('"no-speech" no termina la sesión de voz',
      app.el['voice-bar'].classList.contains('visible'));
    rec.emitError('network');
    await app.tick(200);
    check('"network" no termina la sesión de voz (se reintenta)',
      app.el['voice-bar'].classList.contains('visible'));

    let app2 = await boot();
    await app2.micTap();
    app2.rec().emitError('not-allowed');
    await app2.tick(300);
    check('"not-allowed" termina la voz de forma limpia',
      !app2.el['voice-bar'].classList.contains('visible'));
    check('tras el fallo, el chat de texto sigue disponible',
      app2.el['chat-screen'].classList.contains('active'));
  }

  // -------------------------------------------------------------------------
  section('Denegaciones del Gateway');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    app.queueResponse({ status: 'denied', human_readable_response: 'No pude procesar.', error: { type: 'authorization_denied', detail: 'rate_limited' } });
    await app.micTap();
    app.rec().emitFinal('pregunta que choca con el limite');
    await app.tick(1200);
    check('rate_limited NO devuelve a la pantalla de login',
      app.el['chat-screen'].classList.contains('active'));
    check('rate_limited mantiene la sesión de voz viva',
      app.el['voice-bar'].classList.contains('visible'));

    let app2 = await boot();
    app2.queueResponse({ status: 'denied', human_readable_response: 'Sesion expirada.', error: { type: 'authorization_denied', detail: 'identity_session_expired' } });
    await app2.micTap();
    app2.rec().emitFinal('pregunta con sesion muerta');
    await app2.tick(1200);
    check('sesión expirada SÍ devuelve al login',
      app2.el['login-screen'].classList.contains('active'));
    check('al expirar, la voz queda apagada (nunca micrófono abierto en el login)',
      !app2.el['voice-bar'].classList.contains('visible'));
  }

  // -------------------------------------------------------------------------
  section('Micrófono denegado y navegador sin soporte');
  // -------------------------------------------------------------------------
  {
    let app = await boot({ denyMic: true });
    await app.micTap();
    await app.tick(300);
    check('permiso denegado: la voz no arranca',
      !app.el['voice-bar'].classList.contains('visible'));
    check('permiso denegado: el chat de texto sigue vivo',
      app.el['chat-screen'].classList.contains('active'));

    let app2 = await boot({ noRecognition: true });
    await app2.micTap();
    await app2.tick(300);
    check('sin SpeechRecognition: no rompe la app',
      app2.el['chat-screen'].classList.contains('active'));
    check('sin SpeechRecognition: no queda barra de voz colgada',
      !app2.el['voice-bar'].classList.contains('visible'));
  }

  // -------------------------------------------------------------------------
  section('Idioma');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    check('reconocimiento en español por defecto',
      app.rec().lang === 'es-ES', 'lang=' + app.rec().lang);

    let app2 = H.load(TARGET, {});
    app2.el['lang-en'].fire('click');
    await app2.login();
    await app2.micTap();
    check('reconocimiento en inglés al cambiar idioma',
      app2.rec().lang === 'en-US', 'lang=' + app2.rec().lang);
    app2.rec().emitFinal('hello panchita');
    await app2.tick(600);
    let c = app2.gatewayCalls();
    check('el idioma se envía al Gateway',
      c.length > 0 && c[c.length - 1].body.language === 'en',
      c.length ? 'language=' + c[c.length - 1].body.language : 'sin peticiones');
  }

  // -------------------------------------------------------------------------
  section('Eventos de reconocimiento malformados');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    await app.micTap();
    let rec = app.rec();
    let callsBefore = app.gatewayCalls().length;
    rec.emitFinal('');
    rec.emitFinal('   ');
    await app.tick(600);
    check('transcripciones vacías no generan peticiones',
      app.gatewayCalls().length === callsBefore, app.gatewayCalls().length + ' peticiones');

    let threw = false;
    try {
      rec.onresult({ resultIndex: 0, results: [] });
      rec.onresult({ resultIndex: 5, results: [] });
    } catch (e) { threw = true; }
    await app.tick(200);
    check('onresult con forma inesperada no lanza excepción', !threw);
    check('la sesión de voz sobrevive a eventos malformados',
      app.el['voice-bar'].classList.contains('visible'));
  }

  // -------------------------------------------------------------------------
  section('Fallo de red en el Gateway');
  // -------------------------------------------------------------------------
  {
    let app = await boot();
    app.queueResponse({ __reject: true });
    await app.micTap();
    app.rec().emitFinal('pregunta que falla en red');
    await app.tick(1200);
    check('un fallo de red no termina la sesión de voz',
      app.el['voice-bar'].classList.contains('visible'));
    check('un fallo de red no cierra la sesión de Panchita',
      app.el['chat-screen'].classList.contains('active'));

    let callsBefore = app.gatewayCalls().length;
    app.rec().emitFinal('siguiente pregunta despues del fallo');
    await app.tick(1200);
    check('se puede seguir conversando tras un fallo de red',
      app.gatewayCalls().length === callsBefore + 1, app.gatewayCalls().length + ' peticiones');
  }

  // -------------------------------------------------------------------------
  console.log('');
  console.log('==============================================================');
  console.log(' Voice v2 — máquina de estados   (' + path.basename(TARGET) + ')');
  console.log('==============================================================');
  rows.forEach(function (r) {
    if (r[0] === 'SECT') { console.log('\n--- ' + r[1] + ' ---'); return; }
    console.log((r[0] === 'PASS' ? '  PASS  ' : '* FAIL  ') + r[1] + (r[2] ? '\n          ' + r[2] : ''));
  });
  console.log('\n--------------------------------------------------------------');
  console.log(' ' + pass + ' passed, ' + fail + ' failed');
  console.log('==============================================================\n');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(function (e) {
  console.error('ERROR EN EL BANCO DE PRUEBAS:', e && e.stack ? e.stack : e);
  process.exit(2);
});
