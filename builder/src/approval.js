"use strict";
/*
 * Approvals.
 *
 * An approval is a statement by Luis, captured outside Builder. This module
 * only *verifies* one; it deliberately has no mint/issue function, because an
 * approval Builder can construct is not an approval.
 *
 * Authentication and authorization live in the Gateway. Nothing here decides
 * who Luis is -- it checks that a record produced by that chain matches this
 * task and this stage.
 */

const STAGES = ["plan", "paid_activation", "production_path", "deploy"];

/* Actors that can never be the source of an approval, whatever a record says. */
const NON_HUMAN_ACTORS = ["builder", "central", "guardian", "panchita", "system", "automation", "mission_control"];

class ApprovalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

function isHumanOwnerApproval(approval) {
  const a = approval && typeof approval === "object" ? approval : {};
  if (a.actor_type !== "human_owner") return false;
  if (NON_HUMAN_ACTORS.indexOf(String(a.actor || "").toLowerCase()) >= 0) return false;
  if (String(a.issued_by || "").toLowerCase() === "builder") return false;
  return true;
}

/*
 * verifyApproval(approvals, { task_id, stage, scope, now }) -> approval
 *
 * Fails closed on: no record, wrong task, wrong stage, non-human actor,
 * expired, already consumed, or a decision that is not "approved".
 */
function verifyApproval(approvals, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const stage = String(o.stage || "");
  if (STAGES.indexOf(stage) < 0) throw new ApprovalError("unknown_stage", "Unknown approval stage '" + stage + "'.");

  const now = o.now ? new Date(o.now).getTime() : Date.now();
  const list = Array.isArray(approvals) ? approvals : [];

  const match = list.filter((a) => a && a.stage === stage && a.task_id === o.task_id);
  if (match.length === 0) {
    throw new ApprovalError("approval_missing", "No owner approval on record for stage '" + stage + "'.");
  }

  const usable = match.filter((a) => {
    if (!isHumanOwnerApproval(a)) return false;
    if (a.decision !== "approved") return false;
    if (a.consumed === true) return false;
    if (a.expires_at && new Date(a.expires_at).getTime() <= now) return false;
    if (o.scope && a.scope && a.scope !== o.scope) return false;
    return true;
  });

  if (usable.length === 0) {
    const denied = match.some((a) => a.decision === "denied");
    throw new ApprovalError(
      denied ? "approval_denied" : "approval_not_usable",
      denied
        ? "Luis denied stage '" + stage + "'."
        : "An approval record exists for stage '" + stage + "' but is expired, consumed, scoped elsewhere, or not owner-issued."
    );
  }
  return usable[0];
}

function hasApproval(approvals, opts) {
  try {
    verifyApproval(approvals, opts);
    return true;
  } catch (e) {
    if (e instanceof ApprovalError) return false;
    throw e;
  }
}

module.exports = { STAGES, NON_HUMAN_ACTORS, ApprovalError, isHumanOwnerApproval, verifyApproval, hasApproval };
