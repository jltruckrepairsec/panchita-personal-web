# PHASE B — Source-of-Truth Matrix

Two columns matter most and are the ones people get wrong: **AUTHORITATIVE
SOURCE** is where the fact legitimately lives, and **READ PATH TODAY** is where
Panchita actually gets it right now. Where those disagree, the row is a defect,
not a design.

Legend: ⛔ none/blocked · ⚠️ present but not authoritative · ✅ sound

| Fact | Authoritative source | Read path today | Write path today | Who may write | Fallback | Audit |
| --- | --- | --- | --- | --- | --- | --- |
| Customer identity | ShopMonkey (⛔ not connected) | ⛔ none — caller is never identified | none | shop staff in ShopMonkey | human handoff | required, missing |
| Caller phone → customer | ShopMonkey / GHL (⛔) | ⛔ `caller_phone` is captured then discarded | none | — | human handoff | required, missing |
| Vehicle / truck | ShopMonkey (⛔) | ⚠️ Sheets `Trucks`, keyed by `truck_id` only | none (live) | shop staff in Sheets | human handoff | ✅ audit row written |
| Repair order | ShopMonkey (⛔) | ⛔ no RO concept exists | none | — | human handoff | — |
| Repair status / stage | ShopMonkey (⛔) | ⚠️ Sheets `Trucks.status` | none (live) | shop staff in Sheets | human handoff | ✅ |
| Technician notes | ShopMonkey (⛔) | ⛔ not read | none | — | human handoff | — |
| Parts status | ShopMonkey / vendor (⛔) | ⚠️ Sheets `Parts`, keyed by `part_id` | none (live) | shop staff in Sheets | human handoff | ✅ |
| Appointment availability | a real calendar (⛔ none exists) | ⛔ none — cannot confirm availability | none | — | **must** create follow-up | — |
| Appointment record | ShopMonkey / GHL calendar (⛔) | ⚠️ Sheets `Appointments`, read + dry-run only | dry-run only; real write **unpublished** | owner, after approval | human handoff | ✅ + `panchita_write_audit` |
| Estimate / quote | ShopMonkey (⛔) | ⚠️ Sheets `Estimates` (read of existing only) | none | shop staff | human handoff | ✅ |
| Invoice / payment | ShopMonkey (⛔) | ⛔ not read | none | — | human handoff | — |
| Tow / emergency | dispatch process (⛔ none) | ⛔ **no intent exists** | none | — | **must** reach a human immediately | required, missing |
| Complaint | internal process (⛔ none) | ⛔ no intent exists | none | — | human handoff | required, missing |
| Internal follow-up / case | ⛔ nothing | ⛔ nothing | none | — | — | required, missing |
| Authorization grants | `panchita_tenant_registry` | ✅ Core reads it, never trusts client | manual, n8n UI | owner | fail closed | ✅ |
| Session / conversation | `panchita_sessions` | ⚠️ written, but never reused (no `session_id` from bridge) | Core, pre-auth | anyone (unauthenticated) | — | partial |
| Audit trail | `panchita_audit_log` | ✅ every path writes a row | Core + module | system | — | ✅ |

## Reading of the matrix

**The preferred architecture in the mission brief is the right one, and the
system does not yet implement it.** ShopMonkey is supposed to be operational
truth; it is not connected at all. Google Sheets — which the brief designates
as *"temporary/supporting data only where no stronger authoritative system
exists"* — is currently the authoritative source for every shop fact Panchita
can state. That is precisely the discrepancy the brief asked to have reported
rather than papered over.

Where the current systems genuinely match the target model:

* **n8n is orchestration, not truth.** Correct. No business fact originates in
  a workflow; Core computes routing and authorization only.
* **Panchita is a reasoning/orchestration layer, not a source of truth.**
  Correct, and enforced structurally: the module can only echo a Sheets row or
  fail. It has no generative step that could invent a fact.
* **The registry is server-side truth for authorization.** Correct and well
  implemented — client-supplied `role`/`permissions` are read nowhere.

Where they contradict it:

* **Sheets is load-bearing.** Five tabs are standing in for a shop management
  system, holding two synthetic trucks.
* **GHL holds no data in this stack at all** — not contacts, not calendars,
  not conversations. It is, at most, a phone number pointed at a webhook.
* **There is no source of truth for availability, tow, complaints or cases.**
  These are not "not integrated"; they do not exist as concepts anywhere in the
  system. Four of the ten v1.0 shop functions have no data layer to sit on.

## The rule this matrix implies for v1.0

Panchita may state a fact to a customer **only** when it came from a row she
actually read, in a tab that exists, matched by an identifier the caller
proved they are entitled to. Today the third clause has no implementation, so
the honest v1.0 scope is: *read-only, on data the caller has already
identified by ID, with a human fallback on everything else.*
