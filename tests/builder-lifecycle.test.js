"use strict";
/*
 * The lifecycle and its gates.
 *
 * The heart of this suite: Builder can walk itself from a request all the way
 * to "ready for Luis", and cannot take a single step past it.
 */
const test = require("node:test");
const assert = require("node:assert");

const lifecycle = require("../builder/src/lifecycle.js");
const taskLib = require("../builder/src/task.js");
const rollbackLib = require("../builder/src/rollback.js");
const auditLib = require("../builder/src/audit.js");

/* ---- fixtures ----------------------------------------------------------- */

const SCOPE = { paths: ["builder/src/memory.js"], surfaces: [], target_environment: "isolated" };

function newTask(overrides) {
  return taskLib.createTaskDraft(Object.assign({
    request_text: "Panchita, improve your memory",
    scope: SCOPE,
    budget_units: 100,
    id_seed: "fixture",
    origin: { source: "panchita_personal", channel: "test", correlation_id: "corr-1", language: "en" },
    requested_by: { identity_reference: "identity-ref", tenant_reference: "tenant-ref" }
  }, overrides || {}));
}

function floorSteps(extra) {
  const steps = [
    { id: "automated_tests", estimated_units: 10 },
    { id: "test_execution_evidence", estimated_units: 5 },
    { id: "secret_scan", estimated_units: 1 },
    { id: "isolation_check", estimated_units: 1 },
    { id: "rollback_plan", estimated_units: 2 },
    { id: "audit_trail", estimated_units: 1 },
    { id: "guardian_review", estimated_units: 5 }
  ];
  return steps.concat(extra || []);
}

function rollbackPlan(task) {
  return rollbackLib.buildRollbackPlan(task, [{
    kind: "static_web_asset",
    ref: "builder/src/memory.js",
    previous_commit_sha: "0000000",
    verification: "re-run tests/builder-*.test.js against the restored commit"
  }]);
}

function ownerApproval(task, stage) {
  return {
    approval_id: "ap-" + stage,
    task_id: task.id,
    stage: stage,
    decision: "approved",
    actor: "luis",
    actor_type: "human_owner",
    issued_by: "owner_approval_channel",
    granted_at: "2026-09-09T00:00:00.000Z"
  };
}

const OWNER = { actor: "luis", actor_type: "human_owner" };
const BUILDER = { actor: "builder", actor_type: "automation" };

function step(task, event, ctx) {
  const r = lifecycle.transition(task, event, Object.assign({ actor: "builder", actor_type: "automation" }, ctx || {}));
  assert.ok(r.ok, event + " should have been allowed but was refused: " + (r.error && r.error.message));
  return r.task;
}

/* Walk a task to the given state using only legal moves. */
function advanceTo(target) {
  let t = newTask();
  t = step(t, "SPECIFY");
  if (target === "SPECIFIED") return t;

  t = step(t, "PLAN", { payload: { plan: { steps: floorSteps() }, rollback_plan: rollbackPlan(t) } });
  if (target === "PLANNED") return t;

  t.approvals = [ownerApproval(t, "plan")];
  t = step(t, "APPROVE_PLAN", OWNER);
  if (target === "APPROVED_TO_BUILD") return t;

  t = step(t, "PROVISION", {
    payload: {
      workspace: {
        branch: "builder/bt-fixture",
        environment: "isolated",
        can_publish: false,
        has_production_credentials: false,
        writable_paths: ["builder/src/memory.js"]
      }
    }
  });
  if (target === "WORKSPACE_READY") return t;

  t = step(t, "BUILD", { payload: { candidate: { changed_paths: ["builder/src/memory.js"], diff_ref: "cand-1" } } });
  if (target === "CANDIDATE_READY") return t;

  t = step(t, "TEST", { payload: { test_result: { executionId: "exec-1", status: "success", total: 42, failed: 0 } } });
  if (target === "TESTS_PASSED") return t;

  t = step(t, "SUBMIT_EVIDENCE", { payload: { evidence_submission: { task_id: t.id, requests_publish: false, evidence: {} } } });
  if (target === "EVIDENCE_SUBMITTED") return t;

  t = step(t, "RECORD_VERDICT", {
    payload: { guardian_response: { guardian_version: "v0.2", task_id: t.id, verdict: "VERIFIED_COMPLETE", can_publish: false } }
  });
  if (target === "GUARDIAN_CLEARED") return t;

  t = step(t, "REQUEST_OWNER_APPROVAL");
  return t;
}

/* ---- the happy path ----------------------------------------------------- */

test("Builder can drive a task from request to AWAITING_OWNER_APPROVAL on its own", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  assert.strictEqual(t.state, "AWAITING_OWNER_APPROVAL");
  assert.strictEqual(t.state, lifecycle.AUTONOMOUS_CEILING);
  assert.strictEqual(auditLib.verify(t.audit).valid, true);
});

test("every step of that path is in the audit chain, in order", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  const events = t.audit.entries.map((e) => e.event);
  assert.deepStrictEqual(events, [
    "TASK_CREATED", "SPECIFY", "PLAN", "APPROVE_PLAN", "PROVISION",
    "BUILD", "TEST", "SUBMIT_EVIDENCE", "RECORD_VERDICT", "REQUEST_OWNER_APPROVAL"
  ]);
  t.audit.entries.forEach((e) => assert.ok(e.outcome === "applied" || e.outcome === "recorded"));
});

/* ---- the ceiling -------------------------------------------------------- */

test("Builder cannot approve its own deployment", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  t.approvals = [ownerApproval(t, "deploy")];
  const r = lifecycle.transition(t, "APPROVE_DEPLOY", Object.assign({}, BUILDER, { approvals: t.approvals }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "human_only_event");
  assert.strictEqual(r.task.state, "AWAITING_OWNER_APPROVAL");
});

test("Builder impersonating the owner is refused: the actor_type is checked, not claimed identity", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  const r = lifecycle.transition(t, "APPROVE_DEPLOY", { actor: "luis", actor_type: "automation", approvals: [ownerApproval(t, "deploy")] });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "human_only_event");
});

test("even Luis cannot deploy while the phase has deployment switched off", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  t.approvals = [ownerApproval(t, "deploy")];
  const r = lifecycle.transition(t, "APPROVE_DEPLOY", Object.assign({}, OWNER, { approvals: t.approvals }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "deployment_disabled");
});

test("with deployment enabled, the owner -- and only the owner -- can approve", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  t.approvals = [ownerApproval(t, "deploy")];
  const phase = { deployment_enabled: true };
  const denied = lifecycle.transition(t, "APPROVE_DEPLOY", Object.assign({}, BUILDER, { phase: phase, approvals: t.approvals }));
  assert.strictEqual(denied.ok, false);
  const allowed = lifecycle.transition(t, "APPROVE_DEPLOY", Object.assign({}, OWNER, { phase: phase, approvals: t.approvals }));
  assert.strictEqual(allowed.ok, true);
  assert.strictEqual(allowed.task.state, "APPROVED_FOR_DEPLOY");
});

test("an approval for a different task does not unlock this one", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  const foreign = ownerApproval(t, "deploy");
  foreign.task_id = "bt-someone-else";
  const r = lifecycle.transition(t, "APPROVE_DEPLOY", Object.assign({}, OWNER, { phase: { deployment_enabled: true }, approvals: [foreign] }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "approval_missing");
});

test("Builder cannot skip states to reach deployment", () => {
  const t = advanceTo("PLANNED");
  ["DEPLOY", "APPROVE_DEPLOY", "SUBMIT_EVIDENCE", "BUILD"].forEach((event) => {
    const r = lifecycle.transition(t, event, OWNER);
    assert.strictEqual(r.ok, false, event + " should be illegal from PLANNED");
    assert.strictEqual(r.error.code, "illegal_transition");
  });
});

/* ---- gates -------------------------------------------------------------- */

test("a plan missing quality-floor steps is refused", () => {
  const t = advanceTo("SPECIFIED");
  const thin = floorSteps().filter((s) => s.id !== "automated_tests");
  const r = lifecycle.transition(t, "PLAN", Object.assign({}, BUILDER, {
    payload: { plan: { steps: thin }, rollback_plan: rollbackPlan(t) }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "quality_floor_missing");
  assert.match(r.error.message, /automated_tests/);
});

test("a plan with no rollback plan is refused", () => {
  const t = advanceTo("SPECIFIED");
  const r = lifecycle.transition(t, "PLAN", Object.assign({}, BUILDER, { payload: { plan: { steps: floorSteps() } } }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "invalid_rollback_plan");
});

test("a plan over budget is refused rather than trimmed below the floor", () => {
  const t = newTask({ budget_units: 5 });
  const specified = step(t, "SPECIFY");
  const r = lifecycle.transition(specified, "PLAN", Object.assign({}, BUILDER, {
    payload: { plan: { steps: floorSteps() }, rollback_plan: rollbackPlan(specified) }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "over_budget");
});

test("a plan that would activate a paid service without approval is refused", () => {
  const t = advanceTo("SPECIFIED");
  const steps = floorSteps([{ id: "enable_vector_db", estimated_units: 5, activates_paid_service: true }]);
  const r = lifecycle.transition(t, "PLAN", Object.assign({}, BUILDER, {
    payload: { plan: { steps: steps }, rollback_plan: rollbackPlan(t) }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "paid_activation_unapproved");
});

test("a non-isolated workspace is refused at PROVISION", () => {
  const t = advanceTo("APPROVED_TO_BUILD");
  const r = lifecycle.transition(t, "PROVISION", Object.assign({}, BUILDER, {
    payload: { workspace: { branch: "main", environment: "production", can_publish: true, has_production_credentials: true, writable_paths: ["index.html"] } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "workspace_not_isolated");
});

test("a workspace that can write outside the approved scope is refused", () => {
  const t = advanceTo("APPROVED_TO_BUILD");
  const r = lifecycle.transition(t, "PROVISION", Object.assign({}, BUILDER, {
    payload: { workspace: { branch: "builder/x", environment: "isolated", can_publish: false, has_production_credentials: false, writable_paths: ["builder/src/memory.js", "builder/src/policy.js"] } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "workspace_scope_drift");
});

test("a candidate touching an undeclared path is refused", () => {
  const t = advanceTo("WORKSPACE_READY");
  const r = lifecycle.transition(t, "BUILD", Object.assign({}, BUILDER, {
    payload: { candidate: { changed_paths: ["builder/src/memory.js", "builder/src/policy.js"] } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "out_of_scope_change");
});

test("a candidate carrying a credential is refused", () => {
  const t = advanceTo("WORKSPACE_READY");
  const r = lifecycle.transition(t, "BUILD", Object.assign({}, BUILDER, {
    payload: { candidate: { changed_paths: ["builder/src/memory.js"], snippet: "const key = 'sk-ant-" + "Z".repeat(24) + "';" } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "secret_detected");
});

/* ---- a failed test blocks deployment ------------------------------------ */

test("a failing test run lands in TESTS_FAILED, not TESTS_PASSED", () => {
  const t = advanceTo("CANDIDATE_READY");
  const failed = step(t, "TEST", { payload: { test_result: { executionId: "exec-2", status: "error", total: 42, failed: 3 } } });
  assert.strictEqual(failed.state, "TESTS_FAILED");
});

test("a failed test run cannot be submitted as evidence", () => {
  const t = advanceTo("CANDIDATE_READY");
  const failed = step(t, "TEST", { payload: { test_result: { executionId: "exec-2", status: "error", total: 42, failed: 3 } } });
  const r = lifecycle.transition(failed, "SUBMIT_EVIDENCE", Object.assign({}, BUILDER, {
    payload: { evidence_submission: { task_id: failed.id, requests_publish: false, evidence: {} } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "illegal_transition");
});

test("a narrated test result is not a test result", () => {
  const t = advanceTo("CANDIDATE_READY");
  [
    [{ status: "success", total: 10 }, "not_a_real_execution"],
    [{ executionId: "exec-3", total: 10 }, "no_test_status"],
    [{ executionId: "exec-3", status: "success", total: 0 }, "no_tests_ran"],
    [{ executionId: "exec-3", status: "success" }, "no_tests_ran"]
  ].forEach(([result, code]) => {
    const r = lifecycle.transition(t, "TEST", Object.assign({}, BUILDER, { payload: { test_result: result } }));
    assert.strictEqual(r.ok, false, JSON.stringify(result) + " should be refused");
    assert.strictEqual(r.error.code, code);
  });
});

test("rework is bounded -- three failures and it goes to Luis, not round four", () => {
  let t = advanceTo("CANDIDATE_READY");
  for (let i = 0; i < lifecycle.MAX_REWORK_ATTEMPTS; i++) {
    t = step(t, "TEST", { payload: { test_result: { executionId: "exec-r" + i, status: "error", total: 5, failed: 1 } } });
    t = step(t, "REWORK");
    t = step(t, "BUILD", { payload: { candidate: { changed_paths: ["builder/src/memory.js"] } } });
  }
  t = step(t, "TEST", { payload: { test_result: { executionId: "exec-last", status: "error", total: 5, failed: 1 } } });
  const r = lifecycle.transition(t, "REWORK", BUILDER);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "rework_limit");
});

/* ---- Guardian ----------------------------------------------------------- */

test("a blocking Guardian verdict stops the task at GUARDIAN_BLOCKED", () => {
  const t = advanceTo("EVIDENCE_SUBMITTED");
  ["UNKNOWN_FAILS_CLOSED", "FAIL", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "PASS_WITH_APPROVAL_REQUIRED"].forEach((verdict) => {
    const blocked = step(t, "RECORD_VERDICT", {
      payload: { guardian_response: { guardian_version: "v0.2", task_id: t.id, verdict: verdict, can_publish: false } }
    });
    assert.strictEqual(blocked.state, "GUARDIAN_BLOCKED", verdict + " must block");
    const r = lifecycle.transition(blocked, "REQUEST_OWNER_APPROVAL", BUILDER);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "illegal_transition");
  });
});

test("no Guardian response at all fails closed", () => {
  const t = advanceTo("EVIDENCE_SUBMITTED");
  const blocked = step(t, "RECORD_VERDICT", { payload: {} });
  assert.strictEqual(blocked.state, "GUARDIAN_BLOCKED");
  assert.strictEqual(blocked.guardian.reason, "no_guardian_response");
});

test("a Guardian response claiming can_publish is treated as tampered and refused", () => {
  const t = advanceTo("EVIDENCE_SUBMITTED");
  const r = lifecycle.transition(t, "RECORD_VERDICT", Object.assign({}, BUILDER, {
    payload: { guardian_response: { guardian_version: "v0.2", task_id: t.id, verdict: "VERIFIED_COMPLETE", can_publish: true } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "guardian_response_untrusted");
});

test("a verdict for another task is refused", () => {
  const t = advanceTo("EVIDENCE_SUBMITTED");
  const r = lifecycle.transition(t, "RECORD_VERDICT", Object.assign({}, BUILDER, {
    payload: { guardian_response: { guardian_version: "v0.2", task_id: "bt-other", verdict: "VERIFIED_COMPLETE", can_publish: false } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "guardian_response_untrusted");
});

test("Builder cannot request owner approval without a Guardian clearance", () => {
  const t = advanceTo("TESTS_PASSED");
  const r = lifecycle.transition(t, "REQUEST_OWNER_APPROVAL", BUILDER);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "illegal_transition");
});

test("Builder never asks Guardian for permission to publish", () => {
  const t = advanceTo("TESTS_PASSED");
  const r = lifecycle.transition(t, "SUBMIT_EVIDENCE", Object.assign({}, BUILDER, {
    payload: { evidence_submission: { task_id: t.id, requests_publish: true, evidence: {} } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "evidence_requests_publish");
});

/* ---- refusals are recorded --------------------------------------------- */

test("a refused transition is written to the audit chain and leaves the state alone", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  const before = t.audit.entries.length;
  const r = lifecycle.transition(t, "APPROVE_DEPLOY", Object.assign({}, BUILDER, { approvals: [ownerApproval(t, "deploy")] }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.task.state, "AWAITING_OWNER_APPROVAL");
  assert.strictEqual(r.task.audit.entries.length, before + 1);
  const last = r.task.audit.entries[before];
  assert.strictEqual(last.outcome, "refused");
  assert.strictEqual(last.event, "APPROVE_DEPLOY");
  assert.strictEqual(last.from_state, last.to_state);
  assert.strictEqual(auditLib.verify(r.task.audit).valid, true);
});

test("an unknown event is refused and recorded", () => {
  const t = advanceTo("SPECIFIED");
  const r = lifecycle.transition(t, "SELF_GRANT_PERMISSION", BUILDER);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "unknown_event");
  assert.strictEqual(r.task.audit.entries.slice(-1)[0].outcome, "refused");
});

test("going over budget mid-task stops it", () => {
  const t = advanceTo("WORKSPACE_READY");
  const r = lifecycle.transition(t, "BUILD", Object.assign({}, BUILDER, {
    spend_units: 10000,
    payload: { candidate: { changed_paths: ["builder/src/memory.js"] } }
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "budget_exceeded");
});

test("transitions do not mutate the task they were given", () => {
  const t = advanceTo("SPECIFIED");
  const snapshot = JSON.stringify({ state: t.state, entries: t.audit.entries.length });
  lifecycle.transition(t, "PLAN", Object.assign({}, BUILDER, { payload: { plan: { steps: [] } } }));
  step(t, "PLAN", { payload: { plan: { steps: floorSteps() }, rollback_plan: rollbackPlan(t) } });
  assert.strictEqual(JSON.stringify({ state: t.state, entries: t.audit.entries.length }), snapshot);
});

test("terminal states accept nothing further", () => {
  const t = advanceTo("PLANNED");
  const rejected = step(t, "REJECT", Object.assign({}, OWNER, { payload: { reason: "not now" } }));
  assert.strictEqual(rejected.state, "REJECTED");
  const r = lifecycle.transition(rejected, "APPROVE_PLAN", OWNER);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "illegal_transition");
});

test("Builder cannot reject or complete on Luis's behalf", () => {
  const t = advanceTo("PLANNED");
  const r = lifecycle.transition(t, "REJECT", BUILDER);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "human_only_event");
});

test("the public view exposes state and audit health without internals", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  const view = taskLib.publicView(t);
  assert.strictEqual(view.state, "AWAITING_OWNER_APPROVAL");
  assert.strictEqual(view.awaiting, "owner_approval");
  assert.strictEqual(view.guardian_verdict, "VERIFIED_COMPLETE");
  assert.strictEqual(view.audit.chain_valid, true);
  assert.ok(!("workspace" in view) && !("candidate" in view));
});

/* ---- exhaustive search -------------------------------------------------- */

test("no sequence of Builder-only moves reaches a deployment state, even with every gate handed to it", () => {
  /* The most hostile setup available to Builder: valid owner approvals on
     record for every stage, deployment switched ON, and a payload bundle that
     satisfies every gate. The only thing Builder does not have is a human
     actor. That alone must be enough. */
  const seed = newTask();
  const payload = {
    plan: { steps: floorSteps() },
    rollback_plan: rollbackPlan(seed),
    workspace: {
      branch: "builder/bt-fixture",
      environment: "isolated",
      can_publish: false,
      has_production_credentials: false,
      writable_paths: ["builder/src/memory.js"]
    },
    candidate: { changed_paths: ["builder/src/memory.js"] },
    test_result: { executionId: "exec-x", status: "success", total: 7, failed: 0 },
    evidence_submission: { task_id: seed.id, requests_publish: false, evidence: {} },
    guardian_response: { guardian_version: "v0.2", task_id: seed.id, verdict: "VERIFIED_COMPLETE", can_publish: false }
  };
  const ctx = {
    actor: "builder",
    actor_type: "automation",
    payload: payload,
    phase: { deployment_enabled: true },
    approvals: ["plan", "deploy", "paid_activation", "production_path"].map((s) => ownerApproval(seed, s))
  };

  const events = Object.keys(lifecycle.TRANSITIONS);
  const reached = new Set([seed.state]);
  const queue = [seed];
  let guard = 0;

  while (queue.length > 0) {
    if (++guard > 5000) throw new Error("search did not terminate");
    const current = queue.shift();
    events.forEach((event) => {
      const r = lifecycle.transition(current, event, ctx);
      if (!r.ok || reached.has(r.task.state)) return;
      reached.add(r.task.state);
      queue.push(r.task);
    });
  }

  ["APPROVED_FOR_DEPLOY", "DEPLOYED", "MONITORING", "COMPLETED", "ROLLED_BACK"].forEach((state) => {
    assert.ok(!reached.has(state), "Builder alone reached " + state);
  });
  /* Builder alone does not even get to build: Gate A stops it at PLANNED,
     because approving a plan is Luis's decision. The only other states it can
     put itself into are the ways of giving up. */
  assert.deepStrictEqual(
    Array.from(reached).sort(),
    ["ABANDONED", "BLOCKED", "DRAFT", "PLANNED", "SPECIFIED"]
  );
});

test("after Luis's one approval, Builder runs to AWAITING_OWNER_APPROVAL and stops dead", () => {
  /* Same exhaustive search, seeded past Gate A. Deployment is switched on and
     a valid deploy approval is on record; the actor is still automation. */
  const seed = advanceTo("APPROVED_TO_BUILD");
  const payload = {
    plan: { steps: floorSteps() },
    rollback_plan: rollbackPlan(seed),
    workspace: {
      branch: "builder/bt-fixture",
      environment: "isolated",
      can_publish: false,
      has_production_credentials: false,
      writable_paths: ["builder/src/memory.js"]
    },
    candidate: { changed_paths: ["builder/src/memory.js"] },
    test_result: { executionId: "exec-x", status: "success", total: 7, failed: 0 },
    evidence_submission: { task_id: seed.id, requests_publish: false, evidence: {} },
    guardian_response: { guardian_version: "v0.2", task_id: seed.id, verdict: "VERIFIED_COMPLETE", can_publish: false }
  };
  const ctx = {
    actor: "builder",
    actor_type: "automation",
    payload: payload,
    phase: { deployment_enabled: true },
    approvals: ["plan", "deploy", "paid_activation", "production_path"].map((s) => ownerApproval(seed, s))
  };

  const events = Object.keys(lifecycle.TRANSITIONS);
  const reached = new Set([seed.state]);
  const queue = [seed];
  let guard = 0;

  while (queue.length > 0) {
    if (++guard > 5000) throw new Error("search did not terminate");
    const current = queue.shift();
    events.forEach((event) => {
      const r = lifecycle.transition(current, event, ctx);
      if (!r.ok || reached.has(r.task.state)) return;
      reached.add(r.task.state);
      queue.push(r.task);
    });
  }

  /* It does the whole job... */
  ["WORKSPACE_READY", "CANDIDATE_READY", "TESTS_PASSED", "EVIDENCE_SUBMITTED", "GUARDIAN_CLEARED", "AWAITING_OWNER_APPROVAL"]
    .forEach((state) => assert.ok(reached.has(state), "Builder should reach " + state));
  /* ...and not one step of the deployment. */
  ["APPROVED_FOR_DEPLOY", "DEPLOYED", "MONITORING", "COMPLETED", "ROLLED_BACK"]
    .forEach((state) => assert.ok(!reached.has(state), "Builder alone reached " + state));
});

test("the search above is meaningful: with a human actor those states are reachable", () => {
  const t = advanceTo("AWAITING_OWNER_APPROVAL");
  t.approvals = [ownerApproval(t, "deploy")];
  const phase = { deployment_enabled: true };
  const approved = step(t, "APPROVE_DEPLOY", Object.assign({}, OWNER, { phase: phase, approvals: t.approvals }));
  assert.strictEqual(approved.state, "APPROVED_FOR_DEPLOY");
  const deployed = step(approved, "DEPLOY", Object.assign({}, OWNER, { phase: phase }));
  assert.strictEqual(deployed.state, "DEPLOYED");
});
