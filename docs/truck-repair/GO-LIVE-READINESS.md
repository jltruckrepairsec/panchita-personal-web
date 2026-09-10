# PHASE J — Go-Live Readiness, Rollback Points, Owner Actions

> **UPDATE 2026-09-10 — safety hardening pass applied.** Five approved fixes are
> live; see [HARDENING-2026-09-10.md](HARDENING-2026-09-10.md) for changes,
> version IDs, evidence and rollback. Status below is marked accordingly.
> **H1, H2, M1, M6 are CLOSED. C3 is downgraded to HIGH, not closed.** The
> go-live level is unchanged at LEVEL 1, because the hardening removed attack
> surface rather than adding the missing capability.

## Verdict: **LEVEL 1 — INTERNAL TEST ONLY**

Not Level 0: the architecture is real, the path works end to end, and the
safety properties are genuine rather than claimed. Not Level 2: a controlled
customer pilot requires that a customer's information be scoped to that
customer, and there is currently no caller identification of any kind.

### Level 2 criteria, scored

| Requirement for LEVEL 2 (controlled pilot) | Met? |
| --- | --- |
| Read-only data | ✅ live module has no write node |
| Human fallback | ❌ handoff is spoken, never delivered |
| No consequential autonomous writes | ✅ structurally impossible today |
| Customer-scoped information | ❌ any caller naming an ID gets the record |
| Real end-to-end call path | ❌ no call has ever arrived |
| Auditability | ◐ good, missing caller and case identity |

### Level 3 criteria, scored

| Requirement for LEVEL 3 (production) | Met? |
| --- | --- |
| Real end-to-end call path | ❌ |
| Authoritative shop data | ❌ Sheets with 2 synthetic trucks; ShopMonkey unconnected |
| Authorization | ❌ identification without authentication; public unauthenticated Core webhook |
| Human fallback | ❌ |
| Auditability | ◐ |
| Physical acceptance tests | ❌ 0 of 15 performed by phone |
| Rollback plan | ✅ documented below |
| No unresolved critical/high defect | ❌ 4 critical, 3 high |

---

## Defect register

### CRITICAL

| ID | Defect | Evidence |
| --- | --- | --- |
| C1 | **No emergency handling.** A life-safety call is classified as a status lookup and answered "I didn't quite catch what you need." | exec `1634` |
| C2 | **No caller identification.** `truck_id` acts as a bearer token; any caller gets any record. Cross-customer leakage is unguarded. | exec `1640` |
| ~~C3~~ → **HIGH** | ~~Core's webhook is public and unauthenticated.~~ **Partly fixed 2026-09-10**: both webhooks now require a verified `x-panchita-key` (exec 1656 — a forged owner claim without the key is rejected before Core runs). Still HIGH: a key holder can assert any `user_id`, so this is a perimeter control, not per-identity authentication. | exec `1656` |
| C4 | **Handoff is theatre.** `human_handoff: true` notifies nobody and records no case. | code inspection, all handoff paths |

### HIGH

| ID | Defect | Evidence |
| --- | --- | --- |
| ~~H1~~ **CLOSED** | ~~`ghl-caller-anonymous` holds `appointments.write`.~~ Revoked 2026-09-10; `permissions` is now empty. | exec `1650`, `1660` |
| ~~H2~~ **CLOSED** | ~~Unpublished draft would open a real production-spreadsheet write path.~~ Draft restored to the published version 2026-09-10; the write path now exists only in version history, and draft == active on all three production workflows. | version `bc456f21` |
| H3 | No `session_id` from the bridge → new session per utterance, no memory, **language can flip mid-call**. | execs `1631`/`1634`/`1637`/`1640` |

### MEDIUM

| ID | Defect |
| --- | --- |
| ~~M1~~ **CLOSED** | ~~No retry on any Google Sheets node.~~ `retryOnFail` 3 tries / 1000ms added 2026-09-10; proven by controlled experiment (exec `1662`: 235ms → 2652ms), fail-closed path unchanged. |
| M2 | `business_summary` has no permission gate and is reachable by anonymous callers (mock data today, real data later = leak). |
| M3 | Not-found is spoken as *"I didn't understand you"*, which misleads the caller and the human who picks up. |
| M4 | Every registry row is the `-test` tenant; the live phone path is hardcoded to it. |
| M5 | `Trucks` sheet contains its own header row as a data row. |
| ~~M6~~ **CLOSED** | ~~Stale active front door `Panchita Core v0.1 (POC)`.~~ Deactivated 2026-09-10; `activeVersionId: null`. |
| M7 | Bridge discards Core's richer "what remains" sentence, so the required communication rule is only partly delivered by voice. |

---

## Rollback points (recorded 2026-09-10, before any change)

No production workflow was modified during this audit. These are the versions
to restore to:

| Workflow | ID | Restore to version |
| --- | --- | --- |
| Panchita GHL Voice Bridge v0.1 | `MS43EWU5Xl6JyaSZ` | `43e9d6d9-1a90-40e1-b905-c73f215c0fca` |
| Panchita Core v0.2 | `nMSfr0OE42rpPYgE` | `699407ef-4a67-4ebe-9295-50d987fb1867` |
| JL Truck Repair Module v0.1 | `xxXqlnG4PPxTqbO5` | **active** `8c36e555-bfd1-42ec-944e-ec8cf9d02d6a` (do **not** publish draft `e5cd2399-883e-4d6c-a248-6a59fe9debca`) |

Data-table rollback: `panchita_tenant_registry` currently holds exactly the 5
rows listed in the Phase A audit. Restoring that table to those 5 rows restores
the authorization state as audited.

Rollback for the repository changes in this branch: they are documentation and
offline tests only — `git revert` is sufficient and touches no running system.

---

## Recommended order of work

**Stop-the-bleeding — ✅ COMPLETED 2026-09-10 (items 1–5).**

1. Revoke `appointments.write` from `ghl-caller-anonymous` (H1) — one cell.
2. Add HTTP header auth to `panchita-core-v02` and the bridge (C3).
3. Deactivate `Panchita Core v0.1 (POC)` (M6).
4. Discard or clearly quarantine the module's write draft (H2).
5. Add retry to the Sheets nodes (M1); gate `business_summary` (M2).

**Then, in dependency order:**

6. Emergency triage ahead of the router (C1) — no new integration needed.
7. A real escalation sink + case record (C4).
8. Caller identification (C2) — needs an authoritative customer source.
9. ShopMonkey read-only connection — needs credentials from Luis.
10. Forward `session_id` from the bridge; pin language to the session (H3).

Items 1–7 need no external account and no new credential. Items 8–9 are
blocked on Luis.

---

## OWNER ACTION REQUIRED

Blocked on Luis, in priority order. One at a time, per the interruption policy.

**#1 — ShopMonkey API access.** Phase C could not start: there is no
ShopMonkey credential, no ShopMonkey node type in this n8n instance, and no
workflow referencing it. The *"Edit Completion for Labor Items"* permission
issue **could not be re-tested** and its status is UNKNOWN, not resolved. Needed:
an API key or OAuth client for a ShopMonkey role scoped to **read-only** —
customers, vehicles, repair orders, statuses, estimates/invoices, notes. If
ShopMonkey cannot issue a read-only role without also granting write, stop and
report the exact permission rather than granting the broader role.

**#2 — GoHighLevel account access.** Cannot be inspected from n8n: no GHL
credential or node exists. Unknown: which numbers exist, which voice agent
answers, bilingual configuration, transfer behaviour, calendars, SMS status,
and critically **whether an inbound call currently reaches this bridge at all
or bypasses it**. No real call has ever hit the bridge (63 executions, all
synthetic, none since 2026-09-08).

**#3 — Escalation targets.** Which role receives each escalation class, and by
what channel. Roles, not personal contact details, in any file.

**#4 — A pilot decision.** Caller identification (C2) is the gate to Level 2.
Either it is built against an authoritative customer source, or you accept
ID-only lookups for a closed pilot with participants you personally know. That
is a business decision with two legitimate answers; it is not mine to make.

---

## EXACT NEXT STEP

Grant read-only ShopMonkey API access (**#1**). It unblocks Phase C, the
source-of-truth matrix's entire first column, and caller identification — the
single defect standing between LEVEL 1 and LEVEL 2. Everything in
"stop-the-bleeding" can proceed in parallel and needs nothing from you but
approval to change the four workflow settings named above.
