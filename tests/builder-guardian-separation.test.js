"use strict";
/*
 * Guardian independence.
 *
 * Guardian's value is that it does not take Builder's word for anything. Two
 * things have to hold: Builder sends artifacts rather than claims, and
 * Builder does not decide the verdict.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const evidence = require("../builder/src/evidence.js");
const verdict = require("../builder/src/verdict.js");

const TASK = { id: "bt-1", workspace: { environment: "isolated" } };

function fullArtifacts() {
  return {
    workflow_version_state: {
      workflowId: "wf-1",
      versionId: "draft-2",
      activeVersionId: "active-1",
      baselineActiveVersionId: "active-1"
    },
    data_source_before_after: { before: [{ id: 1 }], after: [{ id: 1 }] },
    test_execution_result: { executionId: "exec-1", status: "success" },
    registry_before_after: { before: { modules: 3 }, after: { modules: 3 } }
  };
}

test("the envelope carries exactly the four evidence keys Guardian reads", () => {
  const built = evidence.buildEvidenceSubmission(TASK, fullArtifacts());
  assert.deepStrictEqual(Object.keys(built.submission.evidence).sort(), evidence.EVIDENCE_KEYS.slice().sort());
  assert.strictEqual(built.submission.task_id, "bt-1");
  assert.strictEqual(built.submission.requests_publish, false);
});

test("Builder's narrative claims are stripped out of the evidence", () => {
  const artifacts = fullArtifacts();
  artifacts.test_execution_result.summary = "all good, I checked it myself";
  artifacts.test_execution_result.tests_passed = true;
  artifacts.workflow_version_state.claim = "production untouched";
  artifacts.data_source_before_after.confidence = "high";

  const built = evidence.buildEvidenceSubmission(TASK, artifacts);
  const serialized = JSON.stringify(built.submission);
  assert.ok(serialized.indexOf("all good") < 0, "a Builder summary reached Guardian");
  assert.ok(serialized.indexOf("production untouched") < 0);
  assert.ok(serialized.indexOf("confidence") < 0);
  assert.strictEqual(built.dropped_narrative.length, 4);
  /* The artifacts themselves survive. */
  assert.strictEqual(built.submission.evidence.test_execution_result.executionId, "exec-1");
});

test("missing evidence is reported and simply absent -- never padded to look complete", () => {
  const artifacts = fullArtifacts();
  delete artifacts.registry_before_after;
  delete artifacts.data_source_before_after;
  const built = evidence.buildEvidenceSubmission(TASK, artifacts);
  assert.deepStrictEqual(built.missing_evidence.sort(), ["data_source_before_after", "registry_before_after"]);
  assert.ok(!("registry_before_after" in built.submission.evidence));
});

test("evidence Guardian could not interpret is refused at the source", () => {
  const artifacts = fullArtifacts();
  artifacts.test_execution_result = { status: "success" }; /* no execution id */
  assert.throws(() => evidence.buildEvidenceSubmission(TASK, artifacts), (e) => e.code === "malformed_evidence");

  const artifacts2 = fullArtifacts();
  artifacts2.data_source_before_after = { after: [] }; /* no baseline */
  assert.throws(() => evidence.buildEvidenceSubmission(TASK, artifacts2), (e) => e.code === "malformed_evidence");
});

test("a credential can never ride along inside evidence", () => {
  const artifacts = fullArtifacts();
  artifacts.registry_before_after.before = { hook: "https://user:hunter2@example.invalid/x" };
  assert.throws(() => evidence.buildEvidenceSubmission(TASK, artifacts), /credential/i);
});

test("Builder never sets requests_publish, whatever it is handed", () => {
  const artifacts = fullArtifacts();
  artifacts.requests_publish = true;
  const built = evidence.buildEvidenceSubmission(TASK, artifacts);
  assert.strictEqual(built.submission.requests_publish, false);
});

/* ---- verdicts are read, never computed ---------------------------------- */

test("only VERIFIED_COMPLETE clears; everything else does not", () => {
  const base = { guardian_version: "v0.2", task_id: "bt-1", can_publish: false };
  assert.strictEqual(verdict.interpretVerdict(Object.assign({ verdict: "VERIFIED_COMPLETE" }, base)).cleared, true);
  ["PASS_WITH_APPROVAL_REQUIRED", "UNKNOWN_FAILS_CLOSED", "FAIL", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "SOMETHING_NEW", ""]
    .forEach((v) => {
      assert.strictEqual(verdict.interpretVerdict(Object.assign({ verdict: v }, base)).cleared, false, v + " must not clear");
    });
});

test("every interpreted verdict still requires Luis before anything ships", () => {
  const base = { guardian_version: "v0.2", task_id: "bt-1", can_publish: false };
  ["VERIFIED_COMPLETE", "PASS_WITH_APPROVAL_REQUIRED", "FAIL"].forEach((v) => {
    assert.strictEqual(verdict.interpretVerdict(Object.assign({ verdict: v }, base)).requires_owner_approval, true);
  });
});

test("a missing, empty or non-object response fails closed", () => {
  [null, undefined, "", 0, "VERIFIED_COMPLETE"].forEach((r) => {
    const out = verdict.interpretVerdict(r);
    assert.strictEqual(out.cleared, false);
    assert.strictEqual(out.reason, "no_guardian_response");
  });
});

test("an unsigned verdict is treated as tampered", () => {
  const out = verdict.interpretVerdict({ verdict: "VERIFIED_COMPLETE", can_publish: false });
  assert.strictEqual(out.tampered, true);
  assert.strictEqual(out.reason, "unsigned_verdict");
});

test("failed and unknown checks are surfaced for Luis to read", () => {
  const raw = {
    guardian_version: "v0.2",
    can_publish: false,
    verdict: "UNKNOWN_FAILS_CLOSED",
    independent_checks: [
      { item: "workflow_version_state", status: "VERIFIED_PASS", detail: "ok" },
      { item: "registry_before_after", status: "UNKNOWN", detail: "No raw evidence supplied for this item." },
      { item: "data_source_before_after", status: "VERIFIED_FAIL", detail: "snapshots DIFFER" }
    ]
  };
  const failed = verdict.failedChecks(raw);
  assert.strictEqual(failed.length, 2);
  assert.deepStrictEqual(failed.map((f) => f.item).sort(), ["data_source_before_after", "registry_before_after"]);
});

/* ---- structural separation ---------------------------------------------- */

test("no Builder module reimplements Guardian's evaluation", () => {
  const dir = path.join(__dirname, "..", "builder", "src");
  const sources = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(sources.length > 0);
  sources.forEach((file) => {
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    /* Guardian decides pass/fail. Builder may name a verdict; it may not
       construct one. */
    assert.ok(
      !/verdict\s*=\s*['"]VERIFIED_COMPLETE/.test(code),
      file + " assigns a Guardian verdict"
    );
    assert.ok(!/can_publish\s*[:=]\s*true/.test(code), file + " sets can_publish true");
  });
});

test("no Builder module can reach the network or a credential store", () => {
  const dir = path.join(__dirname, "..", "builder", "src");
  fs.readdirSync(dir).filter((f) => f.endsWith(".js")).forEach((file) => {
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    [/\bfetch\s*\(/, /require\(['"]https?['"]\)/, /\bXMLHttpRequest\b/, /\bchild_process\b/, /process\.env\./]
      .forEach((re) => assert.ok(!re.test(code), file + " reaches outside the process: " + re));
  });
});

test("no endpoint URL or webhook path is embedded in Builder source", () => {
  const dir = path.join(__dirname, "..", "builder", "src");
  fs.readdirSync(dir).filter((f) => f.endsWith(".js")).forEach((file) => {
    const code = fs.readFileSync(path.join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/https?:\/\/[^\s"')]+/.test(code), file + " embeds a URL outside a comment");
  });
});
