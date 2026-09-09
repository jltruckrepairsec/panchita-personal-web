"use strict";
/*
 * Append-only, hash-chained audit log.
 *
 * Every state change, gate decision, verdict and refusal lands here. The
 * chain is what makes the log worth reading: a record edited or removed after
 * the fact breaks verify(), so "there is an audit trail" is a checkable claim
 * rather than a promise.
 *
 * Builder may append. Builder may not rewrite -- append() returns a new log
 * and the entries it copies are frozen.
 */
const crypto = require("crypto");
const secrets = require("./secrets.js");

const GENESIS_HASH = "0".repeat(64);

class AuditError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuditError";
    this.code = code;
  }
}

/* Deterministic serialization: key order must not change a hash. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function hashEntry(entry) {
  const copy = Object.assign({}, entry);
  delete copy.hash;
  return sha256(canonical(copy));
}

function createLog(taskId) {
  return Object.freeze({ task_id: taskId || null, entries: Object.freeze([]) });
}

/*
 * append(log, record) -> new log
 *
 * record: { event, actor, actor_type, from_state, to_state, detail, evidence_ref, at }
 * Credential-shaped content is refused outright; sensitive field names are
 * masked before hashing, so the log can never become the leak.
 */
function append(log, record) {
  if (!log || !Array.isArray(log.entries)) throw new AuditError("bad_log", "append() needs a log from createLog().");
  const r = record && typeof record === "object" ? record : {};
  if (!r.event) throw new AuditError("missing_event", "Every audit entry needs an event.");
  if (!r.actor) throw new AuditError("missing_actor", "Every audit entry needs an actor.");

  secrets.assertClean(r);

  const prev = log.entries.length > 0 ? log.entries[log.entries.length - 1] : null;
  const entry = {
    seq: log.entries.length,
    at: r.at || new Date().toISOString(),
    task_id: log.task_id || r.task_id || null,
    event: String(r.event),
    actor: String(r.actor),
    actor_type: String(r.actor_type || "system"),
    from_state: r.from_state === undefined ? null : r.from_state,
    to_state: r.to_state === undefined ? null : r.to_state,
    outcome: r.outcome === undefined ? "recorded" : String(r.outcome),
    detail: secrets.redact(r.detail === undefined ? null : r.detail),
    evidence_ref: r.evidence_ref === undefined ? null : r.evidence_ref,
    prev_hash: prev ? prev.hash : GENESIS_HASH
  };
  entry.hash = hashEntry(entry);

  return Object.freeze({
    task_id: log.task_id,
    entries: Object.freeze(log.entries.concat([Object.freeze(entry)]))
  });
}

/* verify(log) -> { valid, broken_at, reason } */
function verify(log) {
  if (!log || !Array.isArray(log.entries)) return { valid: false, broken_at: null, reason: "not_a_log" };
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < log.entries.length; i++) {
    const e = log.entries[i];
    if (e.seq !== i) return { valid: false, broken_at: i, reason: "sequence_gap" };
    if (e.prev_hash !== prevHash) return { valid: false, broken_at: i, reason: "chain_break" };
    if (e.hash !== hashEntry(e)) return { valid: false, broken_at: i, reason: "content_tampered" };
    prevHash = e.hash;
  }
  return { valid: true, broken_at: null, reason: null };
}

/* The compact form Central's audit table and Luis's approval screen read. */
function summarize(log) {
  const entries = (log && log.entries) || [];
  return {
    task_id: (log && log.task_id) || null,
    entry_count: entries.length,
    head_hash: entries.length ? entries[entries.length - 1].hash : GENESIS_HASH,
    chain_valid: verify(log).valid,
    events: entries.map((e) => e.event)
  };
}

module.exports = { GENESIS_HASH, AuditError, canonical, sha256, createLog, append, verify, summarize };
