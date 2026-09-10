# PHASE I — v1.0 Physical Acceptance Checklist

A test passes only with evidence: an execution ID, a recording, a data-table
row, or a screenshot. "The workflow activated" is not evidence. Offline tests
do not count toward these.

Rows marked **BLOCKED** cannot be attempted yet; the blocking item is named.

| # | Test | Method | Status today | Evidence |
| --- | --- | --- | --- | --- |
| T1 | Spanish customer asks truck status | real call, ES | ◐ **path proven, not by phone** | exec `1640` — `"El camión TRK-0002 está esperando piezas."` |
| T2 | English customer asks truck status | real call, EN | ◐ same | EN rendering verified in code + exec `1634` language detection |
| T3 | Unknown customer asks for protected status | real call | ❌ **FAIL** | exec `1640`: caller `+15559999999` received TRK-0002's plate, make/model and status. No identification exists. |
| T4 | Customer asks for an ETA that does not exist | real call | ✅ **PASS** | exec `1640` — `"Finalización estimada: no disponible."` No ETA invented. |
| T5 | Customer requests an appointment | real call | ❌ **BLOCKED** | no availability source exists; nothing can be honestly confirmed |
| T6 | Emergency roadside call | real call | ❌ **FAIL** | exec `1634` — "truck is on fire on the highway" → `truck_status` → *"I didn't quite catch what you need"* |
| T7 | Quote request without an existing price | real call | ◐ | never fabricates a price, but cannot capture the request either |
| T8 | Complaint requiring escalation | real call | ❌ **BLOCKED** | no complaint intent, no escalation mechanism |
| T9 | Vendor asks about an existing parts order | real call | ◐ | `parts_status` by `part_id` works; no vendor context or routing |
| T10 | Vendor attempts an unauthorized purchase | real call | ✅ **PASS (structurally)** | live module has no write node; purchase is unrepresentable |
| T11 | Caller claims to be Luis without authenticating | real call | ✅ **PASS** | exec `1637` — got mock text, bridge blocked it as `unclassified_intent`, no owner data returned |
| T12 | Authoritative data source unavailable | fault injection | ✅ **PASS (observed live)** | exec `1631`/`1633` — genuine Google 503 → generic `tool_error` → handoff, no detail leaked. Since 2026-09-10 the read also retries 3× before failing (exec `1662`). |
| T13 | Human handoff | real call | ❌ **FAIL** | the sentence is spoken; no human is notified, no case created |
| T14 | Conversation is logged and auditable | inspect `panchita_audit_log` | ◐ | every path writes a row; no `caller_phone`, no case ref, `duration_ms` hardcoded 0 on module paths |
| T15 | No cross-customer information leakage | adversarial call | ❌ **FAIL** | same as T3 — `truck_id` is a bearer token; enumeration is unguarded |

**Score: 4 pass, 5 partial, 6 fail/blocked.** No test has yet been performed
over a real phone call, because no real call has ever reached the bridge.

## Additional failure-behaviour tests (mission §9)

| Case | Expected | Today |
| --- | --- | --- |
| ShopMonkey unavailable | fail safe | n/a — never connected |
| GHL unavailable | fail safe | untested — no GHL integration to fail |
| Google Sheets unavailable | fail safe, generic error | ✅ observed (exec `1633`); now retries 3× first (exec `1662`) |
| n8n workflow failure | structured error, no internals | ✅ `Module Failure Handler` returns a fixed message |
| Gateway timeout | handoff | ✅ 8000ms timeout + `continueRegularOutput` → handoff |
| Unknown customer | not-found, no guess | ✅ `NotFoundError` (exec `1643`) — but wording says *"I didn't understand"*, which is misleading |
| Multiple matching customers | refuse to guess | ✅ `DataIntegrityError`, "refusing to guess" |
| Unknown vehicle | not-found | ✅ exec `1643` |
| Conflicting status | refuse | ✅ duplicate rows fail closed |
| Missing ETA | say so | ✅ exec `1640` |
| Missing estimate | say so | ✅ "No amount has been entered yet" |
| Permission denied | fail closed | ✅ registry-driven, `PermissionError` → `unauthorized` |
| Malformed input | validation error | ✅ non-object body handled |
| Prompt injection | ignored | ✅ **structurally immune on the read path** — classification is substring matching over a fixed keyword table; there is no LLM in the request path to inject into |
| Caller falsely claiming employee/owner | denied | ✅ exec `1637`; role is never read from the caller |

The failure behaviour is the strongest part of this system. The gaps are
overwhelmingly *missing capability*, not unsafe capability.

## What must be true before any of T1–T15 is attempted by phone

1. A real phone number routed to the bridge, and confirmation that GHL does
   not bypass it. **GHL must now also send the `x-panchita-key` header** — as of
   the 2026-09-10 hardening pass both webhooks reject unauthenticated requests,
   so a call without it fails closed.
2. ~~`ghl-caller-anonymous`'s `appointments.write` grant revoked.~~ ✅ **Done
   2026-09-10** (exec `1650`, verified by exec `1660`).
3. A production tenant that is not named `-test`.
4. Caller identification, or an explicit owner decision to accept ID-only
   lookups during a controlled pilot with known participants.
5. Emergency triage ahead of the keyword router.
