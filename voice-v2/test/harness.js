/*
 * ============================================================================
 * Banco de pruebas para la máquina de estados de Voice v2
 * ============================================================================
 * Carga el <script> real de un archivo HTML de Voice v2 dentro de un DOM
 * mínimo simulado, con SpeechRecognition, speechSynthesis, fetch y temporizadores
 * falsos. Reloj virtual: las pruebas son deterministas e instantáneas.
 *
 * No prueba funciones copiadas: ejecuta el código tal como se publica.
 * Sin red, sin navegador, sin dependencias externas, coste cero.
 * ============================================================================
 */

'use strict';

var fs = require('fs');
var vm = require('vm');

// --------------------------------------------------------------------------
// Reloj y temporizadores virtuales
// --------------------------------------------------------------------------
function createClock() {
  var now = 1000000;
  var timers = [];
  var seq = 0;

  function setTimeoutFake(fn, ms) {
    var id = ++seq;
    timers.push({ id: id, at: now + (ms || 0), fn: fn, interval: null });
    return id;
  }
  function setIntervalFake(fn, ms) {
    var id = ++seq;
    timers.push({ id: id, at: now + (ms || 0), fn: fn, interval: ms || 1 });
    return id;
  }
  function clearFake(id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers.splice(i, 1); return; }
    }
  }
  // Avanza el reloj disparando los temporizadores en orden cronológico.
  function advance(ms) {
    var target = now + ms;
    var guard = 0;
    for (;;) {
      if (++guard > 100000) throw new Error('bucle de temporizadores');
      var next = null;
      for (var i = 0; i < timers.length; i++) {
        if (timers[i].at <= target && (!next || timers[i].at < next.at)) next = timers[i];
      }
      if (!next) break;
      now = next.at;
      if (next.interval) next.at = now + next.interval;
      else clearFake(next.id);
      try { next.fn(); } catch (e) { /* igual que el navegador: no detiene el resto */ }
    }
    now = target;
  }
  return {
    setTimeout: setTimeoutFake, setInterval: setIntervalFake,
    clearTimeout: clearFake, clearInterval: clearFake,
    advance: advance, nowMs: function () { return now; },
    pending: function () { return timers.length; }
  };
}

// --------------------------------------------------------------------------
// DOM mínimo
// --------------------------------------------------------------------------
function createElement(tag) {
  var el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], parentNode: null,
    _class: '', _text: '', style: {}, dataset: {},
    disabled: false, value: '', placeholder: '', href: '', title: '',
    scrollTop: 0, scrollHeight: 0,
    _listeners: {}
  };
  el.classList = {
    add: function () {
      var s = el._class.split(/\s+/).filter(Boolean);
      for (var i = 0; i < arguments.length; i++) if (s.indexOf(arguments[i]) < 0) s.push(arguments[i]);
      el._class = s.join(' ');
    },
    remove: function () {
      var s = el._class.split(/\s+/).filter(Boolean);
      for (var i = 0; i < arguments.length; i++) {
        var k = s.indexOf(arguments[i]); if (k >= 0) s.splice(k, 1);
      }
      el._class = s.join(' ');
    },
    contains: function (c) { return el._class.split(/\s+/).indexOf(c) >= 0; },
    toggle: function (c, on) { if (on) el.classList.add(c); else el.classList.remove(c); }
  };
  Object.defineProperty(el, 'className', {
    get: function () { return el._class; }, set: function (x) { el._class = String(x); }
  });
  Object.defineProperty(el, 'textContent', {
    get: function () { return el._text; },
    set: function (x) { el._text = String(x); el.children = []; }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return el._text; },
    set: function (x) { el._text = String(x); el.children = []; }
  });
  el.appendChild = function (c) { c.parentNode = el; el.children.push(c); return c; };
  el.removeChild = function (c) {
    var i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1);
    c.parentNode = null; return c;
  };
  el.addEventListener = function (n, fn) { (el._listeners[n] = el._listeners[n] || []).push(fn); };
  el.removeEventListener = function () {};
  el.fire = function (n, ev) { (el._listeners[n] || []).forEach(function (f) { f(ev || {}); }); };
  el.click = function () { el.fire('click', {}); };
  return el;
}

function createDocument(ids) {
  var byId = {};
  ids.forEach(function (id) { byId[id] = createElement('div'); });
  var listeners = {};
  return {
    _byId: byId,
    visibilityState: 'visible',
    getElementById: function (id) { return byId[id] || (byId[id] = createElement('div')); },
    createElement: createElement,
    querySelectorAll: function () { return { forEach: function () {} }; },
    addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
    fire: function (n, ev) { (listeners[n] || []).forEach(function (f) { f(ev || {}); }); }
  };
}

// --------------------------------------------------------------------------
// SpeechRecognition simulado — registra todo lo que hace el código bajo prueba
// --------------------------------------------------------------------------
function createRecognitionFactory(log) {
  function Recognition() {
    var self = this;
    self.continuous = false;
    self.interimResults = false;
    self.lang = '';
    self._started = false;
    self._id = ++Recognition._count;
    log.instances.push(self);

    self.start = function () {
      log.starts.push(self._id);
      if (self._started) {
        log.invalidStateErrors.push(self._id);
        var e = new Error('InvalidStateError'); e.name = 'InvalidStateError'; throw e;
      }
      self._started = true;
    };
    self.stop = function () { log.stops.push(self._id); self._started = false; if (self.onend) self.onend(); };
    self.abort = function () { log.aborts.push(self._id); self._started = false; if (self.onend) self.onend(); };

    // Ayudantes de prueba
    self.emitFinal = function (text) {
      if (!self.onresult) return;
      self.onresult({ resultIndex: 0, results: [ Object.assign([{ transcript: text }], { isFinal: true, length: 1 }) ] });
    };
    self.emitError = function (code) { if (self.onerror) self.onerror({ error: code }); };
    self.emitEnd = function () { self._started = false; if (self.onend) self.onend(); };
  }
  Recognition._count = 0;
  return Recognition;
}

// --------------------------------------------------------------------------
// Carga un HTML de Voice v2 y devuelve los controles de prueba
// --------------------------------------------------------------------------
function load(htmlPath, opts) {
  opts = opts || {};
  var html = fs.readFileSync(htmlPath, 'utf8');
  var m = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) throw new Error('no se encontró <script> en ' + htmlPath);
  var code = m[1];

  var clock = createClock();
  var log = {
    instances: [], starts: [], stops: [], aborts: [], invalidStateErrors: [],
    spoken: [], cancels: [], fetches: []
  };

  var ids = [
    'login-screen','chat-screen','phone4','password','login-btn','login-btn-text','login-error',
    'messages','text-input','send-btn','mic-btn','session-pill','chat-hint','mic-diag','logout-btn',
    'voice-bar','v-state','v-mute','v-end','diag-toggle',
    'lang-es','lang-en','login-sub','label-phone','label-pass','login-hint',
    'voice-start','voice-mute','voice-end','voice-note','engine-tag','level-fill','remote-audio'
  ];
  var document = createDocument(ids);
  var Recognition = createRecognitionFactory(log);

  // Cola de respuestas del Gateway que las pruebas controlan.
  var responses = [];
  function fetchFake(url, init) {
    var body = {};
    try { body = JSON.parse(init.body); } catch (e) {}
    log.fetches.push({ url: url, body: body });
    var next = responses.length ? responses.shift()
      : { status: 'completed', human_readable_response: 'Respuesta de Central.' };
    if (next && next.__reject) return Promise.reject(new Error('network'));
    return Promise.resolve({
      status: 200, ok: true,
      json: function () { return Promise.resolve(next); }
    });
  }

  function SpeechSynthesisUtterance(text) { this.text = text; this.lang = ''; this.voice = null; }
  var speechSynthesis = {
    speaking: false, pending: false,
    getVoices: function () { return [{ lang: 'es-ES', name: 'v-es' }, { lang: 'en-US', name: 'v-en' }]; },
    speak: function (u) {
      log.spoken.push(u.text);
      speechSynthesis.speaking = true;
      u._u = u;
      // Simula el final de la locución en el reloj virtual.
      clock.setTimeout(function () {
        speechSynthesis.speaking = false;
        if (u.onend) u.onend();
      }, opts.speechMs || 1200);
    },
    cancel: function () { log.cancels.push(clock.nowMs()); speechSynthesis.speaking = false; },
    addEventListener: function () {}
  };

  var windowListeners = {};
  var sandbox = {
    console: console,
    document: document,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    fetch: fetchFake,
    Promise: Promise,
    JSON: JSON, Math: Math, Date: Date, RegExp: RegExp, String: String,
    Object: Object, Array: Array, Error: Error, isFinite: isFinite,
    SpeechSynthesisUtterance: SpeechSynthesisUtterance,
    navigator: {
      mediaDevices: {
        getUserMedia: function () {
          if (opts.denyMic) return Promise.reject(new Error('NotAllowedError'));
          return Promise.resolve({ getTracks: function () { return [{ stop: function () {} }]; } });
        }
      },
      wakeLock: null,
      onLine: true
    }
  };
  sandbox.window = {
    SpeechRecognition: opts.noRecognition ? undefined : Recognition,
    webkitSpeechRecognition: opts.noRecognition ? undefined : Recognition,
    speechSynthesis: opts.noSynthesis ? undefined : speechSynthesis,
    isSecureContext: true,
    addEventListener: function (n, fn) { (windowListeners[n] = windowListeners[n] || []).push(fn); },
    RTCPeerConnection: function () {},
    AudioContext: undefined, webkitAudioContext: undefined
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: htmlPath });

  var el = document._byId;

  // El código bajo prueba usa promesas reales (getUserMedia, fetch), y esas
  // son microtareas: no se resuelven mientras el reloj virtual avanza de forma
  // síncrona. drain() cede al bucle de eventos real para que se resuelvan, y
  // luego avanza el reloj virtual. Por eso los ayudantes son async.
  function drain() {
    return new Promise(function (r) { setImmediate(r); });
  }
  function tick(ms) {
    return drain()
      .then(drain)
      .then(function () { clock.advance(ms || 0); })
      .then(drain)
      .then(drain)
      .then(function () { clock.advance(0); })
      .then(drain);
  }

  return {
    log: log, clock: clock, el: el, document: document,
    tick: tick, drain: drain,
    queueResponse: function (r) { responses.push(r); },
    fireWindow: function (n, ev) { (windowListeners[n] || []).forEach(function (f) { f(ev || {}); }); },
    // Inicia sesión pasando por la UI de login real.
    login: function () {
      responses.unshift({
        status: 'completed', session_token: 'tok-abc',
        session_expires_at: new Date(clock.nowMs() + 6 * 3600 * 1000).toISOString(),
        human_readable_response: 'Hola Luis.'
      });
      el['phone4'].value = '1234';
      el['password'].value = 'secreto';
      el['login-btn'].fire('click');
      return tick(50);
    },
    micTap: function () { el['mic-btn'].fire('click'); return tick(50); },
    muteTap: function () { el['v-mute'].fire('click'); return tick(50); },
    endTap: function () { el['v-end'].fire('click'); return tick(50); },
    emitFinal: function (rec, text) { rec.emitFinal(text); return tick(50); },
    // El reconocedor activo es la última instancia creada.
    rec: function () { return log.instances[log.instances.length - 1]; },
    gatewayCalls: function () {
      return log.fetches.filter(function (f) { return f.body && f.body.message && !f.body.factor_provided; });
    }
  };
}

module.exports = { load: load, createClock: createClock };
