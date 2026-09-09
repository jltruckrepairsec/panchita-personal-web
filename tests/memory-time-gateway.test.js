"use strict";
/*
 * Gates for the isolated Gateway candidate: candidate/gateway-time-memory-v1.js
 *
 * Offline and deterministic. No network, no n8n, no credentials.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MOD = path.join(__dirname, "..", "candidate", "gateway-time-memory-v1.js");
const G = require(MOD);

const TENANT = "jl-truck-repair-test";
const SESSION = "hash-session-A";
const IDENTITY = "owner-luis";

function liveSession(over) {
  return Object.assign({
    session_token_hash: SESSION,
    tenant_id: TENANT,
    identity_id: IDENTITY,
    expires_at: "2026-09-10T01:30:00.000Z"
  }, over || {});
}

let rowId = 0;
function row(role, content, turn_at, over) {
  return Object.assign({
    id: ++rowId,
    session_token_hash: SESSION,
    tenant_id: TENANT,
    identity_id: IDENTITY,
    role, content, turn_at
  }, over || {});
}

const NOW = Date.parse("2026-09-09T19:30:00.000Z");   // 14:30 CDT in Chicago

/* ===== 1. The current date is correct ==================================== */

test("the current date comes from the server runtime clock and is correct", () => {
  const t = G.resolveTimeContext({ serverNowMs: NOW, clientTimeZone: "America/Chicago" });
  assert.equal(t.local_date, "2026-09-09");
  assert.equal(t.local_time, "14:30");
  assert.equal(t.weekday_en, "Wednesday");
  assert.equal(t.weekday_es, "miércoles");
  assert.equal(t.long_date_es, "miércoles, 9 de septiembre de 2026");
  assert.equal(t.instant_utc, "2026-09-09T19:30:00.000Z");
  assert.equal(t.instant_source, "server_runtime_clock");
});

test("a phone with a wrong clock cannot change the date; the skew is flagged instead", () => {
  const t = G.resolveTimeContext({
    serverNowMs: NOW,
    clientTimeZone: "America/Chicago",
    clientNowIso: "2019-01-01T00:00:00.000Z"      // three years off
  });
  assert.equal(t.local_date, "2026-09-09");        // unchanged: the server's instant
  assert.equal(t.instant_utc, "2026-09-09T19:30:00.000Z");
  assert.ok(t.notes.includes("client_clock_skewed"));
  assert.match(G.buildTimeContextBlock(t), /phone's own clock disagrees/);
});

test("an unparseable client clock is noted, never adopted", () => {
  const t = G.resolveTimeContext({ serverNowMs: NOW, clientTimeZone: "UTC", clientNowIso: "not-a-date" });
  assert.equal(t.local_date, "2026-09-09");
  assert.ok(t.notes.includes("client_now_unparseable"));
});

test("without a runtime clock the builder fails closed rather than guessing", () => {
  assert.throws(() => G.resolveTimeContext({ clientTimeZone: "UTC" }), /serverNowMs is required/);
  assert.throws(() => G.resolveTimeContext({ serverNowMs: "now" }), /serverNowMs is required/);
});

test("the time block is always present in the assembled system message", () => {
  const block = G.buildSystemContextBlock({
    timeContext: G.resolveTimeContext({ serverNowMs: NOW, clientTimeZone: "America/Chicago" }),
    conversation: G.buildConversationContext({ session: liveSession(), rows: [], tenantId: TENANT, nowMs: NOW })
  });
  assert.match(block, /CURRENT DATE AND TIME \(authoritative/);
  assert.match(block, /2026-09-09/);
  assert.match(block, /never guess it/);
});

/* ===== 2. Local time zone handling is correct, or explicitly bounded ===== */

test("daylight saving is handled per instant, not per zone", () => {
  const summer = G.resolveTimeContext({ serverNowMs: Date.parse("2026-07-01T18:00:00Z"), clientTimeZone: "America/Chicago" });
  const winter = G.resolveTimeContext({ serverNowMs: Date.parse("2026-01-15T18:00:00Z"), clientTimeZone: "America/Chicago" });
  assert.equal(summer.utc_offset_minutes, -300);
  assert.equal(summer.utc_offset_label, "UTC-05:00");
  assert.equal(summer.local_time, "13:00");
  assert.equal(winter.utc_offset_minutes, -360);
  assert.equal(winter.utc_offset_label, "UTC-06:00");
  assert.equal(winter.local_time, "12:00");
});

test("late-UTC instants resolve to the correct earlier local date", () => {
  const t = G.resolveTimeContext({ serverNowMs: Date.parse("2026-09-10T02:30:00Z"), clientTimeZone: "America/Chicago" });
  assert.equal(t.local_date, "2026-09-09");     // still Wednesday evening in Chicago
  assert.equal(t.local_time, "21:30");
  assert.equal(t.local_iso, "2026-09-09T21:30:00-05:00");
});

test("a zone east of UTC is handled with the right sign", () => {
  const t = G.resolveTimeContext({ serverNowMs: NOW, clientTimeZone: "Europe/Madrid" });
  assert.equal(t.utc_offset_minutes, 120);
  assert.equal(t.utc_offset_label, "UTC+02:00");
  assert.equal(t.local_time, "21:30");
});

test("a device that reports no zone gets a bounded answer that declares the assumption", () => {
  const t = G.resolveTimeContext({ serverNowMs: NOW, defaultTimeZone: "America/Chicago" });
  assert.equal(t.time_zone, "America/Chicago");
  assert.equal(t.time_zone_source, "default");
  assert.equal(t.time_zone_is_assumed, true);
  assert.ok(t.notes.includes("client_time_zone_absent"));
  const block = G.buildTimeContextBlock(t);
  assert.match(block, /did not report a time zone/);
  assert.match(block, /say which time zone you are assuming/);
});

test("a bogus zone name is rejected and falls back to the declared default", () => {
  const t = G.resolveTimeContext({
    serverNowMs: NOW, clientTimeZone: "Mars/Olympus_Mons", defaultTimeZone: "America/Chicago"
  });
  assert.equal(t.time_zone, "America/Chicago");
  assert.equal(t.time_zone_is_assumed, true);
  assert.ok(t.notes.includes("client_time_zone_invalid"));
  assert.match(G.buildTimeContextBlock(t), /is an assumption/);
});

test("an unusable default degrades to UTC rather than to an invented zone", () => {
  const t = G.resolveTimeContext({ serverNowMs: NOW, defaultTimeZone: "Nowhere/Nothing" });
  assert.equal(t.time_zone, "UTC");
  assert.equal(t.utc_offset_minutes, 0);
  assert.equal(t.time_zone_is_assumed, true);
});

test("the zone rule wins over a mismatched client offset, and the mismatch is flagged", () => {
  const t = G.resolveTimeContext({
    serverNowMs: NOW, clientTimeZone: "America/Chicago", clientUtcOffsetMinutes: 540
  });
  assert.equal(t.utc_offset_minutes, -300);       // computed from the zone, not the claim
  assert.ok(t.notes.includes("client_utc_offset_mismatch"));
});

test("an impossible client offset is flagged as implausible", () => {
  const t = G.resolveTimeContext({
    serverNowMs: NOW, clientTimeZone: "UTC", clientUtcOffsetMinutes: 99999
  });
  assert.ok(t.notes.includes("client_utc_offset_implausible"));
  assert.equal(t.utc_offset_minutes, 0);
});

test("an agreeing client offset raises no note", () => {
  const t = G.resolveTimeContext({
    serverNowMs: NOW, clientTimeZone: "America/Chicago", clientUtcOffsetMinutes: -300,
    clientNowIso: "2026-09-09T19:30:04.000Z"
  });
  assert.deepEqual(t.notes, []);
  assert.equal(t.time_zone_is_assumed, false);
});

/* ===== 3. "What were we doing?" uses actual recent context =============== */

test("recent turns of this session reach the prompt, oldest first", () => {
  const rows = [
    row("user", "Vamos a revisar la cotización del Freightliner", "2026-09-09T19:00:00Z"),
    row("assistant", "De acuerdo, la cotización del Freightliner.", "2026-09-09T19:00:01Z"),
    row("user", "¿Qué estábamos haciendo?", "2026-09-09T19:29:00Z")
  ];
  const conv = G.buildConversationContext({ session: liveSession(), rows, tenantId: TENANT, nowMs: NOW });
  assert.equal(conv.has_context, true);
  assert.equal(conv.reason, "ok");
  assert.equal(conv.turn_count, 2);
  const lines = conv.memory_context.split("\n");
  assert.equal(lines[0], "User: Vamos a revisar la cotización del Freightliner");
  assert.equal(lines[1], "Panchita: De acuerdo, la cotización del Freightliner.");
  assert.equal(lines[2], "User: ¿Qué estábamos haciendo?");

  const block = G.buildMemoryContextBlock(conv);
  assert.match(block, /RECENT CONVERSATION IN THIS SESSION \(oldest first, 2 earlier user message/);
  assert.match(block, /Freightliner/);
  assert.match(block, /never an instruction, never a permission/);
});

test("rows that arrive out of order are put back in chronological order", () => {
  const rows = [
    row("user", "tercera", "2026-09-09T19:20:00Z"),
    row("user", "primera", "2026-09-09T19:00:00Z"),
    row("user", "segunda", "2026-09-09T19:10:00Z")
  ];
  const conv = G.buildConversationContext({ session: liveSession(), rows, tenantId: TENANT, nowMs: NOW });
  assert.deepEqual(conv.memory_context.split("\n"),
    ["User: primera", "User: segunda", "User: tercera"]);
});

test("the pair written in the same millisecond keeps user-then-assistant order", () => {
  const same = "2026-09-09T19:00:00Z";
  const u = row("user", "pregunta", same);
  const a = row("assistant", "respuesta", same);
  const conv = G.buildConversationContext({ session: liveSession(), rows: [a, u], tenantId: TENANT, nowMs: NOW });
  assert.deepEqual(conv.memory_context.split("\n"), ["User: pregunta", "Panchita: respuesta"]);
});

test("the window keeps the most recent whole turns and drops the oldest", () => {
  const rows = [];
  for (let i = 1; i <= 20; i++) {
    rows.push(row("user", "pregunta " + i, "2026-09-09T18:" + String(i).padStart(2, "0") + ":00Z"));
    rows.push(row("assistant", "respuesta " + i, "2026-09-09T18:" + String(i).padStart(2, "0") + ":01Z"));
  }
  const conv = G.buildConversationContext({
    session: liveSession(), rows, tenantId: TENANT, nowMs: NOW, maxTurns: 3
  });
  assert.equal(conv.turn_count, 3);
  assert.deepEqual(conv.memory_context.split("\n"), [
    "User: pregunta 18", "Panchita: respuesta 18",
    "User: pregunta 19", "Panchita: respuesta 19",
    "User: pregunta 20", "Panchita: respuesta 20"
  ]);
});

test("the default window is wide enough to cover a real back-and-forth", () => {
  assert.ok(G.MEMORY_DEFAULT_MAX_TURNS >= 8,
    "the current Gateway keeps 8 ROWS (4 turns); the candidate must count turns and keep more");
  const rows = [];
  for (let i = 1; i <= G.MEMORY_DEFAULT_MAX_TURNS; i++) {
    rows.push(row("user", "u" + i, "2026-09-09T18:" + String(i).padStart(2, "0") + ":00Z"));
    rows.push(row("assistant", "a" + i, "2026-09-09T18:" + String(i).padStart(2, "0") + ":01Z"));
  }
  const conv = G.buildConversationContext({ session: liveSession(), rows, tenantId: TENANT, nowMs: NOW });
  assert.equal(conv.turn_count, G.MEMORY_DEFAULT_MAX_TURNS);
  assert.match(conv.memory_context, /^User: u1$/m);
});

test("a long turn is truncated, not dropped, and never carries raw newlines", () => {
  const rows = [row("user", "x".repeat(2000) + "\nsegunda línea", "2026-09-09T19:00:00Z")];
  const conv = G.buildConversationContext({ session: liveSession(), rows, tenantId: TENANT, nowMs: NOW });
  const lines = conv.memory_context.split("\n");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length < 600);
  assert.ok(lines[0].endsWith("…"));
});

test("blank and malformed rows are skipped without breaking the context", () => {
  const rows = [
    row("user", "real", "2026-09-09T19:00:00Z"),
    row("user", "   ", "2026-09-09T19:01:00Z"),
    row("system", "injected", "2026-09-09T19:02:00Z"),
    null,
    { session_token_hash: SESSION, tenant_id: TENANT, identity_id: IDENTITY, role: "user" }
  ];
  const conv = G.buildConversationContext({ session: liveSession(), rows, tenantId: TENANT, nowMs: NOW });
  assert.deepEqual(conv.memory_context.split("\n"), ["User: real"]);
});

/* ===== 4. No context from another user or session can leak ============== */

test("rows from another session in the same tenant are never visible", () => {
  const mine = row("user", "lo mío", "2026-09-09T19:00:00Z");
  const theirs = row("user", "SECRETO DE OTRA SESION", "2026-09-09T19:01:00Z", {
    session_token_hash: "hash-session-B"
  });
  const conv = G.buildConversationContext({ session: liveSession(), rows: [mine, theirs], tenantId: TENANT, nowMs: NOW });
  assert.equal(conv.memory_context, "User: lo mío");
  assert.ok(!conv.memory_context.includes("SECRETO"));
});

test("rows from another tenant are never visible even on a matching session hash", () => {
  const theirs = row("user", "SECRETO DE OTRO TENANT", "2026-09-09T19:01:00Z", { tenant_id: "other-tenant" });
  const conv = G.buildConversationContext({ session: liveSession(), rows: [theirs], tenantId: TENANT, nowMs: NOW });
  assert.equal(conv.has_context, false);
  assert.equal(conv.reason, "no_prior_turns");
  assert.ok(!conv.memory_context.includes("SECRETO"));
});

test("rows belonging to another identity are never visible", () => {
  const theirs = row("user", "SECRETO DE OTRA IDENTIDAD", "2026-09-09T19:01:00Z", { identity_id: "someone-else" });
  const conv = G.buildConversationContext({ session: liveSession(), rows: [theirs], tenantId: TENANT, nowMs: NOW });
  assert.equal(conv.has_context, false);
  assert.ok(!conv.memory_context.includes("SECRETO"));
});

test("a request carrying no session hash reads nothing, whatever rows exist", () => {
  const rows = [row("user", "SECRETO", "2026-09-09T19:00:00Z")];
  assert.deepEqual(G.selectMemoryRows(rows, { sessionTokenHash: "", tenantId: TENANT }), []);
  const conv = G.buildConversationContext({
    session: liveSession({ session_token_hash: "" }), rows, tenantId: TENANT, nowMs: NOW
  });
  assert.equal(conv.has_context, false);
  assert.equal(conv.reason, "no_session");
});

test("a session belonging to another tenant is refused before any row is read", () => {
  const rows = [row("user", "SECRETO", "2026-09-09T19:00:00Z")];
  const conv = G.buildConversationContext({
    session: liveSession({ tenant_id: "other-tenant" }), rows, tenantId: TENANT, nowMs: NOW
  });
  assert.equal(conv.has_context, false);
  assert.equal(conv.reason, "cross_tenant");
  assert.ok(!conv.memory_context.includes("SECRETO"));
});

test("the request's tenant, not the session's, is what the rows must match", () => {
  const rows = [row("user", "SECRETO", "2026-09-09T19:00:00Z")];
  const conv = G.buildConversationContext({ session: liveSession(), rows, tenantId: "", nowMs: NOW });
  assert.equal(conv.has_context, false);
  assert.equal(conv.reason, "cross_tenant");
});

/* ===== 5. Expired / revoked sessions retain no conversational authority == */

test("an expired session reads no conversation memory", () => {
  const rows = [row("user", "SECRETO", "2026-09-09T19:00:00Z")];
  const conv = G.buildConversationContext({
    session: liveSession({ expires_at: "2026-09-09T19:29:59.000Z" }), rows, tenantId: TENANT, nowMs: NOW
  });
  assert.equal(conv.has_context, false);
  assert.equal(conv.reason, "session_expired");
  assert.ok(!conv.memory_context.includes("SECRETO"));
});

test("a session expiring exactly now is already expired", () => {
  const conv = G.buildConversationContext({
    session: liveSession({ expires_at: new Date(NOW).toISOString() }),
    rows: [row("user", "x", "2026-09-09T19:00:00Z")], tenantId: TENANT, nowMs: NOW
  });
  assert.equal(conv.reason, "session_expired");
});

test("a session with no or unreadable expiry is treated as expired, not as eternal", () => {
  for (const bad of [undefined, "", "whenever"]) {
    const conv = G.buildConversationContext({
      session: liveSession({ expires_at: bad }),
      rows: [row("user", "x", "2026-09-09T19:00:00Z")], tenantId: TENANT, nowMs: NOW
    });
    assert.equal(conv.reason, "session_expired", "expires_at=" + JSON.stringify(bad));
  }
});

test("a revoked session reads no conversation memory even before its expiry", () => {
  const rows = [row("user", "SECRETO", "2026-09-09T19:00:00Z")];
  for (const revoked of [{ status: "revoked" }, { status: "REVOKED" }, { revoked_at: "2026-09-09T19:10:00Z" }]) {
    const conv = G.buildConversationContext({
      session: liveSession(revoked), rows, tenantId: TENANT, nowMs: NOW
    });
    assert.equal(conv.has_context, false, JSON.stringify(revoked));
    assert.equal(conv.reason, "session_revoked");
    assert.ok(!conv.memory_context.includes("SECRETO"));
  }
});

test("buildConversationContext refuses to run without a runtime clock", () => {
  assert.throws(
    () => G.buildConversationContext({ session: liveSession(), rows: [], tenantId: TENANT }),
    /nowMs is required/
  );
});

/* ===== 6. Missing context produces honesty, not invention =============== */

test("no prior turns yields an explicit no-context marker and a do-not-invent instruction", () => {
  const conv = G.buildConversationContext({ session: liveSession(), rows: [], tenantId: TENANT, nowMs: NOW });
  assert.equal(conv.has_context, false);
  assert.equal(conv.reason, "no_prior_turns");
  assert.equal(conv.memory_context, G.NO_CONTEXT_MARKER);

  const block = G.buildMemoryContextBlock(conv);
  assert.match(block, /none available \(reason: no_prior_turns\)/);
  assert.match(block, /You have NO record of anything said earlier/);
  assert.match(block, /Never invent, guess at, summarise, or imply a conversation you cannot see/);
  assert.match(block, /ask him to remind you/);
});

test("the no-context block contains nothing that could be read as a transcript", () => {
  const conv = G.buildConversationContext({ session: liveSession(), rows: [], tenantId: TENANT, nowMs: NOW });
  const block = G.buildMemoryContextBlock(conv);
  assert.ok(!/^User: /m.test(block));
  assert.ok(!/^Panchita: /m.test(block));
});

test("every no-context reason produces the honest block, never a silent empty history", () => {
  const cases = [
    { session: null },
    { session: liveSession({ session_token_hash: "" }) },
    { session: liveSession({ status: "revoked" }) },
    { session: liveSession({ expires_at: "2000-01-01T00:00:00Z" }) },
    { session: liveSession({ tenant_id: "other" }) },
    { session: liveSession(), rows: [] }
  ];
  for (const c of cases) {
    const conv = G.buildConversationContext({
      session: c.session, rows: c.rows || [], tenantId: TENANT, nowMs: NOW
    });
    assert.equal(conv.has_context, false);
    assert.equal(conv.turn_count, 0);
    assert.match(G.buildMemoryContextBlock(conv), /You have NO record of anything said earlier/);
  }
});

test("the assembled system message keeps the base persona, the clock and the memory rules", () => {
  const conv = G.buildConversationContext({
    session: liveSession(),
    rows: [row("user", "hablábamos del Freightliner", "2026-09-09T19:00:00Z")],
    tenantId: TENANT, nowMs: NOW
  });
  const block = G.buildSystemContextBlock({
    timeContext: G.resolveTimeContext({ serverNowMs: NOW, clientTimeZone: "America/Chicago" }),
    conversation: conv
  });
  assert.match(block, /You are Panchita/);
  assert.match(block, /no ability to take real-world actions/);
  assert.match(block, /Never ask for, repeat, store, or guess a password/);
  assert.match(block, /CURRENT DATE AND TIME/);
  assert.match(block, /Freightliner/);
  /* Order matters: the persona and the clock must precede retrieved text, so
     history can never be read as overriding them. */
  assert.ok(block.indexOf("You are Panchita") < block.indexOf("CURRENT DATE AND TIME"));
  assert.ok(block.indexOf("CURRENT DATE AND TIME") < block.indexOf("RECENT CONVERSATION"));
});

/* ===== 7. The block really is paste-safe into an n8n Code node ========== */

test("the PURE HELPERS block evaluates standalone, with no require and no n8n globals", () => {
  const src = fs.readFileSync(MOD, "utf8");
  const start = src.indexOf("// ===== BEGIN PURE HELPERS");
  const end = src.indexOf("// ===== END PURE HELPERS");
  assert.ok(start >= 0 && end > start, "PURE HELPERS markers missing");
  const block = src.slice(start, end);
  assert.ok(!/\brequire\s*\(/.test(block), "the pasted block must not require() anything");
  assert.ok(!/\bmodule\.exports\b/.test(block));
  assert.ok(!/\$\(/.test(block), "the pasted block must not reach for n8n node references");

  const sandbox = { Intl, Date, Math, Number, String, Array, Object, JSON, isFinite, Error };
  vm.createContext(sandbox);
  vm.runInContext(block + "\n;this.__out = { resolveTimeContext, buildConversationContext, buildSystemContextBlock };", sandbox);
  const out = sandbox.__out;
  const t = out.resolveTimeContext({ serverNowMs: NOW, clientTimeZone: "America/Chicago" });
  assert.equal(t.local_date, "2026-09-09");
  const conv = out.buildConversationContext({ session: liveSession(), rows: [], tenantId: TENANT, nowMs: NOW });
  assert.equal(conv.has_context, false);
  assert.match(out.buildSystemContextBlock({ timeContext: t, conversation: conv }), /CURRENT DATE AND TIME/);
});
