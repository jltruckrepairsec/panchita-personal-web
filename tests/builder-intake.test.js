"use strict";
/*
 * The submission path: "Panchita, improve your memory" -> a Builder task.
 *
 * The tests that matter here are about what Builder refuses to receive.
 */
const test = require("node:test");
const assert = require("node:assert");
const intake = require("../builder/src/intake.js");

const SCOPE = { paths: ["builder/src/memory.js"], surfaces: [], target_environment: "isolated" };

function envelope(overrides) {
  return Object.assign({
    request_id: "req-1",
    correlation_id: "corr-1",
    source: "panchita_personal",
    channel: "personal_adapter",
    language: "en",
    raw_user_request: "Panchita, improve your memory",
    trusted_authorization_context: {
      source: "internal_trusted_caller",
      identity_id: "identity-ref",
      tenant_id: "tenant-ref",
      authorization_context_reference: "authctx-abc"
    }
  }, overrides || {});
}

test("an authenticated build request becomes a DRAFT task that asks for approval", () => {
  const out = intake.mapCentralEnvelopeToBuilderRequest(envelope(), { scope: SCOPE, id_seed: "s" });
  assert.strictEqual(out.accepted, true);
  assert.strictEqual(out.task.state, "DRAFT");
  assert.strictEqual(out.response.status, "accepted_for_planning");
  assert.strictEqual(out.response.requires_approval, true);
  assert.strictEqual(out.response.data.task_id, out.task.id);
});

test("the request reaches Builder with references only -- never a session token", () => {
  const out = intake.mapCentralEnvelopeToBuilderRequest(envelope(), { scope: SCOPE, id_seed: "s" });
  assert.strictEqual(out.task.requested_by.identity_reference, "identity-ref");
  assert.strictEqual(out.task.requested_by.tenant_reference, "tenant-ref");
  const serialized = JSON.stringify(out.task);
  ["session_id", "session_token", "factor_provided", "password"].forEach((f) => {
    assert.ok(serialized.indexOf(f) < 0, "task record mentions " + f);
  });
});

test("an envelope carrying a credential field is a routing bug and is refused", () => {
  intake.FORBIDDEN_ENVELOPE_FIELDS.forEach((field) => {
    const e = envelope();
    e[field] = "some-value";
    assert.throws(
      () => intake.mapCentralEnvelopeToBuilderRequest(e, { scope: SCOPE }),
      (err) => err.code === "credential_in_envelope",
      field + " must be refused"
    );
  });
});

test("without a trusted authorization context, Builder will not start work", () => {
  [undefined, null, {}, { source: "x" }, "not-an-object"].forEach((ctx) => {
    const out = intake.mapCentralEnvelopeToBuilderRequest(envelope({ trusted_authorization_context: ctx }), { scope: SCOPE });
    assert.strictEqual(out.accepted, false, JSON.stringify(ctx));
    assert.strictEqual(out.task, null);
    assert.strictEqual(out.response.status, "reauth_required");
  });
});

test("Central's public-webhook path -- which hardcodes a null context -- cannot start a build", () => {
  const publicPath = envelope({ trusted_authorization_context: null, source: "public_webhook" });
  const out = intake.mapCentralEnvelopeToBuilderRequest(publicPath, { scope: SCOPE });
  assert.strictEqual(out.accepted, false);
  assert.strictEqual(out.response.status, "reauth_required");
});

test("build intent is recognized in both of Luis's languages, accents and all", () => {
  [
    "Panchita, improve your memory",
    "Panchita, mejora tu memoria",
    "Panchita, mejorá tu memoria",
    "add this capability: remember the date",
    "quiero que puedas recordar la fecha",
    "nueva capacidad: resumir ordenes abiertas"
  ].forEach((t) => assert.strictEqual(intake.looksLikeBuildRequest(t), true, t));
});

test("ordinary questions are not treated as development requests", () => {
  [
    "what time is it",
    "que hora es",
    "how is the shop doing today",
    "cuantos camiones hay en el taller",
    ""
  ].forEach((t) => assert.strictEqual(intake.looksLikeBuildRequest(t), false, t));
});

test("a non-build message asks for clarification instead of opening a task", () => {
  const out = intake.mapCentralEnvelopeToBuilderRequest(envelope({ raw_user_request: "how is the shop doing" }), { scope: SCOPE });
  assert.strictEqual(out.accepted, false);
  assert.strictEqual(out.response.status, "clarification_required");
  assert.strictEqual(out.response.requires_followup, true);
});

test("Spanish requests get Spanish replies", () => {
  const out = intake.mapCentralEnvelopeToBuilderRequest(envelope({ language: "es", raw_user_request: "Panchita, mejora tu memoria" }), { scope: SCOPE, id_seed: "s" });
  assert.strictEqual(out.accepted, true);
  assert.match(out.response.human_readable_response, /plan para que lo apruebes/);
});

test("an unscoped request becomes analysis-only -- Panchita may think, not build", () => {
  const out = intake.mapCentralEnvelopeToBuilderRequest(envelope(), { id_seed: "s" });
  assert.strictEqual(out.accepted, true);
  assert.strictEqual(out.task.risk_tier, "ANALYSIS_ONLY");
  assert.deepStrictEqual(out.task.scope.paths, []);
});

test("a request scoped at a protected surface is refused before a task exists", () => {
  assert.throws(
    () => intake.mapCentralEnvelopeToBuilderRequest(envelope(), { scope: { surfaces: ["gateway"] } }),
    (e) => e.code === "protected_surface"
  );
  assert.throws(
    () => intake.mapCentralEnvelopeToBuilderRequest(envelope(), { scope: { paths: ["index.html"] } }),
    (e) => e.code === "production_path"
  );
});

test("the reply matches the response contract Panchita Personal already renders", () => {
  const out = intake.mapCentralEnvelopeToBuilderRequest(envelope(), { scope: SCOPE, id_seed: "s" });
  assert.deepStrictEqual(
    Object.keys(out.response).sort(),
    ["audit_reference", "data", "human_readable_response", "requires_approval", "requires_followup", "status"]
  );
});

test("no Builder reply can read as permission already given", () => {
  const accepted = intake.mapCentralEnvelopeToBuilderRequest(envelope(), { scope: SCOPE, id_seed: "s" }).response;
  assert.strictEqual(accepted.requires_approval, true);
  const clarify = intake.mapCentralEnvelopeToBuilderRequest(envelope({ raw_user_request: "hola" }), { scope: SCOPE }).response;
  assert.strictEqual(clarify.requires_approval, false);
  assert.strictEqual(clarify.data, null);
});
