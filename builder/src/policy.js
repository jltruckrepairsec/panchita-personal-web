"use strict";
/*
 * Builder policy: the boundaries that are code, not prose.
 *
 * Everything in this file is a *deny* decision Builder cannot argue with.
 * Nothing here reads a credential, opens a socket, or knows an endpoint.
 */

/* Risk tiers, lowest to highest. Builder may act autonomously only up to
   BUILD_ISOLATED; anything above needs Luis. */
const RISK_TIERS = ["ANALYSIS_ONLY", "BUILD_ISOLATED", "WRITE_SENSITIVE", "CRITICAL"];
const MAX_AUTONOMOUS_TIER = "BUILD_ISOLATED";

/* Surfaces Builder may never take as a build target. Owning session, live
   money, live customers, or the authorization chain itself. */
const PROTECTED_SURFACES = [
  "gateway",
  "central",
  "guardian",
  "ghl",
  "shopmonkey",
  "payments",
  "billing",
  "credentials",
  "sessions",
  "authentication",
  "authorization",
  "permissions",
  "audit_log",
  "production"
];

/* Repository paths that belong to the deployed client. A Builder task may
   only name these as a target with an explicit owner approval; the isolated
   phase never does. */
const PRODUCTION_PATHS = ["index.html"];

/* Capabilities. Builder holds the first list and can never hold the second.
   These are not configuration: nothing in the Builder runtime may move an
   entry from FORBIDDEN to GRANTED. */
const GRANTED_CAPABILITIES = [
  "analyze",
  "plan",
  "create_isolated_workspace",
  "generate_candidate",
  "run_isolated_tests",
  "collect_evidence",
  "append_audit",
  "recommend"
];

const FORBIDDEN_CAPABILITIES = [
  "publish",
  "activate_workflow",
  "deploy",
  "approve",
  "grant_permission",
  "modify_permission",
  "read_secret",
  "write_secret",
  "write_business_data",
  "activate_paid_service",
  "modify_guardian",
  "rewrite_audit",
  "self_grant"
];

class PolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
  }
}

function normalize(value) {
  return String(value === undefined || value === null ? "" : value).trim().toLowerCase();
}

/* A capability check that fails closed: anything not explicitly granted is
   refused, so a capability nobody thought of is denied by default. */
function builderMayPerform(capability) {
  const c = normalize(capability);
  if (FORBIDDEN_CAPABILITIES.indexOf(c) >= 0) return false;
  return GRANTED_CAPABILITIES.indexOf(c) >= 0;
}

function assertCapability(capability) {
  if (!builderMayPerform(capability)) {
    throw new PolicyError(
      "capability_denied",
      "Builder holds no '" + normalize(capability) + "' capability and cannot grant itself one."
    );
  }
  return true;
}

function isSurfaceProtected(surface) {
  return PROTECTED_SURFACES.indexOf(normalize(surface)) >= 0;
}

function isProductionPath(path) {
  const p = String(path || "").replace(/^\.\//, "").trim();
  return PRODUCTION_PATHS.indexOf(p) >= 0;
}

/* Risk tier for a declared scope. Deliberately pessimistic: an unrecognized
   or empty scope is CRITICAL, not ANALYSIS_ONLY. */
function classifyScopeRisk(scope) {
  const s = scope && typeof scope === "object" ? scope : {};
  const surfaces = Array.isArray(s.surfaces) ? s.surfaces : [];
  const paths = Array.isArray(s.paths) ? s.paths : [];

  if (surfaces.some(isSurfaceProtected)) return "CRITICAL";
  if (paths.some(isProductionPath)) return "WRITE_SENSITIVE";
  if (s.writes_business_data === true) return "WRITE_SENSITIVE";
  if (s.target_environment && normalize(s.target_environment) === "production") return "CRITICAL";
  if (s.read_only === true && paths.length === 0) return "ANALYSIS_ONLY";
  if (paths.length > 0 || surfaces.length > 0) return "BUILD_ISOLATED";
  return "CRITICAL";
}

function tierAtMost(tier, max) {
  const a = RISK_TIERS.indexOf(tier);
  const b = RISK_TIERS.indexOf(max);
  return a >= 0 && b >= 0 && a <= b;
}

/* The intake gate. Returns the risk tier; throws when the scope is one
   Builder must never take on. */
function assertScopeAllowed(scope) {
  const s = scope && typeof scope === "object" ? scope : {};
  const surfaces = Array.isArray(s.surfaces) ? s.surfaces : [];
  const paths = Array.isArray(s.paths) ? s.paths : [];

  const blockedSurface = surfaces.filter(isSurfaceProtected);
  if (blockedSurface.length > 0) {
    throw new PolicyError(
      "protected_surface",
      "Out of Builder's reach: " + blockedSurface.join(", ") + "."
    );
  }
  const blockedPath = paths.filter(isProductionPath);
  if (blockedPath.length > 0) {
    throw new PolicyError(
      "production_path",
      "Production-owned path(s) require owner approval and a deploy path Builder does not have: " +
        blockedPath.join(", ") + "."
    );
  }
  if (s.target_environment && normalize(s.target_environment) === "production") {
    throw new PolicyError("production_target", "Builder never targets the production environment.");
  }
  if (s.writes_business_data === true) {
    throw new PolicyError("business_data_write", "Builder cannot write business data.");
  }

  const tier = classifyScopeRisk(scope);
  if (!tierAtMost(tier, MAX_AUTONOMOUS_TIER)) {
    throw new PolicyError("risk_tier_exceeded", "Scope classified " + tier + "; Builder stops at " + MAX_AUTONOMOUS_TIER + ".");
  }
  return tier;
}

/* Isolation check for a provisioned workspace. Every clause must hold; a
   missing field is a failure, never a pass. */
function assertWorkspaceIsolated(workspace) {
  const w = workspace && typeof workspace === "object" ? workspace : {};
  const problems = [];

  if (!w.branch || typeof w.branch !== "string") problems.push("no branch recorded");
  else if (["main", "master", "production", "release"].indexOf(normalize(w.branch)) >= 0) {
    problems.push("branch '" + w.branch + "' is a protected branch");
  }
  if (normalize(w.environment) === "production") problems.push("environment is production");
  if (!w.environment) problems.push("no environment recorded");
  if (w.can_publish !== false) problems.push("workspace does not assert can_publish=false");
  if (w.has_production_credentials !== false) problems.push("workspace does not assert has_production_credentials=false");

  const touched = Array.isArray(w.writable_paths) ? w.writable_paths : null;
  if (!touched) problems.push("no writable_paths recorded");
  else touched.filter(isProductionPath).forEach((p) => problems.push("writable path '" + p + "' is production-owned"));

  if (problems.length > 0) {
    throw new PolicyError("workspace_not_isolated", "Workspace is not isolated: " + problems.join("; ") + ".");
  }
  return true;
}

module.exports = {
  RISK_TIERS,
  MAX_AUTONOMOUS_TIER,
  PROTECTED_SURFACES,
  PRODUCTION_PATHS,
  GRANTED_CAPABILITIES,
  FORBIDDEN_CAPABILITIES,
  PolicyError,
  builderMayPerform,
  assertCapability,
  isSurfaceProtected,
  isProductionPath,
  classifyScopeRisk,
  tierAtMost,
  assertScopeAllowed,
  assertWorkspaceIsolated
};
