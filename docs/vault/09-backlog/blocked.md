# Blocked

> Items that cannot proceed, each with the reason named and what would unblock
> it.
> **Last reviewed:** 2026-09-09

---

## B1 — Voice v2 merge

**Blocked by:** no hardware test result.

Code-complete, 61/61 offline tests green, and stuck. The offline suite states
its own limit: end-of-turn now comes from Android's endpointer, and whether that
endpointer tolerates a long natural pause "can only be judged on real Android
hardware".

**Unblocked by:** [N1](now.md#n1--run-the-voice-v2-hardware-test) — one session
on Luis's phone.

**Note:** this is blocked on an *action*, not on a decision or a dependency. It
is the cheapest blocker in the vault to clear.

---

## B2 — Everything in section 08 with a number in it

**Blocked by:** unknown provider costs.

Budgets cannot be set, alerts cannot be thresholded, and the free-versus-paid
voice question cannot be answered, because nobody has recorded what the n8n plan
or the LLM behind the Gateway costs.

**Unblocked by:** [N2](now.md#n2--record-the-n8n-plan-and-the-llm-model-behind-the-gateway) — two lookups.

---

## B3 — All of section 03 (Modules)

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
