'use strict';
// ============================================================================
// SNAPSHOT of the authorization + intent-classification logic that ships in
// Panchita Core v0.2 (n8n workflow nMSfr0OE42rpPYgE, node "Core Pipeline",
// version 699407ef-4a67-4ebe-9295-50d987fb1867), captured 2026-09-10.
//
// Copied verbatim from the deployed node so the tests exercise the real
// decision logic rather than a paraphrase of it. n8n runtime bindings
// ($input/$json/data-table nodes) are NOT part of this snapshot -- only the
// pure functions, which is exactly the part that decides who may see what.
//
// If Core Pipeline changes, re-capture this file. tests/truck-repair/README.md
// explains how, and why a drifted snapshot is worse than no snapshot.
// ============================================================================

const INTENT_KEYWORDS = {
  appointments_reschedule_execute: ['execute appointment reschedule', 'execute reschedule'],
  appointments_reschedule: ['reschedule appointment', 'reschedule the appointment', 'reschedule my appointment', 'move appointment', 'move my appointment', 'change appointment time', 'change my appointment', 'change the appointment', 'reprogramar cita', 'reprogramar mi cita', 'reprogramar la cita', 'cambiar mi cita', 'cambiar la cita', 'mover mi cita', 'mover la cita'],
  business_summary: ['cómo va mi negocio', 'how is my business', 'resumen', 'summary'],
  appointment_status: ['cita', 'appointment', 'agenda'],
  estimate_status: ['cotización', 'estimate', 'presupuesto'],
  truck_status: ['camión', 'truck', 'vehiculo', 'vehicle'],
  revenue_summary: ['revenue', 'ingresos', 'profit', 'ganancia'],
  payroll_lookup: ['payroll', 'nómina', 'nomina'],
  add_note: ['add a note', 'internal note', 'agregar nota', 'nota interna'],
  issue_refund: ['refund', 'reembolso'],
  simulate_failure: ['simulate failure', 'simulate tool failure', 'simular falla'],
  customer_lookup: ['customer lookup', 'customer info', 'look up customer', 'buscar cliente'],
  parts_status: ['parts status', 'part status', 'estado de partes', 'estado de la pieza'],
};

const INTENT_PERMISSION_REQUIRED = {
  revenue_summary: 'financial_data', payroll_lookup: 'employee_pii', issue_refund: 'financial_data',
  customer_lookup: 'customer_pii', appointments_reschedule: 'appointments.write',
};

const INTENT_PERMISSIONS_REQUIRED_ALL = {
  appointments_reschedule_execute: ['appointments.write', 'appointments.write.execute'],
};

const INTENT_SENSITIVITY = {
  business_summary: 'read_normal', appointment_status: 'read_normal', estimate_status: 'read_normal',
  truck_status: 'read_normal', revenue_summary: 'read_sensitive', payroll_lookup: 'read_highly_sensitive',
  add_note: 'write_low', issue_refund: 'write_sensitive', simulate_failure: 'read_normal',
  customer_lookup: 'read_normal', parts_status: 'read_normal', appointments_reschedule: 'write_low',
  appointments_reschedule_execute: 'write_low',
};

function stripDiacritics(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function classifyIntent(message) {
  const msg = stripDiacritics(String(message).toLowerCase());
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((k) => msg.includes(stripDiacritics(k.toLowerCase())))) return intent;
  }
  return 'unknown';
}

// Resolves the trusted context from registry rows. Client-supplied role and
// permissions are never consulted. Fails closed on: no match, ambiguous match,
// inactive tenant, malformed record.
function resolveContext(norm, registryRows) {
  const rows = (Array.isArray(registryRows) ? registryRows : [])
    .filter((r) => r && r.tenant_id === norm.tenant_id && r.user_id === norm.user_id);

  if (rows.length === 0) {
    const e = new Error('Tenant/user not found in trusted registry: ' + norm.tenant_id + '/' + norm.user_id);
    e.kind = 'PermissionError'; throw e;
  }
  if (rows.length > 1) {
    const e = new Error('Registry integrity error: multiple records found for ' + norm.tenant_id + '/' + norm.user_id + '; refusing to guess.');
    e.kind = 'PermissionError'; throw e;
  }

  const row = rows[0];
  const isActive = row.tenant_active === true || row.tenant_active === 'true';
  if (!isActive) { const e = new Error('Tenant is inactive: ' + norm.tenant_id); e.kind = 'PermissionError'; throw e; }
  if (!row.role) { const e = new Error('Registry record is malformed (missing role) for ' + norm.tenant_id + '/' + norm.user_id); e.kind = 'PermissionError'; throw e; }

  const modes = String(row.modes || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (modes.length === 0) { const e = new Error('Registry record is malformed (missing modes) for ' + norm.tenant_id + '/' + norm.user_id); e.kind = 'PermissionError'; throw e; }

  const permissions = new Set(String(row.permissions || '').split(',').map((s) => s.trim()).filter(Boolean));
  return { allowed_modes: modes, permissions, trusted_role: row.role };
}

function checkCrossTenant(norm) {
  if (norm.target_tenant_id && norm.target_tenant_id !== norm.tenant_id) {
    const e = new Error('Cross-tenant access is not permitted for this role.'); e.kind = 'PermissionError'; throw e;
  }
}

function checkAuthorization(intent, context) {
  const multi = INTENT_PERMISSIONS_REQUIRED_ALL[intent];
  if (multi) {
    const missing = multi.filter((p) => !context.permissions.has(p));
    if (missing.length) {
      const e = new Error("User is not authorized for category(ies) '" + missing.join(', ') + "' (required for intent '" + intent + "').");
      e.kind = 'PermissionError'; throw e;
    }
    return;
  }
  const required = INTENT_PERMISSION_REQUIRED[intent];
  if (required && !context.permissions.has(required)) {
    const e = new Error("User is not authorized for category '" + required + "' (required for intent '" + intent + "').");
    e.kind = 'PermissionError'; throw e;
  }
}

function classifyMode(context) {
  let preferred = context.trusted_role === 'owner' ? 'admin' : 'business';
  if (!context.allowed_modes.includes(preferred)) preferred = context.allowed_modes[0];
  return preferred;
}

function classifyRisk(intent) { return INTENT_SENSITIVITY[intent] || 'unknown'; }

// The live registry as audited on 2026-09-10 (data table mTEaG68qHmalnOiE).
const LIVE_REGISTRY = [
  { tenant_id: 'jl-truck-repair-test', tenant_active: true, user_id: 'owner-test', role: 'owner', permissions: 'financial_data,customer_pii,employee_pii', modes: 'admin,business' },
  { tenant_id: 'jl-truck-repair-test', tenant_active: true, user_id: 'employee-test', role: 'employee', permissions: '', modes: 'business' },
  { tenant_id: 'jl-truck-repair-test', tenant_active: true, user_id: 'dryrun-test-owner', role: 'owner', permissions: 'financial_data,customer_pii,employee_pii,appointments.write', modes: 'admin,business' },
  { tenant_id: 'jl-truck-repair-test', tenant_active: true, user_id: 'phase2b-execute-test', role: 'owner', permissions: 'appointments.write', modes: 'admin,business' },
  { tenant_id: 'jl-truck-repair-test', tenant_active: true, user_id: 'ghl-caller-anonymous', role: 'caller', permissions: 'appointments.write', modes: 'business' },
];

module.exports = {
  INTENT_KEYWORDS, INTENT_PERMISSION_REQUIRED, INTENT_PERMISSIONS_REQUIRED_ALL, INTENT_SENSITIVITY,
  LIVE_REGISTRY, classifyIntent, resolveContext, checkCrossTenant, checkAuthorization,
  classifyMode, classifyRisk, stripDiacritics,
};
