"use strict";
/*
 * Offline harness for candidate/memory-time-v1.html.
 *
 * Deliberately a separate file from tests/harness.js: that harness belongs to
 * the Voice v2 work happening in another session and is not touched here.
 *
 * Loads the REAL <script> body out of the candidate page into a vm sandbox
 * behind a minimal DOM and a fully controllable clock, so what is under test is
 * the code the page would actually ship. The network is a stub -- no request
 * leaves this process, and there is no key, token or endpoint in this file.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CANDIDATE = path.join(ROOT, "candidate", "memory-time-v1.html");
const PRODUCTION = path.join(ROOT, "index.html");

function readScript(file) {
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no <script> block found in " + file);
  return m[1];
}

/* Source of one top-level `function name() { ... }` inside a page's script,
   matched by brace balance. Used to prove the candidate leaves the
   authentication path byte-identical to production. */
function functionSource(file, name) {
  const src = readScript(file);
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function " + name + " not found in " + file);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced braces reading " + name + " from " + file);
}

function createClock(startMs) {
  let now = startMs === undefined ? Date.parse("2026-09-09T19:30:00.000Z") : startMs;
  let seq = 0;
  let timers = [];
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id) { timers = timers.filter((t) => t.id !== id); },
    setInterval(fn, ms) {
      const id = ++seq;
      const every = Math.max(1, ms || 1);
      const self = { id, fn: null };
      self.fn = () => { timers.push({ id, at: now + every, fn: self.fn }); fn(); };
      timers.push({ id, at: now + every, fn: self.fn });
      return id;
    },
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
    }
  };
}

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
    appendChild(c) { el.children.push(c); c.parent = el; return c; },
    removeChild(c) { el.children = el.children.filter((x) => x !== c); },
    remove() { if (el.parent) el.parent.removeChild(el); },
    /* Only the one selector the page actually uses. */
    querySelector(sel) {
      if (sel !== ".msg.system:last-child") throw new Error("unsupported selector " + sel);
      const sys = el.children.filter((c) => String(c.className).includes("system"));
      return sys.length ? sys[sys.length - 1] : null;
    },
    fire(type, ev) { (el.listeners[type] || []).forEach((fn) => fn(ev || {})); }
  };
  /* The page assigns innerHTML = "" to wipe the transcript. */
  Object.defineProperty(el, "innerHTML", {
    get: () => el._innerHTML || "",
    set: (v) => { el._innerHTML = v; if (v === "") el.children = []; }
  });
  return el;
}

function createApp(opts) {
  opts = opts || {};
  const clock = createClock(opts.startMs);
  const els = {};
  const spoken = [];
  const gatewayCalls = [];
  const getEl = (id) => (els[id] = els[id] || makeEl(id));

  const RealDate = Date;
  const sandbox = {
    console, Promise, Intl, JSON, Math, String, Number, Object, Array, Error, RegExp,
    parseInt, parseFloat, isNaN, isFinite,
    Date: new Proxy(RealDate, {
      apply: () => new RealDate(clock.now()).toString(),
      construct: (T, a) => (a.length ? new T(...a) : new T(clock.now()))
    }),
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (id) => clock.clearTimeout(id),
    setInterval: (fn, ms) => clock.setInterval(fn, ms),
    clearInterval: (id) => clock.clearTimeout(id),
    SpeechSynthesisUtterance: function (text) { this.text = text; this.lang = ""; },
    fetch: function (url, init) {
      const payload = JSON.parse(init.body);
      gatewayCalls.push({ url, body: payload });
      const responder = opts.gateway || defaultGateway;
      const body = responder(payload, gatewayCalls.length);
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(JSON.parse(JSON.stringify(body)))
      });
    }
  };
  sandbox.Date.now = () => clock.now();
  sandbox.window = {
    isSecureContext: true,
    addEventListener() {},
    speechSynthesis: {
      getVoices: () => [{ lang: "es-ES", name: "es" }],
      addEventListener() {}, cancel() {},
      speak(u) { spoken.push(u.text); }
    }
  };
  sandbox.navigator = { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) } };
  sandbox.location = { origin: "https://example.test" };
  sandbox.document = {
    visibilityState: "visible",
    addEventListener() {},
    getElementById: getEl,
    querySelectorAll: (sel) => (sel === ".screen" ? [getEl("login-screen"), getEl("chat-screen")] : []),
    createElement: () => makeEl("created")
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readScript(CANDIDATE), sandbox, { filename: "memory-time-v1.html" });

  const api = {
    clock, els, gatewayCalls, spoken, sandbox,
    el: getEl,
    login(last4, pass) {
      getEl("phone4").value = last4 === undefined ? "1234" : last4;
      getEl("password").value = pass === undefined ? "secret" : pass;
      getEl("login-btn").fire("click");
      return flush(clock);
    },
    send(text) {
      getEl("text-input").value = text;
      getEl("send-btn").fire("click");
      return flush(clock);
    },
    logout() { getEl("logout-btn").fire("click"); return flush(clock); },
    loggedIn() { return getEl("chat-screen").classes.has("active"); },
    messages() { return getEl("messages").children.map((c) => c.className + "|" + c.textContent); },
    loginRequests() { return gatewayCalls.filter((c) => c.body.factor_provided !== undefined); },
    turnRequests() {
      return gatewayCalls.filter((c) => c.body.factor_provided === undefined && c.body.action !== "logout");
    },
    logoutRequests() { return gatewayCalls.filter((c) => c.body.action === "logout"); }
  };
  return api;
}

function defaultGateway(payload, n) {
  if (payload.factor_provided !== undefined) {
    return {
      status: "completed",
      session_token: "test-session-1",
      session_expires_at: new Date(Date.parse("2026-09-09T19:30:00.000Z") + 3600000).toISOString(),
      human_readable_response: "Hola Luis."
    };
  }
  return { status: "completed", human_readable_response: "Respuesta " + n + "." };
}

async function flush(clock) {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setImmediate(r));
    clock.tick(0);
  }
}

module.exports = { createApp, flush, readScript, functionSource, CANDIDATE, PRODUCTION };
