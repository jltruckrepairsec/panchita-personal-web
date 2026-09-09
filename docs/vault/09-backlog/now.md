# Now

> **Derived from:** repository state @ `ed568e6`
> **Last reviewed:** 2026-09-09

---

## N1 — Run the Voice v2 hardware test

**Blocks:** the Voice v2 merge, and therefore everything downstream of it.

Voice v2 is code-complete and its offline suite is green at 61/61. One question
remains, and it cannot be answered offline: does Android's endpointer tolerate a
long natural thinking pause mid-sentence?

Protocol, device requirements and pass criteria:
[06 · Physical Tests](../06-testing/physical-tests.md). PT-1 is the blocking
test; PT-2 through PT-8 confirm the offline results hold on real audio.

**If PT-1 fails:** do not raise `FINAL_COALESCE_MS`. That rebuilds the timer
ADR-005 deleted, and the test suite asserts the comment saying so. A failure is
a design question about end-of-turn.

**Done when:** PT-1 has a recorded result in
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
