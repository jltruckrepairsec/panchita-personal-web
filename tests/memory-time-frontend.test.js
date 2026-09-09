"use strict";
/*
 * Gates for the isolated frontend candidate: candidate/memory-time-v1.html
 *
 * The frontend's only new job is to report WHICH time zone the phone is in.
 * These tests hold that, and hold that nothing about authentication, session
 * handling or the on-device no-storage property moved. index.html and
 * voice-v2.html are read for comparison only and are never loaded or modified.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const H = require("./memory-time-harness.js");

const ROOT = path.join(__dirname, "..");
const CANDIDATE_SRC = fs.readFileSync(H.CANDIDATE, "utf8");
const NOW = Date.parse("2026-09-09T19:30:00.000Z");

/* ===== the runtime clock context reaches the Gateway ==================== */

test("every Gateway request carries the device clock context", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login();
  await app.send("¿qué estábamos haciendo?");
  await app.logout();

  assert.equal(app.gatewayCalls.length, 3);
  for (const call of app.gatewayCalls) {
    assert.equal(typeof call.body.client_now, "string");
    assert.equal(call.body.client_now, "2026-09-09T19:30:00.000Z");
    assert.equal(typeof call.body.client_time_zone, "string");
    assert.ok(call.body.client_time_zone.length > 0);
    assert.equal(typeof call.body.client_utc_offset_minutes, "number");
  }
});

test("the reported offset is east-positive and agrees with the reported zone", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login();
  const body = app.loginRequests()[0].body;
  const zone = body.client_time_zone;

  /* Recompute the zone's offset independently, in the east-positive
     convention the Gateway uses, and require the page to agree. */
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = {};
  dtf.formatToParts(new Date(NOW)).forEach((x) => { p[x.type] = x.value; });
  const hour = Number(p.hour) === 24 ? 0 : Number(p.hour);
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  assert.equal(body.client_utc_offset_minutes, Math.round((asUTC - NOW) / 60000));
});

test("client_now tracks the clock, so a stale value can never be replayed", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login();
  app.clock.tick(90 * 1000);
  await app.send("hola");
  const [first, second] = app.gatewayCalls;
  assert.equal(first.body.client_now, "2026-09-09T19:30:00.000Z");
  assert.equal(second.body.client_now, "2026-09-09T19:31:30.000Z");
});

test("a device with no resolvable time zone omits the field rather than sending a blank", async () => {
  const app = H.createApp({ startMs: NOW });
  /* Simulate a runtime whose Intl cannot resolve a zone. */
  app.sandbox.Intl = { DateTimeFormat: function () { throw new Error("no ICU"); } };
  await app.login();
  const body = app.loginRequests()[0].body;
  assert.ok(!("client_time_zone" in body),
    "an unknown zone must be absent, so the Gateway can say it is assuming one");
  assert.equal(typeof body.client_now, "string");
});

/* ===== the frontend cannot supply, forge or leak conversation memory ==== */

test("the page never sends conversation history of its own", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login();
  await app.send("primera");
  await app.send("¿qué estábamos haciendo?");

  const forbidden = ["history", "messages", "transcript", "memory", "context",
                     "recent_turns", "turns", "conversation"];
  for (const call of app.gatewayCalls) {
    for (const key of Object.keys(call.body)) {
      assert.ok(!forbidden.includes(key),
        "the frontend must not be able to assert conversation memory (found key " + key + ")");
    }
  }
  /* The second turn's payload carries only this turn's own text. */
  const last = app.turnRequests().slice(-1)[0].body;
  assert.equal(last.message, "¿qué estábamos haciendo?");
  assert.ok(!JSON.stringify(last).includes("primera"));
});

test("a turn request identifies the session and nothing more", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login();
  await app.send("hola");
  const body = app.turnRequests()[0].body;
  assert.deepEqual(Object.keys(body).sort(),
    ["client_now", "client_time_zone", "client_utc_offset_minutes", "language", "message", "session_id"].sort());
  assert.equal(body.session_id, "test-session-1");
});

test("logging out clears the on-screen transcript and returns to login", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login();
  await app.send("hablábamos del Freightliner");
  assert.ok(app.messages().some((m) => m.includes("Freightliner")));

  await app.logout();
  assert.equal(app.loggedIn(), false);
  assert.deepEqual(app.messages(), []);
  assert.deepEqual(app.logoutRequests()[0].body.action, "logout");
  assert.equal(app.logoutRequests()[0].body.session_id, "test-session-1");
});

test("a denied turn drops the session and wipes the transcript instead of chatting on", async () => {
  let n = 0;
  const app = H.createApp({
    startMs: NOW,
    gateway(payload) {
      n++;
      if (payload.factor_provided !== undefined) {
        return { status: "completed", session_token: "test-session-1", human_readable_response: "Hola." };
      }
      return { status: "denied", human_readable_response: "Tu sesión expiró." };
    }
  });
  await app.login();
  await app.send("¿qué estábamos haciendo?");
  assert.equal(app.loggedIn(), false);
  assert.deepEqual(app.messages(), []);

  /* And nothing further can be sent on the dead session. */
  const before = app.gatewayCalls.length;
  await app.send("otra vez");
  assert.equal(app.gatewayCalls.length, before);
});

test("the client-side expiry watch also wipes the transcript", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login();
  await app.send("hablábamos del Freightliner");
  assert.equal(app.loggedIn(), true);

  app.clock.tick(3600 * 1000 + 60 * 1000);   // past session_expires_at
  await H.flush(app.clock);
  assert.equal(app.loggedIn(), false);
  assert.deepEqual(app.messages(), []);
});

/* ===== nothing about authentication or storage moved =================== */

test("the authentication and session code is byte-identical to production", () => {
  for (const fn of ["doLogin", "doLogout", "clearSessionAndReturnToLogin", "sendMessage", "buildPhoneHint"]) {
    assert.equal(
      H.functionSource(H.CANDIDATE, fn),
      H.functionSource(H.PRODUCTION, fn),
      fn + "() differs from index.html -- the candidate must not touch the auth/session path"
    );
  }
});

test("the candidate talks to the same single Gateway endpoint and no other", () => {
  const urls = CANDIDATE_SRC.match(/https?:\/\/[^\s"')]+/g) || [];
  const external = urls.filter((u) => !u.startsWith("http://www.w3.org"));
  assert.deepEqual(external, ["https://panchita.app.n8n.cloud/webhook/panchita-personal-gateway-v01"]);

  const app = H.createApp({ startMs: NOW });
  return app.login().then(() => {
    for (const call of app.gatewayCalls) {
      assert.equal(call.url, "https://panchita.app.n8n.cloud/webhook/panchita-personal-gateway-v01");
    }
  });
});

test("the candidate still persists nothing on the device", () => {
  /* Comments are stripped first: the page documents the no-storage rule in
     prose, and the rule is about calls, not about the sentence describing it. */
  const code = H.readScript(H.CANDIDATE)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  for (const api of ["localStorage", "sessionStorage", "indexedDB", "IndexedDB",
                     "document.cookie", "openDatabase", "caches"]) {
    assert.ok(!code.includes(api), "candidate must not use " + api);
  }
  /* And the production page is held to the same rule, so this test is a real
     comparison and not a property only the candidate happens to have. */
  const prod = H.readScript(H.PRODUCTION)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.ok(!prod.includes("localStorage"));
});

test("the password is sent once at login and never again", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login("1234", "s3cret");
  await app.send("hola");
  await app.logout();

  const withFactor = app.gatewayCalls.filter((c) => JSON.stringify(c.body).includes("s3cret"));
  assert.equal(withFactor.length, 1);
  assert.equal(withFactor[0].body.factor_provided, "s3cret");
  assert.equal(app.el("password").value, "");
});

test("the login payload's authentication fields are unchanged", async () => {
  const app = H.createApp({ startMs: NOW });
  await app.login("1234", "s3cret");
  const body = app.loginRequests()[0].body;
  assert.equal(body.message, "Hola");
  assert.equal(body.language, "es");
  assert.equal(body.phone_hint, "XXX-XXX-1234");
  assert.equal(body.factor_provided, "s3cret");
  assert.ok(!("session_id" in body));
});

test("the candidate is a separate file and leaves the shipping pages alone", () => {
  const gitDiff = require("child_process")
    .execSync("git status --porcelain index.html voice-v2.html tests/harness.js tests/voice-v2-helpers.test.js tests/voice-v2-turn-assembly.test.js", { cwd: ROOT })
    .toString().trim();
  assert.equal(gitDiff, "", "the candidate must not modify index.html or any Voice v2 file");
});
