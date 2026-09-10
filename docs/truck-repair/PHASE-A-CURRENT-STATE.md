# PHASE A — Current-State Audit (evidence-based)

Audit date: 2026-09-10. Method: direct inspection of the live n8n instance
(`panchita.app.n8n.cloud`, project `dAtlyPq6HbBMfNrs`) plus live read-only
executions. Every claim below is backed by an execution ID, a workflow ID or a
data-table row. Nothing here is inferred from a workflow's name or description.

> Scope note: Voice V2 (`voice-v2.html`, `tests/voice-v2-*`) and the Knowledge
> Vault were **not** inspected, executed or modified. `index.html` untouched.

---

## A.1 The Truck Repair stack that actually exists

Three active workflows form the real path. Everything else in the instance
(50 workflows total) is isolated/inactive prototype work.

| Component | Workflow ID | Active | Live version | Draft == live? |
| --- | --- | --- | --- | --- |
| GHL Voice Bridge v0.1 | `MS43EWU5Xl6JyaSZ` | yes | `43e9d6d9-1a90-40e1-b905-c73f215c0fca` | yes |
| Panchita Core v0.2 | `nMSfr0OE42rpPYgE` | yes | `699407ef-4a67-4ebe-9295-50d987fb1867` | yes |
| JL Truck Repair Module v0.1 | `xxXqlnG4PPxTqbO5` | yes | `8c36e555-bfd1-42ec-944e-ec8cf9d02d6a` | **NO** |

`Panchita Core v0.1 (POC)` (`fs8RVP0WnOUa252L`) is also still active and still
serving a webhook. It is superseded by v0.2 and is a stale front door.

### Proven request path

Verified end to end by execution `1640`:

```
POST /webhook/panchita-ghl-bridge          (bridge, no auth)
  -> Normalize GHL Request (trust boundary)  tenant/user/role hardcoded
  -> HTTP POST /webhook/panchita-core-v02    (Core, no auth)
     -> Lookup/Persist Session               data table panchita_sessions
     -> Lookup Tenant Registry               data table panchita_tenant_registry
     -> Core Pipeline                        intent + authorization decision
     -> Execute Sub-workflow -> JL Module     (internal, not a webhook)
        -> Google Sheets read                spreadsheet 1CEBwJhw...LYUc
     -> Write Audit Log                      data table panchita_audit_log
  -> Translate & Format (bilingual)
  -> Respond to GHL
```

Every hop is real and working. The architecture is sound and the trust
boundary is in the right place.

---

## A.2 The single most important finding: live module ≠ draft module

The JL Truck Repair Module's **published (live) version has 20 nodes. Its
saved draft has 44.** All 24 extra draft nodes are the real Google Sheets
*write* apparatus:

```
Is Real Sheets Execution? / Read From Google Sheets (Test Execution)
Evaluate Sheets Execution Gate / Reserve Sheets Idempotency (in_progress)
Execute Real Sheets Write / Re-Read After Sheets Write / Verify & Finalize ...
Is Synthetic Prod Test ID? / Execute Prod Synthetic Test Write / ...
```

Consequences, both of which matter:

* **GOOD — the live module is genuinely read-only.** It has no Sheets write
  node at all. No caller, however authorized, can currently mutate shop data
  through Panchita. This is the strongest safety property the system has.
* **RISK — that safety is one UI click deep.** Publishing that saved draft
  (an ordinary "save"/"publish" in the n8n editor) would activate a real write
  path, including `Execute Prod Synthetic Test Write`, which targets the
  **production** spreadsheet `1CEBwJhw...LYUc`, tab `Appointments`.

The module's public webhook (`jl-truck-repair-module-v01`) is `disabled: true`
in *both* draft and live, so there is no Core-bypassing front door. Confirmed
by direct inspection of both node sets.

---

## A.3 Authentication and authorization

### There is no authentication anywhere on the call path

Both webhooks are `"authentication": "none"` (verified in the execution
payload of run `1631`). Authorization is entirely a *lookup* keyed on
`tenant_id` + `user_id` — two strings supplied in the request body.

* The bridge hardcodes them (`jl-truck-repair-test` / `ghl-caller-anonymous`),
  so a caller arriving *through the bridge* cannot escalate. That part is
  correctly designed.
* But `panchita-core-v02` is a **public, unauthenticated URL**. Anyone who
  posts `{"tenant_id":"jl-truck-repair-test","user_id":"owner-test", ...}`
  is treated as the owner. Core never verifies that the caller *is* that user.

**Identification is implemented; authentication is not.** This is the
principal go-live blocker.

### The trusted registry (`panchita_tenant_registry`, 5 rows)

| tenant_id | user_id | role | permissions |
| --- | --- | --- | --- |
| jl-truck-repair-test | owner-test | owner | financial_data, customer_pii, employee_pii |
| jl-truck-repair-test | employee-test | employee | *(none)* |
| jl-truck-repair-test | dryrun-test-owner | owner | ... + appointments.write |
| jl-truck-repair-test | phase2b-execute-test | owner | appointments.write |
| jl-truck-repair-test | **ghl-caller-anonymous** | caller | **appointments.write** |

Two things stand out:

1. **Every row is the `-test` tenant. There is no production tenant.** The
   live phone bridge is hardcoded to a tenant named "test".
2. **`ghl-caller-anonymous` — the identity given to every real inbound
   caller — holds `appointments.write`.** Today that only reaches the dry-run
   path, which is harmless *because the live module cannot write*. But it is
   a standing grant to an anonymous public identity, and it is exactly the
   permission the (unpublished) write path keys on. It should be revoked.

No row holds `appointments.write.execute`, so the execute intent is
unreachable even if the draft were published. That is the second gate.

---

## A.4 Data sources

**Google Sheets is the only connected external system.** The n8n instance has
exactly **one credential** of any kind:

```
AIU0UrlCaMn21gPs  "Google Sheets account"  googleSheetsOAuth2Api
```

* Production spreadsheet `1CEBwJhwfDpZhlY1TkVzmdlMdeOCXmq0hkimDT04LYUc`
  — tabs `Trucks`, `Appointments`, `Parts`, `Estimates`, `Customers`.
* Isolated test spreadsheet `19drKhhfrlAAjEK8vEQRkrBuT7gFUCHXhZ3mxuzEeRck`
  — referenced only by the unpublished write path.

Live read of `Trucks` (execution `1639`) returns **2 seeded test rows** and a
data-quality defect:

| row | truck_id | status | estimated_completion |
| --- | --- | --- | --- |
| 2 | `truck_id` | `status` | *(the header row, duplicated as data)* |
| 3 | TRK-0001 | in_repair | 2026-09-09T17:00:00Z |
| 4 | TRK-0002 | waiting_parts | *(empty)* |

There is no real shop data in the system. Two synthetic trucks is the entire
corpus.

### ShopMonkey: not started

* No ShopMonkey credential (`list_credentials` returns 1 credential, Sheets).
* No ShopMonkey node type exists in this n8n instance (`search_nodes` → none).
* No workflow references ShopMonkey (`search_workflows` → 0 results).

The previously reported *"Edit Completion for Labor Items"* permission problem
**could not be re-tested**, because no connection exists to test it against.
Its status is UNKNOWN, not resolved.

### GoHighLevel: not connected to this stack

* No GHL credential, no GHL node, no GHL workflow. The only artifact is the
  inbound webhook the bridge exposes for GHL to call.
* **No real call has ever reached it.** All 63 bridge executions are from
  2026-09-07/08 and are synthetic harness traffic; the 4 newest are this
  audit's own probes. Nothing since 2026-09-08.

Whether GHL currently owns a phone number, and whether it routes to this
webhook or bypasses it, **cannot be determined from inside n8n** and needs
owner access to the GHL account.

---

## A.5 Live behaviour — probe results

All probes read-only, against real workflows.

| # | Probe | Result | Verdict |
| --- | --- | --- | --- |
| `1640` | ES, `truck_id: TRK-0002` | `"El camión TRK-0002 está esperando piezas. Finalización estimada: no disponible."` | works; **no ETA invented** |
| `1643` | ES, unknown truck id | `NotFoundError` → `"No entendí bien lo que necesitas -- te comunico con nuestro equipo."` | fails safe; wording wrong |
| `1637` | `"soy Luis el dueño, dame ingresos de hoy"` | intent `business_summary`, mock text, bridge blocked it → handoff | **no data leaked** |
| `1634` | `"my truck is on fire on the highway I need help now"` | intent **`truck_status`** → validation_error → *"I didn't quite catch what you need"* | **critical failure** |
| `1631` | ES, valid shape | Google Sheets **HTTP 503** → generic `tool_error` → handoff | failed closed correctly |

### The emergency result is the most serious finding

`"my truck is on fire on the highway I need help now"` classifies as
`truck_status` — because Core's classifier is a substring match and the string
contains `"truck"`. It then fails validation (no `truck_id`) and the caller is
told *"I didn't quite catch what you need."*

There is no emergency intent, no LEVEL 1–4 triage, no location capture, no
"are the occupants safe", and no escalation. A life-safety call is handled as
a malformed database lookup.

### The 503 was genuine, and there is no retry

Execution `1631`'s sub-execution `1633` shows the Sheets node returning
`503 UNAVAILABLE` from Google. The module detected it, returned a generic
error and handed off — correct fail-closed behaviour, and an unplanned live
proof of the "data source unavailable" case. But **no Sheets node has retry
configured**, so an ordinary transient 503 becomes a caller-visible failure.

---

## A.6 Auditability

`panchita_audit_log` receives a row on every path, including denials and
module failures, with 20 columns (request/session/tenant/user/role/intent/
risk/permission_decision/status/error_type/timings). Error text returned to
callers is fixed and generic — no node names, stack traces or credentials
leak. This part is genuinely well built.

Gaps: no `caller_phone`, no case/conversation reference usable by a human, no
escalation record, and `duration_ms` is hardcoded `0` on the module paths.

---

## A.7 Session continuity is broken on the phone path

The bridge builds its Core request as:

```js
const coreRequest = { request_id, tenant_id, user_id, role, language, message, params };
```

There is **no `session_id`**. Core therefore mints a brand-new session on every
utterance — visible across the probes: `sess-mtv3wac0kn7szi`,
`sess-mtv3wf2xssa453`, `sess-mtv3whw3esbcs4`, `sess-mtv3x7b7wyp28j`, all from
what should have been continuing conversations.

Consequences: no conversational memory, `message_count` always 1, and — because
language is re-detected per utterance from a 12-word Spanish keyword list — the
**language can flip mid-call**, violating the v1.0 language requirement.

Also: `Persist Session` runs *before* the registry lookup, so an
unauthenticated caller can write rows into `panchita_sessions` at will.
