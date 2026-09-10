# Panchita Truck Repair v1.0 — readiness documentation

Produced by the v1.0 implementation + go-live readiness audit, 2026-09-10.
Everything here is evidence-based: claims cite an n8n execution ID, workflow ID
or data-table row. Nothing was inferred from a workflow's name or description.

## Verdict

**LEVEL 1 — INTERNAL TEST ONLY.**

The architecture is real and the end-to-end path works. It is not a customer
pilot, because a customer's information is not scoped to that customer.

## Documents

| Document | What it answers |
| --- | --- |
| [PHASE-A-CURRENT-STATE.md](PHASE-A-CURRENT-STATE.md) | What exists, what runs, what is connected — with evidence |
| [SOURCE-OF-TRUTH-MATRIX.md](SOURCE-OF-TRUTH-MATRIX.md) | Where every shop fact legitimately lives vs. where Panchita reads it |
| [V10-INTENT-CONTRACTS.md](V10-INTENT-CONTRACTS.md) | The 10 v1.0 shop functions, scored; contracts for what is missing |
| [ESCALATION-MATRIX.md](ESCALATION-MATRIX.md) | Who receives what, and the handoff package |
| [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md) | T1–T15 physical checklist and failure-behaviour matrix |
| [GO-LIVE-READINESS.md](GO-LIVE-READINESS.md) | Defect register, rollback points, owner actions, next step |
| [HARDENING-2026-09-10.md](HARDENING-2026-09-10.md) | The five approved safety fixes: changes, version IDs, evidence, rollback |

Offline tests for the same logic: [`tests/truck-repair/`](../../tests/truck-repair/).

## The short version

**What works, and works well.** The trust boundary is in the right place: the
bridge hardcodes tenant/user/role, Core decides authorization from a
server-side registry and never reads a client-supplied role, and the module
refuses to act without a valid Core authorization object. Failure behaviour is
genuinely good — unknown records, duplicate records, missing ETAs, missing
prices and a real Google 503 all fail closed without leaking internals or
inventing data. The 8 approved repair stages are implemented exactly, and an
ETA is never fabricated. The read path is structurally immune to prompt
injection because there is no model in it.

**What is missing.** Four of the ten v1.0 shop functions have no
implementation at all: emergency/tow, complaints, service requests, and caller
identification. Human handoff is a spoken sentence that notifies nobody.

**Safety hardening applied 2026-09-10.** Five approved fixes are live: the
anonymous caller's write permission revoked, a verified key required on both
public webhooks, the stale Core v0.1 front door deactivated, the module's
production-spreadsheet write draft quarantined, and retry added to the Sheets
read. Details and rollback in [HARDENING-2026-09-10.md](HARDENING-2026-09-10.md).
The go-live level is unchanged — hardening removed attack surface, it did not
add the missing capability.

**The two findings that matter most** (as originally found; the second is now fixed).

1. **An emergency is answered as a database lookup.** "My truck is on fire on
   the highway" classifies as `truck_status` and the caller is told *"I didn't
   quite catch what you need."* (execution `1634`)
2. **The live module could not write, but its saved draft could.** The
   published module had 20 nodes; the draft had 44, and the extra 24 were a
   real Google Sheets write path aimed at the **production** spreadsheet — one
   "publish" click deep. **Fixed 2026-09-10**: the draft was restored to the
   published version, so that path now exists only in version history.

**What is blocked.** ShopMonkey has never been connected — no credential, no
node type, no workflow. GoHighLevel likewise. No real phone call has ever
reached the bridge: all 63 executions are synthetic, none since 2026-09-08.

## Scope discipline

Voice V2 and the Knowledge Vault were not inspected, executed or modified.
`index.html` and `voice-v2.html` are byte-identical; the 91 Voice V2 tests
still pass. No production n8n workflow, data table or spreadsheet was modified
by this audit — only read-only executions were performed.
