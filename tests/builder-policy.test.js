"use strict";
/*
 * Builder policy boundaries.
 *
 * These tests are the non-negotiables written as assertions. If one of them
 * fails, Builder has gained a power it must not have.
 */
const test = require("node:test");
const assert = require("node:assert");
const policy = require("../builder/src/policy.js");

test("Builder cannot grant itself any forbidden capability", () => {
  policy.FORBIDDEN_CAPABILITIES.forEach((c) => {
    assert.strictEqual(policy.builderMayPerform(c), false, c + " must be denied");
    assert.throws(() => policy.assertCapability(c), /capability/i);
  });
});

test("an unknown capability is denied, not allowed by omission", () => {
  assert.strictEqual(policy.builderMayPerform("some_capability_nobody_thought_of"), false);
  assert.strictEqual(policy.builderMayPerform(""), false);
  assert.strictEqual(policy.builderMayPerform(undefined), false);
});

test("the capabilities Builder does hold are exactly the read/plan/test set", () => {
  ["analyze", "plan", "create_isolated_workspace", "generate_candidate", "run_isolated_tests", "collect_evidence", "recommend"]
    .forEach((c) => assert.strictEqual(policy.builderMayPerform(c), true, c + " should be granted"));
  /* No overlap between the two lists -- a capability cannot be both. */
  const overlap = policy.GRANTED_CAPABILITIES.filter((c) => policy.FORBIDDEN_CAPABILITIES.indexOf(c) >= 0);
  assert.deepStrictEqual(overlap, []);
});

test("protected surfaces are refused as build targets", () => {
  ["gateway", "central", "guardian", "ghl", "shopmonkey", "payments", "permissions", "credentials", "sessions", "audit_log"]
    .forEach((surface) => {
      assert.throws(
        () => policy.assertScopeAllowed({ surfaces: [surface] }),
        (e) => e.code === "protected_surface",
        surface + " must be refused"
      );
    });
});

test("surface matching is case- and whitespace-insensitive", () => {
  assert.throws(() => policy.assertScopeAllowed({ surfaces: ["  GHL "] }), (e) => e.code === "protected_surface");
});

test("the production client path cannot be a Builder target", () => {
  assert.throws(
    () => policy.assertScopeAllowed({ paths: ["index.html"] }),
    (e) => e.code === "production_path"
  );
  assert.throws(
    () => policy.assertScopeAllowed({ paths: ["./index.html"] }),
    (e) => e.code === "production_path"
  );
});

test("a production target environment is refused", () => {
  assert.throws(
    () => policy.assertScopeAllowed({ paths: ["builder/src/x.js"], target_environment: "production" }),
    (e) => e.code === "production_target"
  );
});

test("a business-data write is refused outright", () => {
  assert.throws(
    () => policy.assertScopeAllowed({ paths: ["builder/src/x.js"], writes_business_data: true }),
    (e) => e.code === "business_data_write"
  );
});

test("an empty or unrecognized scope classifies CRITICAL, not harmless", () => {
  assert.strictEqual(policy.classifyScopeRisk({}), "CRITICAL");
  assert.strictEqual(policy.classifyScopeRisk(null), "CRITICAL");
  assert.throws(() => policy.assertScopeAllowed({}), (e) => e.code === "risk_tier_exceeded");
});

test("an isolated code scope is allowed at BUILD_ISOLATED", () => {
  const tier = policy.assertScopeAllowed({ paths: ["builder/src/memory.js"], target_environment: "isolated" });
  assert.strictEqual(tier, "BUILD_ISOLATED");
});

test("a read-only analysis scope is allowed at ANALYSIS_ONLY", () => {
  assert.strictEqual(policy.assertScopeAllowed({ read_only: true, paths: [], surfaces: [] }), "ANALYSIS_ONLY");
});

test("workspace isolation fails closed on every missing assertion", () => {
  const good = {
    branch: "builder/task-1",
    environment: "isolated",
    can_publish: false,
    has_production_credentials: false,
    writable_paths: ["builder/src/memory.js"]
  };
  assert.strictEqual(policy.assertWorkspaceIsolated(good), true);

  const mutations = [
    ["branch", "main"],
    ["branch", undefined],
    ["environment", "production"],
    ["environment", undefined],
    ["can_publish", true],
    ["can_publish", undefined],
    ["has_production_credentials", true],
    ["writable_paths", undefined],
    ["writable_paths", ["index.html"]]
  ];
  mutations.forEach(([key, value]) => {
    const bad = Object.assign({}, good);
    bad[key] = value;
    assert.throws(
      () => policy.assertWorkspaceIsolated(bad),
      (e) => e.code === "workspace_not_isolated",
      key + "=" + JSON.stringify(value) + " must fail isolation"
    );
  });
});

test("an empty workspace object is not isolated", () => {
  assert.throws(() => policy.assertWorkspaceIsolated({}), (e) => e.code === "workspace_not_isolated");
  assert.throws(() => policy.assertWorkspaceIsolated(null), (e) => e.code === "workspace_not_isolated");
});
