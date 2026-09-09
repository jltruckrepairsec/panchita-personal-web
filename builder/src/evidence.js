"use strict";
/*
 * Evidence envelope for Guardian.
 *
 * Guardian v0.2 (n8n workflow K1ykR9HKinC1UP4k, currently inactive) reads
 * exactly four raw evidence keys and ignores everything else. This module
 * builds that envelope and refuses to put a Builder claim in it: no
 * "tests passed", no summaries, no notes. Raw artifacts or nothing.
 *
 * Guardian's contract, verified against the workflow's own code:
 *   evidence.workflow_version_state    { workflowId, versionId, activeVersionId, baselineActiveVersionId }
 *   evidence.data_source_before_after  { before, after }
 *   evidence.test_execution_result     { executionId, status }
 *   evidence.registry_before_after     { before, after }
 * Missing evidence -> UNKNOWN -> fails closed. That is the desired default.
 */
const secrets = require("./secrets.js");

const EVIDENCE_KEYS = [
  "workflow_version_state",
  "data_source_before_after",
  "test_execution_result",
  "registry_before_after"
];

/* Keys that carry Builder's opinion rather than an artifact. Dropped, and
   reported, so the drop is visible instead of silent. */
const NARRATIVE_KEYS = [
  "claim",
  "claims",
  "summary",
  "note",
  "notes",
  "assertion",
  "assertions",
  "builder_says",
  "explanation",
  "rationale",
  "confidence",
  "self_assessment",
  "tests_passed",
  "production_untouched",
  "description"
];

class EvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
  }
}

function stripNarrative(value, dropped, path, depth) {
  depth = depth || 0;
  path = path || "$";
  if (depth > 10) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v, i) => stripNarrative(v, dropped, path + "[" + i + "]", depth + 1));
  const out = {};
  Object.keys(value).forEach((k) => {
    if (NARRATIVE_KEYS.indexOf(String(k).toLowerCase()) >= 0) {
      dropped.push(path + "." + k);
      return;
    }
    out[k] = stripNarrative(value[k], dropped, path + "." + k, depth + 1);
  });
  return out;
}

/* Shape checks only. Whether the evidence *passes* is Guardian's call, never
   Builder's -- this just refuses to send something Guardian cannot read. */
const SHAPE = {
  workflow_version_state: (e) => (e && e.workflowId && e.versionId && e.activeVersionId ? null : "needs workflowId, versionId, activeVersionId"),
  data_source_before_after: (e) => (e && "before" in e && "after" in e ? null : "needs before and after"),
  test_execution_result: (e) => (e && e.executionId && e.status ? null : "needs a real executionId and status"),
  registry_before_after: (e) => (e && "before" in e && "after" in e ? null : "needs before and after")
};

/*
 * buildEvidenceSubmission(task, artifacts) -> { submission, dropped_narrative, missing_evidence }
 *
 * Artifacts a Builder run could not collect are simply absent. Guardian then
 * returns UNKNOWN_FAILS_CLOSED, which is the correct outcome -- padding the
 * envelope to get a pass is exactly what this module exists to prevent.
 */
function buildEvidenceSubmission(task, artifacts) {
  if (!task || !task.id) throw new EvidenceError("no_task", "Evidence must belong to a task.");
  const raw = artifacts && typeof artifacts === "object" ? artifacts : {};

  const dropped = [];
  const evidence = {};
  const missing = [];
  const malformed = [];

  EVIDENCE_KEYS.forEach((key) => {
    if (!(key in raw) || raw[key] === null || raw[key] === undefined) {
      missing.push(key);
      return;
    }
    const cleaned = stripNarrative(raw[key], dropped, "$." + key, 0);
    const problem = SHAPE[key](cleaned);
    if (problem) {
      malformed.push(key + ": " + problem);
      return; /* omitted -> Guardian reports UNKNOWN for it */
    }
    evidence[key] = cleaned;
  });

  if (malformed.length > 0) {
    throw new EvidenceError("malformed_evidence", "Evidence Guardian could not interpret -- " + malformed.join("; ") + ".");
  }

  const submission = {
    task_id: task.id,
    guardian_contract: "v0.2",
    /* Builder never asks to publish. Publication is Luis's decision and runs
       on a path Builder has no capability for. */
    requests_publish: false,
    /* Structural, not a claim: the isolated phase has no production target.
       Guardian re-derives impact from the raw evidence regardless. */
    production_impact: task.workspace && task.workspace.environment === "production" ? "unknown" : "none",
    evidence: evidence
  };

  secrets.assertClean(submission);

  return {
    submission: submission,
    dropped_narrative: dropped,
    missing_evidence: missing.concat(EVIDENCE_KEYS.filter((k) => malformed.some((m) => m.indexOf(k + ":") === 0)))
  };
}

module.exports = { EVIDENCE_KEYS, NARRATIVE_KEYS, EvidenceError, stripNarrative, buildEvidenceSubmission };
