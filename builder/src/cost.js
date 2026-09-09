"use strict";
/*
 * Cost and quality controls.
 *
 * The rule that matters: cost optimization may drop optional work, never a
 * quality-floor item. applyCostOptimization() enforces that in code, so
 * "cheaper" can never quietly mean "less safe".
 */

/* Non-negotiable. A plan missing any of these is not a cheaper plan; it is an
   invalid one. */
const QUALITY_FLOOR = [
  "automated_tests",          // every change ships with tests
  "test_execution_evidence",  // and a real run of them
  "secret_scan",              // nothing credential-shaped in the change
  "isolation_check",          // workspace proven non-production
  "rollback_plan",            // a way back, pre-computed
  "audit_trail",              // hash-chained record of the whole task
  "guardian_review"           // independent verification
];

class CostError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CostError";
    this.code = code;
  }
}

function isFloorItem(id) {
  return QUALITY_FLOOR.indexOf(String(id)) >= 0;
}

/*
 * A plan step is { id, required (bool), estimated_units (number) }.
 * Floor items are treated as required regardless of what the step claims.
 */
function normalizeSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((s) => ({
    id: String((s && s.id) || ""),
    required: isFloorItem(s && s.id) ? true : !!(s && s.required),
    estimated_units: Number((s && s.estimated_units) || 0)
  }));
}

function estimateCost(steps) {
  return normalizeSteps(steps).reduce((sum, s) => sum + (isFinite(s.estimated_units) ? s.estimated_units : 0), 0);
}

function missingFloorItems(steps) {
  const ids = normalizeSteps(steps).map((s) => s.id);
  return QUALITY_FLOOR.filter((f) => ids.indexOf(f) < 0);
}

/* A plan is only a plan once every floor item is in it. */
function assertQualityFloor(steps) {
  const missing = missingFloorItems(steps);
  if (missing.length > 0) {
    throw new CostError("quality_floor_missing", "Plan omits required quality steps: " + missing.join(", ") + ".");
  }
  return true;
}

/*
 * applyCostOptimization(steps, budgetUnits) -> { steps, dropped, estimated_units, within_budget }
 *
 * Drops optional steps, most expensive first, until the estimate fits. If it
 * still does not fit once only floor work remains, the answer is "over
 * budget" -- never a trimmed floor.
 */
function applyCostOptimization(steps, budgetUnits) {
  const budget = Number(budgetUnits);
  if (!isFinite(budget) || budget <= 0) throw new CostError("bad_budget", "A positive budget is required.");
  assertQualityFloor(steps);

  const kept = normalizeSteps(steps);
  const dropped = [];

  for (;;) {
    const total = estimateCost(kept);
    if (total <= budget) break;
    const candidates = kept
      .map((s, i) => ({ s, i }))
      .filter((x) => !x.s.required && !isFloorItem(x.s.id))
      .sort((a, b) => b.s.estimated_units - a.s.estimated_units);
    if (candidates.length === 0) break;
    dropped.push(kept.splice(candidates[0].i, 1)[0]);
  }

  const estimated = estimateCost(kept);
  /* Belt and braces: whatever the loop did, the floor is still intact. */
  assertQualityFloor(kept);

  return {
    steps: kept,
    dropped: dropped.map((d) => d.id),
    estimated_units: estimated,
    within_budget: estimated <= budget
  };
}

/*
 * checkBudget(spent, budget) -> { ok, over_by }
 * Called at every lifecycle step; going over stops the task rather than
 * degrading it.
 */
function checkBudget(spentUnits, budgetUnits) {
  const spent = Number(spentUnits) || 0;
  const budget = Number(budgetUnits);
  if (!isFinite(budget) || budget <= 0) throw new CostError("bad_budget", "A positive budget is required.");
  return { ok: spent <= budget, over_by: Math.max(0, spent - budget) };
}

/*
 * Any step that would turn on a paid service is a gate, not a cost line.
 * Returns the steps needing Luis's explicit approval.
 */
function paidActivations(steps) {
  return (Array.isArray(steps) ? steps : [])
    .filter((s) => s && s.activates_paid_service === true)
    .map((s) => String(s.id || "unnamed_step"));
}

function assertNoUnapprovedPaidActivation(steps, approvals) {
  const needed = paidActivations(steps);
  const approved = (Array.isArray(approvals) ? approvals : [])
    .filter((a) => a && a.stage === "paid_activation" && a.actor_type === "human_owner")
    .map((a) => String(a.scope));
  const missing = needed.filter((n) => approved.indexOf(n) < 0);
  if (missing.length > 0) {
    throw new CostError(
      "paid_activation_unapproved",
      "These steps would activate a paid service without Luis's approval: " + missing.join(", ") + "."
    );
  }
  return true;
}

module.exports = {
  QUALITY_FLOOR,
  CostError,
  isFloorItem,
  estimateCost,
  missingFloorItems,
  assertQualityFloor,
  applyCostOptimization,
  checkBudget,
  paidActivations,
  assertNoUnapprovedPaidActivation
};
