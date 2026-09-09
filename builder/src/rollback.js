"use strict";
/*
 * Rollback model.
 *
 * A change without a way back is not deployable. The plan is computed and
 * validated *before* anything is built, from the state that exists now, so
 * the way back does not depend on Builder still working -- Luis can execute
 * every strategy below by hand.
 */

const STRATEGIES = {
  /* n8n keeps version history; restoring the previously active version is a
     single owner action in the n8n UI. */
  n8n_workflow: {
    id: "n8n_workflow",
    restore_field: "previous_active_version_id",
    manual_procedure: "n8n > workflow > Versions > restore the recorded version, then publish.",
    owner_executable: true
  },
  /* Static client assets are git objects: the previous commit is the rollback. */
  static_web_asset: {
    id: "static_web_asset",
    restore_field: "previous_commit_sha",
    manual_procedure: "git revert the deploy commit, or redeploy the recorded commit sha.",
    owner_executable: true
  },
  /* Schema changes are additive-only, so rollback is to stop reading the new
     column. No destructive migration is ever part of a Builder task. */
  data_table_schema: {
    id: "data_table_schema",
    restore_field: "additive_only",
    manual_procedure: "Stop reading the added column; no data is destroyed because only additive changes are permitted.",
    owner_executable: true
  },
  /* Config values: restore the recorded prior value. */
  configuration: {
    id: "configuration",
    restore_field: "previous_value",
    manual_procedure: "Set the key back to the recorded previous value.",
    owner_executable: true
  }
};

class RollbackError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RollbackError";
    this.code = code;
  }
}

/*
 * buildRollbackPlan(task, targets) -> plan
 * targets: [{ kind, ref, previous_active_version_id | previous_commit_sha | previous_value | additive_only }]
 */
function buildRollbackPlan(task, targets) {
  if (!task || !task.id) throw new RollbackError("no_task", "A rollback plan belongs to a task.");
  const list = Array.isArray(targets) ? targets : [];
  return {
    task_id: task.id,
    created_at: new Date().toISOString(),
    targets: list.map((t) => {
      const kind = String((t && t.kind) || "");
      const strategy = STRATEGIES[kind] || null;
      return {
        kind: kind,
        ref: (t && t.ref) || null,
        strategy: strategy ? strategy.id : null,
        restore_value: strategy ? (t ? t[strategy.restore_field] : undefined) : undefined,
        manual_procedure: strategy ? strategy.manual_procedure : null,
        verification: (t && t.verification) || null
      };
    })
  };
}

/*
 * validateRollbackPlan(plan) -> true, or throws.
 *
 * A plan with no targets is invalid: "nothing to roll back" must be stated as
 * an explicit no_change target, so silence is never mistaken for safety.
 */
function validateRollbackPlan(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const targets = Array.isArray(p.targets) ? p.targets : [];
  const problems = [];

  if (targets.length === 0) problems.push("plan has no targets");

  targets.forEach((t, i) => {
    const where = "target[" + i + "]";
    if (!t.kind || !STRATEGIES[t.kind]) {
      problems.push(where + ": unknown change kind '" + (t.kind || "") + "'");
      return;
    }
    if (!t.ref) problems.push(where + ": no ref recorded");
    const needed = STRATEGIES[t.kind].restore_field;
    if (needed === "additive_only") {
      if (t.restore_value !== true) problems.push(where + ": schema change is not marked additive_only");
    } else if (t.restore_value === undefined || t.restore_value === null || t.restore_value === "") {
      problems.push(where + ": no " + needed + " recorded, so there is nothing to restore to");
    }
    if (!t.verification) problems.push(where + ": no verification step for the rollback");
  });

  if (problems.length > 0) {
    throw new RollbackError("invalid_rollback_plan", "Rollback plan is not usable: " + problems.join("; ") + ".");
  }
  return true;
}

module.exports = { STRATEGIES, RollbackError, buildRollbackPlan, validateRollbackPlan };
