# Now

> **Status:** sourced — derived from open work in the repository.
> **Lifecycle:** PLANNING
> **Basis:** `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

---

## N1 — Resolve the two open hardware failures *(owned elsewhere)*

**Not this vault's work.** Recorded here because everything else about the voice
path waits on it.

Hardware testing has run. Two failures are open against the deployed prototype:

| # | Finding |
| --- | --- |
| H-1 | A natural conversational pause still causes premature submission |
| H-2 | Repeated audible clicks while listening, both Luis and Panchita silent |

Another session is diagnosing both. Detail:
[06 · Physical Tests](../06-testing/physical-tests.md).

**The vault's only job here** is to keep recording findings and to refrain from
documenting the implementation as settled. When that session reports, the vault
owes: a restatement of
[D1](../07-change-history/deprecated.md#d1--the-fixed-silence-timer-silencems--3500),
a resolution of
[ADR-005](../07-change-history/architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer),
and an entry in [05 · Research](../05-knowledge/research.md) for whatever causes
H-2.

**Done when:** H-1 and H-2 have recorded outcomes in
[06 · Test Results](../06-testing/test-results.md).

---

## N2 — Record the n8n plan and the LLM model behind the Gateway

**Unblocks:** [08 · Budgets](../08-cost-and-quality/budgets.md), the free-versus-paid
voice question, and any statement about what Panchita costs.

Two lookups. Everything in section 08 with a number in it is waiting on them,
and the system currently cannot answer "what does a turn cost?" at all.

**Done when:** [08 · Provider Costs](../08-cost-and-quality/provider-costs.md)
has real figures in its second table.

---

## N3 — Confirm the Gateway's actual rate limit

**From:** [INC-001](../04-security/incident-history.md) follow-ups.

The rate limiter is the only thing that stopped the self-echo loop, and it was
never designed to be a safety mechanism. Nobody knows its threshold or window,
so nobody knows whether a slower loop would be caught at all.

**Done when:** the limit is written into
[01 · Gateway](../01-live-systems/gateway.md), with a note on whether a
self-driven loop below it would be detected.
