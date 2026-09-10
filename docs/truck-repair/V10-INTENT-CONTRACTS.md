# PHASE E — v1.0 Intent Contracts vs. what is implemented

The ten shop functions the v1.0 brief requires, scored against the live system.

Status: ✅ implemented · ◐ partial · ⛔ absent

| # | v1.0 function | Status | Evidence / gap |
| --- | --- | --- | --- |
| 1 | Inbound customer call | ◐ | Bridge accepts a GHL-shaped POST and works (exec `1640`). No real call has ever arrived; GHL routing unverified. |
| 2 | Spanish + English, sticky | ◐ | Both languages render correctly. **Not sticky**: bridge sends no `session_id`, so language is re-detected per utterance from a 12-keyword list and can flip mid-call. |
| 3 | Customer / vehicle identification | ⛔ | `caller_phone` is captured and discarded. Lookup is by raw `truck_id` with no ownership check. Any caller who names an ID gets that record (exec `1640`, caller `+15559999999`). |
| 4 | Truck status | ✅ | Correct. The 8 approved stages are implemented verbatim (`received` … `delivered`), "what remains" is derived from stage order, and **no ETA is ever invented** — absent estimates render as "no disponible". |
| 5 | Appointments | ◐ | Read + dry-run reschedule only. **No availability source exists**, so no appointment can be honestly confirmed. No create path. |
| 6 | Emergency / tow | ⛔ | **No intent.** "my truck is on fire on the highway" → `truck_status` → *"I didn't quite catch what you need"* (exec `1634`). No LEVEL 1–4, no location, no safety check, no escalation. |
| 7 | Quote / estimate request | ◐ | Can read an existing estimate. Cannot capture a *request* for one. Correctly never fabricates a price. |
| 8 | Complaints | ⛔ | No intent, no severity model, no capture, no escalation. |
| 9 | Parts / vendors | ◐ | Reads `part_id` status. Cannot distinguish existing order vs. new request vs. vendor message. Correctly cannot commit a purchase (no write path). |
| 10 | Human handoff | ◐ | `human_handoff: true` is returned on every unhappy path and the wording is safe. **But nothing happens** — no human is notified, no case is created, no context is packaged. It is a spoken sentence, not a handoff. |

## Contract for each intent that v1.0 must add

These are specifications, not implementations. Nothing below has been built —
several depend on decisions or credentials only Luis can supply.

### `emergency_tow` (new — highest priority)

```
Classify: LEVEL 1 immediate danger | LEVEL 2 stranded roadside
          LEVEL 3 movable failure  | LEVEL 4 non-emergency inquiry
Collect (minimum): location, occupants safe?, vehicle/truck, symptoms
Never: promise dispatch, give an arrival time, or ask a LEVEL 1 caller
       to stay on the line for a lookup
Always: LEVEL 1/2 -> immediate transfer to a human, before any data lookup
```

Classification must run **before** the keyword router, and must win. The
current failure is structural: the router matches `"truck"` before anything
else can look at the sentence.

### `identify_caller` (new — gates every customer-facing read)

```
Input:  caller_phone (from telephony, not from the caller's mouth)
Match:  authoritative customer record
Output: a customer scope; every subsequent read is filtered by it
Fail:   0 matches or >1 match -> human handoff, never a guess
```

Until this exists, no status intent can satisfy *"never expose another
customer's information."*

### `service_request` (quote / appointment request — capture, don't promise)

```
Collect: customer, vehicle, requested work, symptoms, urgency, preferred window
Output:  a case record + follow-up task for a human
Never:   quote a price, or confirm a time, unless an authoritative
         estimate/calendar returned one
```

### `complaint`

```
Capture facts verbatim. Classify severity (safety | payment | repeat repair |
conflict | other). Never admit liability. Safety/payment/repeat -> escalate.
```

### Changes to existing intents

| Intent | Required change |
| --- | --- |
| `truck_status`, `estimate_status`, `parts_status`, `appointment_status` | must require an identified caller scope, not just an ID |
| `customer_lookup` | should not be reachable from the phone at all |
| `business_summary` | **has no permission gate** and returns mock text today. If it is ever wired to real data, any anonymous caller reaches it. Gate it behind `financial_data` now. |
| `appointments_reschedule` | revoke `appointments.write` from `ghl-caller-anonymous` |
