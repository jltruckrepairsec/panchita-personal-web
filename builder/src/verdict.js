"use strict";
/*
 * Reading Guardian's verdict.
 *
 * Guardian's judgment is not reimplemented here, on purpose. If Builder could
 * compute the verdict it would not be an independent check. This module only
 * interprets a response object, and treats anything it does not recognise as
 * blocking.
 *
 * Guardian v0.2's verdict vocabulary, from the workflow itself:
 *   VERIFIED_COMPLETE                -- every check verified, no production impact
 *   PASS_WITH_APPROVAL_REQUIRED      -- checks pass, impact declared, needs Luis
 *   UNKNOWN_FAILS_CLOSED             -- evidence missing or uninterpretable
 *   FAIL                             -- a check verifiably failed
 *   BLOCKED_REQUIRES_HUMAN_APPROVAL  -- publish was requested
 */

const CLEARING_VERDICTS = ["VERIFIED_COMPLETE"];
const APPROVAL_VERDICTS = ["PASS_WITH_APPROVAL_REQUIRED"];
const BLOCKING_VERDICTS = ["UNKNOWN_FAILS_CLOSED", "FAIL", "BLOCKED_REQUIRES_HUMAN_APPROVAL"];

function interpretVerdict(raw, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const r = raw && typeof raw === "object" ? raw : null;

  if (!r) {
    return { cleared: false, requires_owner_approval: true, verdict: null, tampered: false, reason: "no_guardian_response" };
  }
  /* Guardian hardcodes can_publish=false. Anything else means the response is
     not Guardian's, or was altered in transit. */
  if (r.can_publish !== false) {
    return { cleared: false, requires_owner_approval: true, verdict: r.verdict || null, tampered: true, reason: "can_publish_not_false" };
  }
  if (o.task_id && r.task_id && r.task_id !== o.task_id) {
    return { cleared: false, requires_owner_approval: true, verdict: r.verdict || null, tampered: true, reason: "task_id_mismatch" };
  }
  if (!r.guardian_version) {
    return { cleared: false, requires_owner_approval: true, verdict: r.verdict || null, tampered: true, reason: "unsigned_verdict" };
  }

  const v = String(r.verdict || "");
  if (CLEARING_VERDICTS.indexOf(v) >= 0) {
    return { cleared: true, requires_owner_approval: true, verdict: v, tampered: false, reason: null };
  }
  if (APPROVAL_VERDICTS.indexOf(v) >= 0) {
    return { cleared: false, requires_owner_approval: true, verdict: v, tampered: false, reason: "guardian_requires_owner_approval" };
  }
  if (BLOCKING_VERDICTS.indexOf(v) >= 0) {
    return { cleared: false, requires_owner_approval: true, verdict: v, tampered: false, reason: "guardian_blocked" };
  }
  return { cleared: false, requires_owner_approval: true, verdict: v || null, tampered: false, reason: "unrecognized_verdict" };
}

/* The checks Guardian reports, flattened for Luis's review screen. */
function failedChecks(raw) {
  const checks = (raw && Array.isArray(raw.independent_checks)) ? raw.independent_checks : [];
  return checks.filter((c) => c && c.status !== "VERIFIED_PASS").map((c) => ({ item: c.item, status: c.status, detail: c.detail }));
}

module.exports = { CLEARING_VERDICTS, APPROVAL_VERDICTS, BLOCKING_VERDICTS, interpretVerdict, failedChecks };
