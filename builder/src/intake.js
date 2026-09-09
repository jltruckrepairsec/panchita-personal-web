"use strict";
/*
 * How "Panchita, improve your memory" becomes a Builder task.
 *
 * The path, once wired:
 *   index.html -> Gateway (authenticates)
 *     -> Personal-Central Adapter (validates the session, mints the trusted
 *        context: identity/tenant/authorization *references*, never tokens)
 *     -> Central (routes on intent; Central does not authorize)
 *     -> Builder Intake  <- this module
 *
 * Central's public-webhook path hardcodes trusted_authorization_context to
 * null; only the internal Execute-Workflow path carries a real one. Builder
 * therefore refuses any envelope without one -- a request that arrived over
 * the untrusted path can be read, but never acted on.
 *
 * This module does no authentication. It cannot: it has no credential, no
 * session table and no way to reach one. That is the boundary, not an
 * omission.
 */
const task = require("./task.js");
const policy = require("./policy.js");
const secrets = require("./secrets.js");

/* Fields that must never appear in an envelope reaching Builder. Their
   presence is a routing bug upstream and is treated as one. */
const FORBIDDEN_ENVELOPE_FIELDS = [
  "session_id",
  "session_token",
  "password",
  "factor_provided",
  "auth_factor",
  "credential",
  "credentials",
  "api_key"
];

/* Phrases that mean "change yourself", in Luis's two languages. Central's
   router already carries a near-identical list under the prompt_engineer
   intent; this is the Builder-side confirmation, not a second router. */
const BUILD_INTENT_PHRASES = [
  "improve your", "improve her", "add this capability", "add a capability", "new capability",
  "add this feature", "add a feature", "build this", "implement this", "fix your",
  "mejora tu", "mejorar tu", "mejora su", "agrega esta capacidad", "agregar capacidad",
  "nueva capacidad", "nueva funcion", "agrega esta funcion", "quiero que puedas",
  "quiero que panchita pueda", "implementa esto", "construye esto", "arregla tu"
];

class IntakeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IntakeError";
    this.code = code;
  }
}

function stripDiacritics(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function looksLikeBuildRequest(text) {
  const t = stripDiacritics(String(text || "").toLowerCase());
  return BUILD_INTENT_PHRASES.some((p) => t.indexOf(stripDiacritics(p)) >= 0);
}

/*
 * mapCentralEnvelopeToBuilderRequest(envelope, opts) -> { accepted, task, response }
 *
 * envelope is Central's normalized request. Never a browser payload.
 */
function mapCentralEnvelopeToBuilderRequest(envelope, opts) {
  const e = envelope && typeof envelope === "object" ? envelope : {};
  const o = opts && typeof opts === "object" ? opts : {};
  const language = e.language === "es" ? "es" : "en";

  const leaked = FORBIDDEN_ENVELOPE_FIELDS.filter((f) => e[f] !== undefined && e[f] !== null && e[f] !== "");
  if (leaked.length > 0) {
    throw new IntakeError(
      "credential_in_envelope",
      "Envelope carries fields Builder must never receive: " + leaked.join(", ") + "."
    );
  }
  secrets.assertClean(e);

  const ctx = e.trusted_authorization_context;
  if (!ctx || typeof ctx !== "object" || (!ctx.identity_id && !ctx.tenant_id)) {
    return {
      accepted: false,
      task: null,
      response: buildResponse(
        {
          status: "reauth_required",
          language: language,
          message_en: "I can't start development work on this request -- it didn't arrive over an authenticated path.",
          message_es: "No puedo empezar trabajo de desarrollo con esta solicitud: no llego por un canal autenticado."
        }
      )
    };
  }

  const text = String(e.raw_user_request || e.raw_user_message || e.message || "").trim();
  if (!looksLikeBuildRequest(text)) {
    return {
      accepted: false,
      task: null,
      response: buildResponse({
        status: "clarification_required",
        language: language,
        message_en: "I'm not sure that's a request to change how I work. Tell me what capability you want and I'll write a plan first.",
        message_es: "No estoy segura de que sea una peticion para cambiar como funciono. Dime que capacidad quieres y primero escribo un plan."
      })
    };
  }

  /* Scope is proposed by the caller of this module (the Builder planner),
     never inferred from Luis's sentence. An unscoped request becomes an
     analysis-only task: Panchita may think about it, nothing more. */
  const scope = o.scope || { paths: [], surfaces: [], target_environment: "isolated", read_only: true };
  policy.assertScopeAllowed(scope);

  const draft = task.createTaskDraft({
    request_text: text,
    scope: scope,
    budget_units: o.budget_units || 100,
    origin: {
      source: e.source || "panchita_personal",
      channel: e.channel || "unknown",
      correlation_id: e.correlation_id || e.request_id || null,
      request_id: e.request_id || null,
      language: language
    },
    requested_by: {
      identity_reference: ctx.identity_id || null,
      tenant_reference: ctx.tenant_id || null
    },
    id_seed: o.id_seed,
    now: o.now
  });

  return {
    accepted: true,
    task: draft,
    response: buildResponse({
      status: "accepted_for_planning",
      language: language,
      task_id: draft.id,
      message_en: "I've opened an isolated development task and I'll come back with a plan for you to approve. Nothing changes until you say so.",
      message_es: "Abri una tarea de desarrollo aislada y regreso con un plan para que lo apruebes. Nada cambia hasta que tu lo digas."
    })
  };
}

/*
 * The shape Panchita Personal already understands: the Adapter's response
 * contract (status / human_readable_response / data / requires_approval /
 * audit_reference). No client change is needed to show a Builder reply.
 */
function buildResponse(o) {
  return {
    status: o.status,
    human_readable_response: o.language === "es" ? o.message_es : o.message_en,
    data: o.task_id ? { task_id: o.task_id } : null,
    requires_followup: o.status === "clarification_required",
    /* Every Builder reply that proposes work asks for Luis. Nothing here can
       be read as permission already given. */
    requires_approval: o.status === "accepted_for_planning",
    audit_reference: o.task_id || null
  };
}

module.exports = {
  FORBIDDEN_ENVELOPE_FIELDS,
  BUILD_INTENT_PHRASES,
  IntakeError,
  looksLikeBuildRequest,
  mapCentralEnvelopeToBuilderRequest,
  buildResponse
};
