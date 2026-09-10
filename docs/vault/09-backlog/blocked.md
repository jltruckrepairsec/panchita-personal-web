# Blocked

> **Status:** sourced — each blocker names its cause.
> **Lifecycle:** PLANNING
> **Basis:** `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

---

## B1 — Voice v2 treated as a settled voice path

**Blocked by:** two unresolved hardware failures.

Not blocked on a merge — `voice-v2.html` is already on `main` and deployed for
phone testing, deliberately. What is blocked is calling the voice path finished,
recording an architecture decision for it, or letting it near `index.html`.

74 offline tests pass on `main` and two failures reproduce on Luis's phone:

| # | Finding | Status |
| --- | --- | --- |
| H-1 | A natural conversational pause still causes premature submission | OPEN |
| H-2 | Repeated audible clicks while listening, both parties silent | OPEN |

Both are under diagnosis in another session. Detail:
[06 · Physical Tests](../06-testing/physical-tests.md).

**Consequences held open by this:** [ADR-005](../07-change-history/architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer) stays *under review*, D1 stays
*under review*, and no ADR-007 is written.

**Unblocked by:** that session reporting. Not by anything in this vault, and not
by tuning a constant — PT-1 has now failed against two different mechanisms.

---

## B2 — Everything in section 08 with a number in it

**Blocked by:** unknown provider costs.

Budgets cannot be set, alerts cannot be thresholded, and the free-versus-paid
voice question cannot be answered, because nobody has recorded what the n8n plan
or the LLM behind the Gateway costs.

**Unblocked by:** [N2](now.md#n2--record-the-n8n-plan-and-the-llm-model-behind-the-gateway) — two lookups.

---

## B0 — Truck Repair v1.0 has no scope

**Blocked by:** no definition of done.

[Truck Repair v1.0 is the current execution priority](../00-master-blueprint/execution-priority.md),
and nothing in this vault says what v1.0 contains.
[03 · Truck Repair](../03-business-domains/truck-repair.md) is a concept page,
[01 · JL Truck Repair](../01-live-systems/jl-truck-repair.md) is a stub, and the
module contract it depends on is undocumented.

So the highest-priority work in the project is the least specified. **Scoping it
is an owner decision**, not something the vault can derive — the external
Shopmonkey and quoting skills describe how the work is done today, but not which
part Panchita is meant to take over first.

**Unblocked by:** the owner naming what v1.0 must do.

---

## B3 — All of section 03 (Business Domains)

**Blocked by:** no module contract.

The browser never names a module and never routes, so this repository cannot see
any of them. Seven module pages are stubs for one reason.

**Unblocked by:** [L-2](later.md#l-2--the-module-contract), which in turn wants
[X2](next.md#x2--write-the-gateway-contract) first.

---

## B4 — Financial and Recruiter modules

**Blocked by:** no permissions model, no audit trail.

Financial touches money; Recruiter holds personal data about people who are not
the owner. Both need enforcement and a record before they exist, and the system
currently has a binary signed-in/not model and no audit at all.

**Unblocked by:** [L-4](later.md#l-4--permissions-model) and
[X4](next.md#x4--minimum-audit-trail-authentication-events).

---

## B5 — Central, and the architecture map

**Blocked by:** an unanswered question, not by work.

Nothing in this repository references Central. Whether it owns identity and
memory, sits behind the Gateway, or is aspirational and mis-filed under Live
Systems is unknown, and one sentence from Luis would resolve it.

**Unblocked by:** an answer. See [L-1](later.md#l-1--define-central-and-draw-it-on-the-architecture-map).

---

## B6 — Builder

**Blocked by:** the concept is undefined.

Not blocked on effort — blocked on knowing what it is. Nothing should be built
against the name until someone says whether it is a tool Luis uses or something
Panchita does on her own.

**Unblocked by:** a definition. See [L-10](later.md#l-10--define-builder).
