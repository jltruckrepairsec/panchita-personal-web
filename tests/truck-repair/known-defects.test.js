'use strict';
// CHARACTERISATION TESTS for defects found in the 2026-09-10 audit.
//
// These assert the system's CURRENT, WRONG behaviour on purpose, so the gap is
// executable rather than a paragraph someone can skim past. Each test names the
// defect ID from docs/truck-repair/GO-LIVE-READINESS.md and states what the
// behaviour must become.
//
// When a defect is fixed, the matching test SHOULD fail. That is the signal to
// delete it and write the real assertion. A green run here does not mean
// "healthy" -- it means "still broken, exactly as documented".

const test = require('node:test');
const assert = require('node:assert');
const C = require('./core-logic-snapshot.js');

test('C1: an emergency is misclassified as a routine status lookup', () => {
  // Reproduced live as n8n execution 1634: the caller was answered
  // "I didn't quite catch what you need -- let me connect you with our team."
  //
  // MUST BECOME: a dedicated emergency intent, classified BEFORE the keyword
  // router, that captures location + occupant safety and escalates a LEVEL 1
  // call to a human immediately, without attempting any record lookup.
  const emergencies = [
    'my truck is on fire on the highway I need help now',
    'mi camion se incendio en la carretera necesito ayuda',
    'the trailer jackknifed and my driver is trapped',
  ];
  for (const utterance of emergencies) {
    const intent = C.classifyIntent(utterance);
    assert.notStrictEqual(intent, 'emergency_tow', 'no emergency intent exists yet');
    assert.ok(
      ['truck_status', 'unknown'].includes(intent),
      'emergency "' + utterance + '" currently classifies as ' + intent
    );
  }
  // The specific reported case: the word "truck" wins over the whole sentence.
  assert.strictEqual(C.classifyIntent('my truck is on fire on the highway I need help now'), 'truck_status');
});

test('C1b: substring matching makes the router blind to what the caller means', () => {
  // Every case below is a real phrasing a shop hears, classified by the live
  // keyword table. The router matches a word, never a meaning.
  //
  // MUST BECOME: intent classification that can tell a complaint from an
  // enquiry, a request from a lookup, and a breakdown from a status check.
  const misreadings = [
    // a complaint, read as an appointment enquiry
    ['quiero quejarme, perdi mi cita por su culpa', 'appointment_status'],
    // a complaint about damage, read as a status lookup
    ['my truck was returned with a new dent, I want to complain', 'truck_status'],
    // a question about waiting time, read as a request for an estimate record
    ['do you have an estimate of how long the wait is', 'estimate_status'],
    // a LEVEL 2 roadside breakdown, read as a status lookup
    ['the truck broke down, I am stranded on the shoulder', 'truck_status'],
    // a request to BOOK a new appointment, read as a lookup of an existing one
    ['quiero hacer una cita nueva para el martes', 'appointment_status'],
  ];
  for (const [utterance, currentIntent] of misreadings) {
    assert.strictEqual(
      C.classifyIntent(utterance), currentIntent,
      JSON.stringify(utterance) + ' is currently classified as ' + currentIntent
    );
  }
});

test('H1: the anonymous phone caller holds appointments.write', () => {
  // Registry row 5. Harmless today only because the LIVE module has no write
  // node -- the grant itself is real and should be revoked.
  //
  // MUST BECOME: ghl-caller-anonymous holds no write permission at all.
  const context = C.resolveContext(
    { tenant_id: 'jl-truck-repair-test', user_id: 'ghl-caller-anonymous' },
    C.LIVE_REGISTRY
  );
  assert.strictEqual(context.permissions.has('appointments.write'), true);
  // And so the dry-run reschedule intent is authorized for an anonymous caller.
  assert.doesNotThrow(() => C.checkAuthorization('appointments_reschedule', context));
});

test('M2: business_summary has no permission gate at all', () => {
  // Today it returns mock text, so nothing leaks. If it is ever wired to real
  // financial data, every anonymous caller reaches it.
  //
  // MUST BECOME: business_summary requires financial_data.
  assert.strictEqual(C.INTENT_PERMISSION_REQUIRED.business_summary, undefined);
  const context = C.resolveContext(
    { tenant_id: 'jl-truck-repair-test', user_id: 'ghl-caller-anonymous' },
    C.LIVE_REGISTRY
  );
  assert.doesNotThrow(
    () => C.checkAuthorization('business_summary', context),
    'an anonymous caller is currently authorized for business_summary'
  );
});

test('C2: no intent carries a customer scope, so an ID is a bearer token', () => {
  // Every customer-facing read is keyed on a record ID alone. There is no
  // customer/caller dimension anywhere in the contract.
  //
  // MUST BECOME: reads are filtered by an identified caller's scope.
  const customerFacing = ['truck_status', 'estimate_status', 'appointment_status', 'parts_status'];
  for (const intent of customerFacing) {
    assert.strictEqual(
      C.INTENT_PERMISSION_REQUIRED[intent], undefined,
      intent + ' requires no permission and no caller identity'
    );
    assert.strictEqual(C.classifyRisk(intent), 'read_normal');
  }
});

test('the four missing v1.0 intents do not exist in the router', () => {
  // MUST BECOME: each of these classifies to its own intent.
  for (const intent of ['emergency_tow', 'complaint', 'service_request', 'identify_caller']) {
    assert.strictEqual(
      C.INTENT_KEYWORDS[intent], undefined,
      intent + ' is required by the v1.0 contract but is not implemented'
    );
  }
});
