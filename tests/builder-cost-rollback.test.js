"use strict";
/*
 * Cost control that cannot buy savings with safety, and a rollback model that
 * refuses to call "no way back" a plan.
 */
const test = require("node:test");
const assert = require("node:assert");
const cost = require("../builder/src/cost.js");
const rollback = require("../builder/src/rollback.js");
const approval = require("../builder/src/approval.js");

function floorSteps() {
  return cost.QUALITY_FLOOR.map((id) => ({ id: id, estimated_units: 5 }));
}

test("a plan without every quality-floor item is not a plan", () => {
  cost.QUALITY_FLOOR.forEach((missing) => {
    const steps = floorSteps().filter((s) => s.id !== missing);
    assert.throws(() => cost.assertQualityFloor(steps), (e) => e.code === "quality_floor_missing");
    assert.deepStrictEqual(cost.missingFloorItems(steps), [missing]);
  });
});

test("cost optimization drops the most expensive optional work first, and stops once it fits", () => {
  const steps = floorSteps().concat([
    { id: "nice_to_have_docs", estimated_units: 40, required: false },
    { id: "extra_benchmark", estimated_units: 20, required: false }
  ]);
  /* Floor work is 7 x 5 = 35 units. A budget of 60 leaves room for one
     optional step, so the dearer one goes and the cheaper one survives. */
  const roomy = cost.applyCostOptimization(steps, 60);
  assert.deepStrictEqual(roomy.dropped, ["nice_to_have_docs"]);
  assert.strictEqual(roomy.estimated_units, 55);
  assert.strictEqual(roomy.within_budget, true);
  cost.assertQualityFloor(roomy.steps);

  /* A budget with no room for extras drops both, still in dearest-first order. */
  const tight = cost.applyCostOptimization(steps, 35);
  assert.deepStrictEqual(tight.dropped, ["nice_to_have_docs", "extra_benchmark"]);
  assert.strictEqual(tight.estimated_units, 35);
  assert.strictEqual(tight.within_budget, true);
  cost.assertQualityFloor(tight.steps);
});

test("cost optimization never drops a floor item, even to fit the budget", () => {
  const steps = floorSteps().concat([{ id: "optional", estimated_units: 1, required: false }]);
  const out = cost.applyCostOptimization(steps, 1);
  assert.strictEqual(out.within_budget, false, "an impossible budget must report over-budget");
  cost.assertQualityFloor(out.steps);
  assert.deepStrictEqual(out.dropped, ["optional"]);
});

test("marking a floor item optional does not make it droppable", () => {
  const steps = floorSteps().map((s) => Object.assign({}, s, { required: false }));
  const out = cost.applyCostOptimization(steps, 1);
  cost.assertQualityFloor(out.steps);
  assert.deepStrictEqual(out.dropped, []);
  assert.strictEqual(out.steps.every((s) => s.required === true), true);
});

test("a zero or negative budget is refused", () => {
  [0, -5, NaN, undefined, "cheap"].forEach((b) => {
    assert.throws(() => cost.applyCostOptimization(floorSteps(), b), (e) => e.code === "bad_budget");
  });
});

test("budget checks catch overspend", () => {
  assert.deepStrictEqual(cost.checkBudget(50, 100), { ok: true, over_by: 0 });
  assert.deepStrictEqual(cost.checkBudget(140, 100), { ok: false, over_by: 40 });
});

test("a paid service cannot be switched on without Luis", () => {
  const steps = floorSteps().concat([{ id: "enable_pinecone", estimated_units: 5, activates_paid_service: true }]);
  assert.deepStrictEqual(cost.paidActivations(steps), ["enable_pinecone"]);
  assert.throws(() => cost.assertNoUnapprovedPaidActivation(steps, []), (e) => e.code === "paid_activation_unapproved");

  const builderApproval = [{ stage: "paid_activation", scope: "enable_pinecone", actor_type: "automation", decision: "approved" }];
  assert.throws(() => cost.assertNoUnapprovedPaidActivation(steps, builderApproval), (e) => e.code === "paid_activation_unapproved");

  const ownerApproval = [{ stage: "paid_activation", scope: "enable_pinecone", actor_type: "human_owner", decision: "approved" }];
  assert.strictEqual(cost.assertNoUnapprovedPaidActivation(steps, ownerApproval), true);
});

/* ---- rollback ----------------------------------------------------------- */

const TASK = { id: "bt-1" };

test("a rollback plan with no targets is invalid -- silence is not safety", () => {
  const plan = rollback.buildRollbackPlan(TASK, []);
  assert.throws(() => rollback.validateRollbackPlan(plan), (e) => e.code === "invalid_rollback_plan");
  assert.throws(() => rollback.validateRollbackPlan(null), (e) => e.code === "invalid_rollback_plan");
});

test("each supported change kind produces an owner-executable rollback", () => {
  const plan = rollback.buildRollbackPlan(TASK, [
    { kind: "n8n_workflow", ref: "wf-1", previous_active_version_id: "v-1", verification: "re-run the regression harness" },
    { kind: "static_web_asset", ref: "index.html", previous_commit_sha: "abc1234", verification: "load the page and sign in" },
    { kind: "data_table_schema", ref: "panchita_memory", additive_only: true, verification: "confirm the old reads still work" },
    { kind: "configuration", ref: "FINAL_COALESCE_MS", previous_value: "900", verification: "confirm the previous value is live" }
  ]);
  assert.strictEqual(rollback.validateRollbackPlan(plan), true);
  plan.targets.forEach((t) => {
    assert.ok(t.manual_procedure, t.kind + " needs a procedure Luis can follow by hand");
    assert.strictEqual(rollback.STRATEGIES[t.kind].owner_executable, true);
  });
});

test("a target with nothing to restore to is refused", () => {
  const plan = rollback.buildRollbackPlan(TASK, [
    { kind: "n8n_workflow", ref: "wf-1", verification: "x" }
  ]);
  assert.throws(() => rollback.validateRollbackPlan(plan), /previous_active_version_id/);
});

test("a schema target that is not additive-only is refused", () => {
  const plan = rollback.buildRollbackPlan(TASK, [
    { kind: "data_table_schema", ref: "panchita_memory", additive_only: false, verification: "x" }
  ]);
  assert.throws(() => rollback.validateRollbackPlan(plan), /additive_only/);
});

test("a target with no verification step is refused", () => {
  const plan = rollback.buildRollbackPlan(TASK, [
    { kind: "configuration", ref: "k", previous_value: "1" }
  ]);
  assert.throws(() => rollback.validateRollbackPlan(plan), /verification/);
});

test("an unknown change kind is refused", () => {
  const plan = rollback.buildRollbackPlan(TASK, [{ kind: "delete_the_database", ref: "x", verification: "y" }]);
  assert.throws(() => rollback.validateRollbackPlan(plan), /unknown change kind/);
});

/* ---- approvals ---------------------------------------------------------- */

test("an approval issued by anything other than a human owner is not an approval", () => {
  const base = { task_id: "bt-1", stage: "deploy", decision: "approved" };
  approval.NON_HUMAN_ACTORS.forEach((actor) => {
    assert.strictEqual(approval.isHumanOwnerApproval(Object.assign({}, base, { actor: actor, actor_type: "human_owner" })), false, actor);
  });
  assert.strictEqual(approval.isHumanOwnerApproval(Object.assign({}, base, { actor: "luis", actor_type: "automation" })), false);
  assert.strictEqual(approval.isHumanOwnerApproval(Object.assign({}, base, { actor: "luis", actor_type: "human_owner", issued_by: "builder" })), false);
  assert.strictEqual(approval.isHumanOwnerApproval(Object.assign({}, base, { actor: "luis", actor_type: "human_owner", issued_by: "owner_channel" })), true);
});

test("expired, consumed, denied and mis-scoped approvals all fail closed", () => {
  const good = {
    task_id: "bt-1", stage: "deploy", decision: "approved",
    actor: "luis", actor_type: "human_owner", issued_by: "owner_channel"
  };
  const now = "2026-09-09T12:00:00.000Z";
  assert.ok(approval.verifyApproval([good], { task_id: "bt-1", stage: "deploy", now: now }));

  const cases = [
    [Object.assign({}, good, { expires_at: "2026-09-09T11:00:00.000Z" }), "approval_not_usable"],
    [Object.assign({}, good, { consumed: true }), "approval_not_usable"],
    [Object.assign({}, good, { decision: "denied" }), "approval_denied"],
    [Object.assign({}, good, { scope: "some_other_change" }), "approval_not_usable"]
  ];
  cases.forEach(([a, code]) => {
    assert.throws(
      () => approval.verifyApproval([a], { task_id: "bt-1", stage: "deploy", scope: "this_change", now: now }),
      (e) => e.code === code,
      JSON.stringify(a)
    );
  });
});

test("no approvals at all is a missing approval, not a pass", () => {
  assert.throws(() => approval.verifyApproval([], { task_id: "bt-1", stage: "deploy" }), (e) => e.code === "approval_missing");
  assert.throws(() => approval.verifyApproval(null, { task_id: "bt-1", stage: "plan" }), (e) => e.code === "approval_missing");
  assert.strictEqual(approval.hasApproval([], { task_id: "bt-1", stage: "deploy" }), false);
});

test("an unknown approval stage is refused", () => {
  assert.throws(() => approval.verifyApproval([], { task_id: "bt-1", stage: "whatever" }), (e) => e.code === "unknown_stage");
});
