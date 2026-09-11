"use strict";
/*
 * Offline harness for voice-v2.html.
 *
 * Loads the REAL <script> body out of voice-v2.html into a vm sandbox behind a
 * minimal DOM, a scriptable SpeechRecognition and fully controllable fake
 * timers. Nothing is re-implemented here: the code under test is the code that
 * ships, so a regression in the page is a failing test.
 *
 * The network is a stub. No request ever leaves this process, and there is no
 * API key, token or endpoint of any kind in this file.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PAGE = path.join(__dirname, "..", "voice-v2.html");

function readPageScript(opts) {
  const html = fs.readFileSync(PAGE, "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no <script> block found in voice-v2.html");
  let src = m[1];
  // Flip the page's own diagnostic switch so both branches are testable.
  if (opts && opts.holdMicStream !== undefined) {
    const re = /var HOLD_MIC_STREAM = (?:true|false);/;
    if (!re.test(src)) throw new Error("HOLD_MIC_STREAM switch not found in voice-v2.html");
    src = src.replace(re, "var HOLD_MIC_STREAM = " + (opts.holdMicStream ? "true" : "false") + ";");
  }
  return src;
}

function readPureHelpers() {
  const html = fs.readFileSync(PAGE, "utf8");
  const start = html.indexOf("// ===== BEGIN PURE HELPERS");
  const end = html.indexOf("// ===== END PURE HELPERS");
  if (start < 0 || end < 0) throw new Error("PURE HELPERS block markers missing");
  return html.slice(start, end);
}

/* ---- fake clock --------------------------------------------------------- */
function createClock() {
  let now = 1700000000000;
  let seq = 0;
  let timers = [];
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.push({ id, at: now + (ms || 0), fn });
      return id;
    },
    clearTimeout(id) { timers = timers.filter((t) => t.id !== id); },
    setInterval(fn, ms) {
      const id = ++seq;
      const every = Math.max(1, ms || 1);
      const self = { id, at: now + every, fn: null };
      self.fn = () => { timers.push({ id, at: now + every, fn: self.fn }); fn(); };
      timers.push({ id, at: self.at, fn: self.fn });
      return id;
    },
    /* Advance the clock, running due timers in order. */
    tick(ms) {
      const target = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.fn();
      }
      now = target;
    },
    pending() { return timers.length; }
  };
}

/* ---- minimal DOM -------------------------------------------------------- */
function makeEl(id) {
  const el = {
    id,
    textContent: "",
    innerHTML: "",
    className: "",
    value: "",
    placeholder: "",
    href: "",
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    style: {},
    children: [],
    listeners: {},
    classes: new Set(),
    classList: {
      add: (c) => el.classes.add(c),
      remove: (c) => el.classes.delete(c),
      contains: (c) => el.classes.has(c),
      toggle: (c, on) => { if (on) el.classes.add(c); else el.classes.delete(c); }
    },
    addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    appendChild(c) { el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter((x) => x !== c); },
    remove() {},
    fire(type, ev) { (el.listeners[type] || []).forEach((fn) => fn(ev || {})); }
  };
  Object.defineProperty(el, "parentNode", { get: () => ({ removeChild() {} }) });
  return el;
}

/* ---- the sandbox -------------------------------------------------------- */
function createApp(opts) {
  opts = opts || {};
  const clock = createClock();
  const els = {};
  const recognizers = [];
  const spoken = [];
  const gatewayCalls = [];

  const getEl = (id) => (els[id] = els[id] || makeEl(id));

  class FakeRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = "";
      this.started = 0;
      this.aborted = 0;
      this.stopped = 0;
      this.live = false;
      this.index = recognizers.length;
      this._startGen = 0;
      recognizers.push(this);
    }
    start() {
      this.started++;
      if (this.failNextStart) { this.failNextStart = false; throw new Error("InvalidStateError"); }
      this.live = true;
      mic.order.push("rec.start");
      // A real engine does not become live synchronously. onstart and
      // onaudiostart arrive after the service spins up, and the microphone is
      // DEAF for that whole window -- which is the gap the page has to survive.
      const gen = ++this._startGen;
      clock.setTimeout(() => {
        if (gen !== this._startGen || !this.live) return;
        if (this.onstart) this.onstart();
        if (this.onaudiostart) this.onaudiostart();
      }, opts.spinUpMs === undefined ? 250 : opts.spinUpMs);
    }

    /* THE ANDROID BEHAVIOUR THE OFFLINE SUITE WAS MISSING.
       Android Chrome ends the recognition session at its own endpointer even
       with continuous = true. Every pause therefore tears the session down and
       the page has to rebuild it, going deaf in between. Nothing in the old
       harness did this, which is why the natural-pause bug survived a green
       suite and only appeared on the phone. */
    androidEndpoint() {
      if (this.onspeechend) this.onspeechend();
      if (this.onaudioend) this.onaudioend();
      this.live = false;
      this._startGen++;
      if (this.onend) this.onend();
    }

    /* Android's other teardown: several seconds of silence, then no-speech
       followed by onend. This is the idle churn loop. */
    androidNoSpeech() {
      if (this.onerror) this.onerror({ error: "no-speech" });
      this.androidEndpoint();
    }
    /* A real engine fires onend after abort(), asynchronously. The page now
       depends on that to drive the post-TTS restart, so the fake must model it
       rather than dying silently. */
    abort() {
      this.aborted++;
      this.live = false;
      this._startGen++;                     // cancel any pending onstart
      clock.setTimeout(() => { if (this.onend) this.onend(); }, 0);
    }
    stop() { this.stopped++; this.live = false; }

    /* Deliver hypotheses the way a real engine does: results accumulate and
       resultIndex points at the first new one. */
    emit(list) {
      const results = list.map((r) => {
        const item = [{ transcript: r.text, confidence: 0.9 }];
        item.isFinal = !!r.isFinal;
        item.length = 1;
        return item;
      });
      results.length = list.length;
      if (this.onresult) this.onresult({ resultIndex: 0, results });
    }
    /* One hypothesis at a time, as an independent result event — the shape
       Android Chrome uses when it restates a growing utterance. */
    emitOne(text, isFinal) {
      const item = [{ transcript: text, confidence: 0.9 }];
      item.isFinal = !!isFinal;
      const results = [item];
      results.length = 1;
      if (this.onresult) this.onresult({ resultIndex: 0, results });
    }
    /* The other real shape: results accumulate across events and resultIndex
       points at the first unseen one. */
    emitAppend(text, isFinal) {
      this._acc = this._acc || [];
      const item = [{ transcript: text, confidence: 0.9 }];
      item.isFinal = !!isFinal;
      const resultIndex = this._acc.length;
      this._acc.push(item);
      const results = this._acc.slice();
      results.length = this._acc.length;
      if (this.onresult) this.onresult({ resultIndex, results });
    }
    fireEnd() { this.live = false; if (this.onend) this.onend(); }
    fireError(code) { if (this.onerror) this.onerror({ error: code }); }
  }

  const sandbox = {
    console,
    Promise,
    Date: new Proxy(Date, { apply: () => new Date(clock.now()), construct: (T, a) => new T(...a) }),
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (id) => clock.clearTimeout(id),
    setInterval: (fn, ms) => clock.setInterval(fn, ms),
    clearInterval: (id) => clock.clearTimeout(id),
    JSON, Math, String, Number, Object, Array, Error, RegExp, parseInt, parseFloat, isNaN,
    SpeechSynthesisUtterance: function (text) { this.text = text; this.lang = ""; },
    fetch: function (url, init) {
      gatewayCalls.push({ url, body: JSON.parse(init.body) });
      const payload = JSON.parse(init.body);
      const responder = opts.gateway || defaultGateway;
      const body = responder(payload, gatewayCalls.length);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(JSON.parse(JSON.stringify(body))),
        text: () => Promise.resolve(JSON.stringify(body))
      });
    }
  };
  sandbox.Date.now = () => clock.now();

  sandbox.window = {
    SpeechRecognition: FakeRecognition,
    isSecureContext: true,
    addEventListener() {},
    /* A speechSynthesis that models the thing that actually causes the bug:
       the loudspeaker stays live for a real, measurable stretch of time, and
       `speaking` reports it. Utterance length scales with the text. */
    speechSynthesis: {
      speaking: false,
      pending: false,
      getVoices: () => [{ lang: "es-ES", name: "es" }],
      addEventListener() {},
      cancel() {
        this.speaking = false;
        this.pending = false;
        this._gen = (this._gen || 0) + 1;
      },
      speak(u) {
        spoken.push(u.text);
        const synth = this;
        const gen = (synth._gen = (synth._gen || 0) + 1);
        synth.speaking = true;
        const ms = Math.max(400, String(u.text).length * 60);
        clock.setTimeout(() => {
          if (gen !== synth._gen) return;        // cancelled mid-utterance
          synth.speaking = false;
          if (u.onend) u.onend();
        }, ms);
      }
    }
  };
  /* A browser with no speech synthesis at all. The TTS gate has nothing to
     gate in that configuration, which is exactly where the circuit breaker is
     the only backstop left. */
  if (opts.noTts) delete sandbox.window.speechSynthesis;

  /* Track microphone acquisition. Each getUserMedia is a fresh capture route
     on the device, which is the leading suspect for the clicks Luis hears. */
  const mic = { acquisitions: 0, open: 0, deny: false, order: [] };
  sandbox.navigator = {
    mediaDevices: {
      getUserMedia: () => {
        mic.acquisitions++;
        if (mic.deny) {
          mic.order.push("probe.denied");
          return Promise.reject(new Error("NotAllowedError"));
        }
        mic.open++;
        const track = {
          stop() {
            if (!track._stopped) { track._stopped = true; mic.open--; mic.order.push("probe.stop"); }
          }
        };
        // Resolve on a later turn, the way a real permission prompt does, so a
        // path that starts the recogniser synchronously is caught.
        return new Promise((res) => setImmediate(() => {
          mic.order.push("probe.resolved");
          res({ getTracks: () => [track] });
        }));
      }
    }
  };
  const visibilityHandlers = [];
  sandbox.document = {
    visibilityState: "visible",
    addEventListener(type, fn) { if (type === "visibilitychange") visibilityHandlers.push(fn); },
    getElementById: getEl,
    querySelectorAll: (sel) => (sel === ".screen" ? [getEl("login-screen"), getEl("chat-screen")] : []),
    createElement: () => makeEl("created")
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readPageScript(opts), sandbox, { filename: "voice-v2.html" });

  const api = {
    clock, els, recognizers, spoken, gatewayCalls, sandbox,
    el: getEl,
    current: () => recognizers.filter((r) => r.live).slice(-1)[0] || recognizers.slice(-1)[0],
    /* Log in without touching auth logic: drive the real login handler. */
    login() {
      getEl("phone4").value = "1234";
      getEl("password").value = "x";
      getEl("login-btn").fire("click");
      return flush(clock);
    },
    startVoice() { getEl("mic-btn").fire("click"); return flush(clock); },
    mute() { getEl("v-mute").fire("click"); return flush(clock); },
    endVoice() { getEl("v-end").fire("click"); return flush(clock); },
    async settle(ms) {
      let left = ms === undefined ? 1000 : ms;
      const step = Math.max(1, Math.ceil(left / 20));
      while (left > 0) { const s = Math.min(step, left); clock.tick(s); left -= s; await flush(clock); }
      await flush(clock);
    },
    /* Gateway calls that carry a conversational turn, excluding the login
       handshake (which is identified by factor_provided). */
    turnRequests() {
      return gatewayCalls.filter((c) => c.body.factor_provided === undefined);
    },
    /* The page keeps its counters inside a closure. The diagnostic panel is
       the supported way to read them, so the tests read exactly what Luis
       reads on the phone rather than reaching into private state. */
    diag() {
      const panel = getEl("mic-diag");
      const toggle = getEl("diag-toggle");
      if (panel.classes.has("visible")) toggle.fire("click");   // hide...
      toggle.fire("click");                                     // ...and re-render
      const out = {};
      String(panel.textContent).split("\n").forEach((line) => {
        const i = line.indexOf(":");
        if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      return out;
    },
    stat(name) { return Number(api.diag()[name]); },
    /* The page's own event trace, newest first, as the phone shows it. */
    trace() {
      const panel = getEl("mic-diag");
      const toggle = getEl("diag-toggle");
      if (panel.classes.has("visible")) toggle.fire("click");
      toggle.fire("click");
      const txt = String(panel.textContent);
      const i = txt.indexOf("-- event trace");
      return i < 0 ? [] : txt.slice(i).split("\n").slice(1).filter((l) => l.trim());
    },
    traceHas(name) { return api.trace().some((l) => l.indexOf(name) >= 0); },
    /* The per-session ledger rows, newest first. */
    sessionRows() { return api.diagSection("-- recogniser sessions", "-- session start"); },
    /* The pinned session-start events. */
    traceHeadLines() { return api.diagSection("-- session start", "-- event trace"); },
    diagSection(from, to) {
      const panel = getEl("mic-diag");
      const toggle = getEl("diag-toggle");
      if (panel.classes.has("visible")) toggle.fire("click");
      toggle.fire("click");
      const txt = String(panel.textContent);
      const i = txt.indexOf(from);
      if (i < 0) return [];
      const j = txt.indexOf(to, i);
      return txt.slice(i, j < 0 ? undefined : j).split("\n").slice(1).filter((l) => l.trim());
    },
    /* How many times the device microphone was acquired from scratch. */
    micAcquisitions() { return mic.acquisitions; },
    /* How many capture streams are open right now. */
    micStreamsOpen() { return mic.open; },
    /* Interleaved record of probe resolution, temporary-stream release and
       recogniser start, so ordering bugs are visible rather than inferred. */
    micOrder() { return mic.order.slice(); },
    resetMicOrder() { mic.order.length = 0; },
    denyMic(on) { mic.deny = on !== false; },
    phase() { return api.diag()["phase"]; },
    /* The composite state the engine reports: LISTENING, USER_SPEAKING,
       USER_PAUSED, ASSISTANT_SPEAKING, MANUALLY_MUTED, THINKING, OFF. */
    state() { return api.diag()["state"]; },
    muted() { return api.diag()["manually muted"] === "true"; },
    buffered() { return JSON.parse(api.diag()["turn buffered"] || '""'); },
    /* Drive the page the way a browser does when the screen dims or the
       notification shade opens. */
    setVisibility(v) {
      sandbox.document.visibilityState = v;
      (visibilityHandlers || []).forEach((fn) => fn({}));
      return flush(clock);
    },
    voiceActive() { return api.diag()["voice active"] === "true"; },
    loggedIn() { return getEl("chat-screen").classes.has("active"); },
    messages() { return getEl("messages").children.map((c) => c.className + "|" + c.textContent); },
    /* Is Panchita's loudspeaker live right now? */
    speaking() { return !!sandbox.window.speechSynthesis.speaking; },
    gate() { return api.diag()["tts gate"]; },
    /* Feed the microphone whatever the loudspeaker is currently playing, the
       way an Android phone does. Returns the fragments injected. */
    selfEcho(fragments) {
      const r = api.current();
      fragments.forEach((f) => r.emitAppend(f, true));
      return fragments;
    }
  };
  return api;
}

/* A Gateway that authenticates the first (login) request and answers the
   rest. It never leaves this process. */
function defaultGateway(payload, n) {
  if (payload.factor_provided !== undefined) {
    return { status: "completed", session_token: "test-session-1", human_readable_response: "Hola Luis." };
  }
  return { status: "completed", human_readable_response: "Respuesta " + n + "." };
}

/* Drain pending microtasks and any timer already due at the current instant,
   without advancing the fake clock. */
async function flush(clock) {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setImmediate(r));
    clock.tick(0);
  }
}

module.exports = { createApp, readPureHelpers, readPageScript, createClock, flush };
