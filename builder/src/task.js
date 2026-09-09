"use strict";
/*
 * The Builder Task Record.
 *
 * One task = one unit of self-development work = one audit chain. The record
 * carries references, never credentials: no session token, no password, no
 * factor. Identity and tenancy arrive as opaque references that the Gateway
 * already resolved, and Builder treats them as labels it cannot act on.
 */
const crypto = require("crypto");
const policy = require("./policy.js");
const secrets = require("./secrets.js");
const audit = require("./audit.js");

const MAX_REQUEST_CHARS = 2000;

class TaskError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TaskError";
    this.code = code;
  }
}

/* Deterministic id when a seed is given (tests), random otherwise. */
function newTaskId(seed) {
  const basis = seed || crypto.randomBytes(12).toString("hex");
  return "bt-" + crypto.createHash("sha256").update(String(basis)).digest("hex").slice(0, 16);
}

/*
 * createTaskDraft(input) -> task
 *
 * input: {
 *   request_text, scope, budget_units,
 *   origin: { source, channel, correlation_id, request_id, language },
 *   requested_by: { identity_reference, tenant_reference },
 *   id_seed, now
 * }
 */
function createTaskDraft(input) {
  const i = input && typeof input === "object" ? input : {};

  /* Refuse before anything is stored: a credential must never reach the
     record, the log, or a prompt built from either. */
  secrets.assertClean({ request_text: i.request_text, scope: i.scope, origin: i.origin });

  const text = String(i.request_text || "").trim();
  if (!text) throw new TaskError("empty_request", "A Builder task needs a request.");
  if (text.length > MAX_REQUEST_CHARS) {
    throw new TaskError("request_too_long", "Request exceeds " + MAX_REQUEST_CHARS + " characters.");
  }

  const budget = Number(i.budget_units);
  if (!isFinite(budget) || budget <= 0) {
    throw new TaskError("no_budget", "A Builder task needs a declared, positive budget.");
  }

  /* Throws PolicyError for a scope Builder must not accept. */
  const risk_tier = policy.assertScopeAllowed(i.scope);

  const origin = i.origin && typeof i.origin === "object" ? i.origin : {};
  const by = i.requested_by && typeof i.requested_by === "object" ? i.requested_by : {};
  const now = i.now || new Date().toISOString();
  const id = newTaskId(i.id_seed || origin.correlation_id || text + now);

  const task = {
    id: id,
    created_at: now,
    state: "DRAFT",
    risk_tier: risk_tier,
    request_text: secrets.redact(text),
    scope: {
      surfaces: (i.scope && Array.isArray(i.scope.surfaces) ? i.scope.surfaces.slice() : []),
      paths: (i.scope && Array.isArray(i.scope.paths) ? i.scope.paths.slice() : []),
      target_environment: (i.scope && i.scope.target_environment) || "isolated",
      read_only: !!(i.scope && i.scope.read_only),
      writes_business_data: false
    },
    origin: {
      source: String(origin.source || "unknown"),
      channel: String(origin.channel || "unknown"),
      correlation_id: origin.correlation_id || null,
      request_id: origin.request_id || null,
      language: origin.language === "es" ? "es" : "en"
    },
    /* References only. There is no session_id field by design. */
    requested_by: {
      identity_reference: by.identity_reference || null,
      tenant_reference: by.tenant_reference || null
    },
    budget_units: budget,
    spent_units: 0,
    plan: null,
    workspace: null,
    candidate: null,
    test_result: null,
    evidence_submission: null,
    guardian: null,
    rollback_plan: null,
    approvals: [],
    rework_attempts: 0,
    blocked_reason: null,
    audit: audit.createLog(id)
  };

  task.audit = audit.append(task.audit, {
    event: "TASK_CREATED",
    actor: "builder",
    actor_type: "automation",
    to_state: "DRAFT",
    at: now,
    detail: { risk_tier: risk_tier, budget_units: budget, source: task.origin.source }
  });

  return task;
}

/* The view Luis and Central see. No internals, no raw artifacts. */
function publicView(task) {
  const t = task || {};
  return {
    task_id: t.id || null,
    state: t.state || null,
    risk_tier: t.risk_tier || null,
    request: t.request_text || null,
    guardian_verdict: t.guardian ? t.guardian.verdict : null,
    tests: t.test_result ? { status: t.test_result.status, suites: t.test_result.suites || null } : null,
    awaiting: t.state === "AWAITING_OWNER_APPROVAL" ? "owner_approval" : null,
    budget: { declared: t.budget_units || 0, spent: t.spent_units || 0 },
    audit: audit.summarize(t.audit || audit.createLog(t.id || null)),
    blocked_reason: t.blocked_reason || null
  };
}

module.exports = { MAX_REQUEST_CHARS, TaskError, newTaskId, createTaskDraft, publicView };
