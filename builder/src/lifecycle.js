"use strict";
/*
 * Builder task lifecycle.
 *
 * The gates in this file are the whole point. A transition is not "allowed
 * unless something objects" -- each event names the gates it must clear, and
 * a gate that cannot be evaluated is a gate that failed.
 *
 * Two structural rules:
 *   1. AUTONOMOUS_CEILING is AWAITING_OWNER_APPROVAL. Builder can reach that
 *      state on its own and no further, ever.
 *   2. Events in HUMAN_ONLY_EVENTS require actor_type 'human_owner'. Builder
 *      calling them with its own actor is refused and the refusal is audited.
 *
 * transition() does not throw on a refused gate: it returns { ok:false } with
 * the refusal appended to the task's audit chain, because a blocked attempt
 * is exactly the kind of thing the trail should show.
 */
const audit = require("./audit.js");
const policy = require("./policy.js");
const secrets = require("./secrets.js");
const cost = require("./cost.js");
const approval = require("./approval.js");
const rollback = require("./rollback.js");
const verdictLib = require("./verdict.js");

const STATES = [
  "DRAFT",
  "SPECIFIED",
  "PLANNED",
  "APPROVED_TO_BUILD",
  "WORKSPACE_READY",
  "CANDIDATE_READY",
  "TESTS_PASSED",
  "TESTS_FAILED",
  "EVIDENCE_SUBMITTED",
  "GUARDIAN_CLEARED",
  "GUARDIAN_BLOCKED",
  "AWAITING_OWNER_APPROVAL",
  "APPROVED_FOR_DEPLOY",
  "DEPLOYED",
  "MONITORING",
  "COMPLETED",
  "ROLLED_BACK",
  "REJECTED",
  "ABANDONED",
  "BLOCKED"
];

const AUTONOMOUS_CEILING = "AWAITING_OWNER_APPROVAL";
const TERMINAL_STATES = ["COMPLETED", "ROLLED_BACK", "REJECTED", "ABANDONED"];
const HUMAN_ONLY_EVENTS = ["APPROVE_PLAN", "APPROVE_DEPLOY", "DEPLOY", "ROLLBACK", "COMPLETE", "REJECT"];
const MAX_REWORK_ATTEMPTS = 3;

/* Phase switches. The isolated phase this repository implements has
   deployment off at the machine level, not by convention. */
const DEFAULT_PHASE = Object.freeze({
  deployment_enabled: false,
  guardian_endpoint_wired: false
});

const TRANSITIONS = {
  SPECIFY: { from: ["DRAFT"], to: "SPECIFIED" },
  PLAN: { from: ["SPECIFIED", "TESTS_FAILED"], to: "PLANNED" },
  APPROVE_PLAN: { from: ["PLANNED"], to: "APPROVED_TO_BUILD" },
  PROVISION: { from: ["APPROVED_TO_BUILD"], to: "WORKSPACE_READY" },
  BUILD: { from: ["WORKSPACE_READY"], to: "CANDIDATE_READY" },
  TEST: { from: ["CANDIDATE_READY"], to: null /* decided by the result */ },
  REWORK: { from: ["TESTS_FAILED"], to: "WORKSPACE_READY" },
  SUBMIT_EVIDENCE: { from: ["TESTS_PASSED"], to: "EVIDENCE_SUBMITTED" },
  RECORD_VERDICT: { from: ["EVIDENCE_SUBMITTED"], to: null /* decided by the verdict */ },
  REQUEST_OWNER_APPROVAL: { from: ["GUARDIAN_CLEARED"], to: "AWAITING_OWNER_APPROVAL" },
  APPROVE_DEPLOY: { from: ["AWAITING_OWNER_APPROVAL"], to: "APPROVED_FOR_DEPLOY" },
  DEPLOY: { from: ["APPROVED_FOR_DEPLOY"], to: "DEPLOYED" },
  MONITOR: { from: ["DEPLOYED"], to: "MONITORING" },
  COMPLETE: { from: ["MONITORING"], to: "COMPLETED" },
  ROLLBACK: { from: ["DEPLOYED", "MONITORING"], to: "ROLLED_BACK" },
  REJECT: { from: STATES.filter((s) => TERMINAL_STATES.indexOf(s) < 0), to: "REJECTED" },
  ABANDON: { from: STATES.filter((s) => TERMINAL_STATES.indexOf(s) < 0), to: "ABANDONED" },
  BLOCK: { from: STATES.filter((s) => TERMINAL_STATES.indexOf(s) < 0), to: "BLOCKED" }
};

class GateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GateError";
    this.code = code;
  }
}

function gate(condition, code, message) {
  if (!condition) throw new GateError(code, message);
}

function clone(task) {
  const copy = Object.assign({}, task);
  copy.scope = Object.assign({}, task.scope);
  copy.approvals = (task.approvals || []).slice();
  return copy;
}

/* ---- per-event gates ---------------------------------------------------- */

const GATES = {
  SPECIFY(task, ctx) {
    gate(!!task.request_text, "no_request", "Nothing to specify.");
    policy.assertScopeAllowed(task.scope);
    secrets.assertClean({ request: task.request_text, scope: task.scope, payload: ctx.payload });
    return { spec: (ctx.payload && ctx.payload.spec) || null };
  },

  PLAN(task, ctx) {
    const plan = ctx.payload && ctx.payload.plan;
    gate(plan && Array.isArray(plan.steps) && plan.steps.length > 0, "no_plan", "A plan needs steps.");
    /* Quality floor before cost: the cheap plan is not allowed to be the
       unsafe one. */
    cost.assertQualityFloor(plan.steps);
    cost.assertNoUnapprovedPaidActivation(plan.steps, task.approvals);
    const optimized = cost.applyCostOptimization(plan.steps, task.budget_units);
    gate(optimized.within_budget, "over_budget",
      "Plan estimates " + optimized.estimated_units + " units against a budget of " + task.budget_units + ".");
    /* The way back is designed before the way forward. */
    const plan_rollback = ctx.payload.rollback_plan || plan.rollback_plan;
    rollback.validateRollbackPlan(plan_rollback);
    return { plan: Object.assign({}, plan, { steps: optimized.steps, dropped_steps: optimized.dropped, estimated_units: optimized.estimated_units }), rollback_plan: plan_rollback };
  },

  APPROVE_PLAN(task, ctx) {
    const a = approval.verifyApproval(ctx.approvals || task.approvals, { task_id: task.id, stage: "plan", now: ctx.now });
    return { approval: a };
  },

  PROVISION(task, ctx) {
    const ws = ctx.payload && ctx.payload.workspace;
    policy.assertWorkspaceIsolated(ws);
    /* The workspace may not be able to write anywhere the task did not
       declare. */
    const declared = task.scope.paths || [];
    const extra = (ws.writable_paths || []).filter((p) => declared.indexOf(p) < 0);
    gate(extra.length === 0, "workspace_scope_drift",
      "Workspace can write paths the task never declared: " + extra.join(", ") + ".");
    return { workspace: ws };
  },

  BUILD(task, ctx) {
    const candidate = ctx.payload && ctx.payload.candidate;
    gate(candidate && Array.isArray(candidate.changed_paths), "no_candidate", "A build produces a candidate with changed_paths.");
    const declared = task.scope.paths || [];
    const outside = candidate.changed_paths.filter((p) => declared.indexOf(p) < 0);
    gate(outside.length === 0, "out_of_scope_change",
      "Candidate changes paths outside the approved scope: " + outside.join(", ") + ".");
    const production = candidate.changed_paths.filter(policy.isProductionPath);
    gate(production.length === 0, "production_path_touched",
      "Candidate touches production-owned path(s): " + production.join(", ") + ".");
    secrets.assertClean(candidate);
    return { candidate: candidate };
  },

  TEST(task, ctx) {
    const result = ctx.payload && ctx.payload.test_result;
    gate(result && typeof result === "object", "no_test_result", "TEST needs a result.");
    /* A narrated "tests passed" is not a test result. */
    gate(!!result.executionId, "not_a_real_execution", "Test evidence must carry a real execution id.");
    gate(!!result.status, "no_test_status", "Test evidence must carry a status.");
    gate(typeof result.total === "number" && result.total > 0, "no_tests_ran",
      "Zero tests is not a passing run.");
    return { test_result: result };
  },

  REWORK(task) {
    gate(task.rework_attempts < MAX_REWORK_ATTEMPTS, "rework_limit",
      "Reached " + MAX_REWORK_ATTEMPTS + " rework attempts; this needs Luis, not another loop.");
    return {};
  },

  SUBMIT_EVIDENCE(task, ctx) {
    const submission = ctx.payload && ctx.payload.evidence_submission;
    gate(submission && submission.task_id === task.id, "evidence_task_mismatch", "Evidence must belong to this task.");
    gate(submission.requests_publish === false, "evidence_requests_publish",
      "Builder never requests publication.");
    secrets.assertClean(submission);
    return { evidence_submission: submission };
  },

  RECORD_VERDICT(task, ctx) {
    const raw = ctx.payload && ctx.payload.guardian_response;
    const interpreted = verdictLib.interpretVerdict(raw, { task_id: task.id });
    gate(!interpreted.tampered, "guardian_response_untrusted",
      "Guardian response failed its integrity check (" + interpreted.reason + ").");
    return { guardian: { verdict: interpreted.verdict, cleared: interpreted.cleared, reason: interpreted.reason, raw: raw } };
  },

  REQUEST_OWNER_APPROVAL(task) {
    gate(task.guardian && task.guardian.cleared === true, "guardian_not_cleared",
      "Guardian has not cleared this task.");
    gate(task.test_result && task.test_result.status === "success", "tests_not_passed",
      "A failed or missing test run blocks the approval request.");
    rollback.validateRollbackPlan(task.rollback_plan);
    return {};
  },

  APPROVE_DEPLOY(task, ctx) {
    gate(ctx.phase.deployment_enabled === true, "deployment_disabled",
      "Deployment is switched off in this phase. Builder recommends; it does not ship.");
    approval.verifyApproval(ctx.approvals || task.approvals, { task_id: task.id, stage: "deploy", now: ctx.now });
    return {};
  },

  DEPLOY(task, ctx) {
    gate(ctx.phase.deployment_enabled === true, "deployment_disabled", "Deployment is switched off in this phase.");
    rollback.validateRollbackPlan(task.rollback_plan);
    return {};
  },

  MONITOR() { return {}; },
  COMPLETE() { return {}; },

  ROLLBACK(task) {
    rollback.validateRollbackPlan(task.rollback_plan);
    return {};
  },

  REJECT(task, ctx) { return { blocked_reason: (ctx.payload && ctx.payload.reason) || "rejected_by_owner" }; },
  ABANDON(task, ctx) { return { blocked_reason: (ctx.payload && ctx.payload.reason) || "abandoned" }; },
  BLOCK(task, ctx) { return { blocked_reason: (ctx.payload && ctx.payload.reason) || "blocked" }; }
};

/* Events whose destination depends on the payload rather than the table. */
function resolveTarget(event, task, applied) {
  if (event === "TEST") return applied.test_result.status === "success" ? "TESTS_PASSED" : "TESTS_FAILED";
  if (event === "RECORD_VERDICT") return applied.guardian.cleared ? "GUARDIAN_CLEARED" : "GUARDIAN_BLOCKED";
  return TRANSITIONS[event].to;
}

/*
 * transition(task, event, ctx) -> { ok, task, error }
 *
 * ctx: { actor, actor_type, payload, approvals, phase, now, spend_units }
 * The returned task always carries a new audit entry -- the transition when
 * it succeeded, the refusal when it did not.
 */
function transition(task, event, ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const phase = Object.assign({}, DEFAULT_PHASE, c.phase || {});
  const actor = String(c.actor || "builder");
  const actor_type = String(c.actor_type || "automation");
  const now = c.now || new Date().toISOString();
  const from = task.state;

  const refuse = (code, message) => {
    const next = clone(task);
    next.audit = audit.append(task.audit, {
      event: event,
      actor: actor,
      actor_type: actor_type,
      from_state: from,
      to_state: from,
      outcome: "refused",
      at: now,
      detail: { code: code, message: message }
    });
    return { ok: false, task: next, error: new GateError(code, message) };
  };

  try {
    const rule = TRANSITIONS[event];
    if (!rule) return refuse("unknown_event", "No such lifecycle event: " + event + ".");
    if (rule.from.indexOf(from) < 0) {
      return refuse("illegal_transition", "Cannot " + event + " from " + from + ".");
    }
    if (HUMAN_ONLY_EVENTS.indexOf(event) >= 0 && actor_type !== "human_owner") {
      return refuse("human_only_event", event + " is Luis's decision; Builder cannot make it.");
    }
    /* The ceiling, restated as a runtime check rather than a comment. */
    const wouldExceed = ["APPROVED_FOR_DEPLOY", "DEPLOYED", "MONITORING"].indexOf(rule.to) >= 0;
    if (wouldExceed && actor_type !== "human_owner") {
      return refuse("autonomous_ceiling", "Builder stops at " + AUTONOMOUS_CEILING + ".");
    }

    const budget = cost.checkBudget((task.spent_units || 0) + (Number(c.spend_units) || 0), task.budget_units);
    if (!budget.ok) return refuse("budget_exceeded", "Task is over budget by " + budget.over_by + " units.");

    const applied = GATES[event](task, { payload: c.payload, approvals: c.approvals, phase: phase, now: now }) || {};
    const to = resolveTarget(event, task, applied);

    const next = clone(task);
    Object.keys(applied).forEach((k) => { if (k !== "approval") next[k] = applied[k]; });
    next.state = to;
    next.spent_units = (task.spent_units || 0) + (Number(c.spend_units) || 0);
    if (event === "REWORK") next.rework_attempts = (task.rework_attempts || 0) + 1;
    if (event === "PLAN") next.rollback_plan = applied.rollback_plan;

    next.audit = audit.append(task.audit, {
      event: event,
      actor: actor,
      actor_type: actor_type,
      from_state: from,
      to_state: to,
      outcome: "applied",
      at: now,
      evidence_ref: applied.evidence_submission ? applied.evidence_submission.task_id : null,
      detail: {
        spend_units: Number(c.spend_units) || 0,
        verdict: applied.guardian ? applied.guardian.verdict : undefined,
        test_status: applied.test_result ? applied.test_result.status : undefined
      }
    });
    return { ok: true, task: next, error: null };
  } catch (e) {
    const code = e && e.code ? e.code : "gate_error";
    return refuse(code, e && e.message ? e.message : String(e));
  }
}

/* Same thing for callers that would rather have an exception. */
function mustTransition(task, event, ctx) {
  const r = transition(task, event, ctx);
  if (!r.ok) throw r.error;
  return r.task;
}

module.exports = {
  STATES,
  TERMINAL_STATES,
  HUMAN_ONLY_EVENTS,
  AUTONOMOUS_CEILING,
  MAX_REWORK_ATTEMPTS,
  DEFAULT_PHASE,
  TRANSITIONS,
  GateError,
  transition,
  mustTransition
};
