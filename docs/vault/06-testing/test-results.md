# Test Results

> **Status:** sourced — offline suite green; **hardware testing has run and two
> failures are open.**
> **Lifecycle:** CURRENT TEST
> **Basis:** `ed568e6` verified; `149d94e` observed read-only
> **Last reviewed:** 2026-09-10

> **Canonical page** for test outcomes, offline and hardware. Other pages link
> here rather than restating results.

## Offline suite — 2026-09-09, commit `ed568e6` (this vault's basis)

```
node --test tests/*.test.js
```

| File | Pass | Fail |
| --- | --- | --- |
| `voice-v2-helpers.test.js` | 14 | 0 |
| `voice-v2-self-echo.test.js` | 22 | 0 |
| `voice-v2-turn-assembly.test.js` | 25 | 0 |
| **Total** | **61** | **0** |

Green.

## Offline suite — `origin/main` @ `149d94e`

Observed read-only on 2026-09-10:

| File | Pass | Fail |
| --- | --- | --- |
| `voice-v2-helpers.test.js` | 14 | 0 |
| `voice-v2-self-echo.test.js` | 22 | 0 |
| `voice-v2-turn-assembly.test.js` | 25 | 0 |
| `voice-v2-turn-taking.test.js` | 13 | 0 |
| **Total** | **74** | **0** |

Green, and **not sufficient** — see the hardware section below.

## Verification against the pre-fix pages

The number that matters is not that the tests pass — it is that they failed
before the fix. Both suites were run against the pre-fix page and the failures
recorded.

### Turn assembly, before `acfd1ec`

**15 of the gate tests fail**, including:

```
expected 1 submission, got 4
```

That is the reported Android behaviour reproduced exactly: one spoken sentence
producing four Gateway requests, from the burst of cumulative final hypotheses.

### Self-echo, before `ed568e6`

The reproduction fails, with:

```
fragment "Claro" reached Gateway
self-echo flooded Gateway with 5 extra turns
```

`Claro` is five characters, and the pre-fix echo guard exempted anything shorter
than six — so the guard was never consulted. See
[INC-001](../04-security/incident-history.md) and
[L2](../05-knowledge/lessons-learned.md#l2--an-exemption-inside-a-guard-is-a-hole-in-the-guard).

## Hardware suite — RUN, TWO FAILURES OPEN

Reported by the owner on **2026-09-10**, against the deployed prototype at or
after `149d94e`:

| # | Finding | Status |
| --- | --- | --- |
| H-1 | A natural conversational pause still causes premature submission | **OPEN** |
| H-2 | Repeated audible clicks while Voice v2 is listening, with both Luis and Panchita silent | **OPEN** |

H-1 is the failure this vault predicted could not be settled offline. H-2 is a
**new symptom class** — no offline test covers it, and nothing in
[05 · Research](../05-knowledge/research.md) anticipated it.

Both are being diagnosed in another session. This page records the findings, not
their fixes.

**The headline number:** 74 offline tests pass; 2 hardware failures reproduce.
Protocol: [Physical Tests](physical-tests.md).

## Production `index.html`

No automated test has ever been run against it. See
[Test Plans](test-plans.md#indexhtml--no-plan-exists).

## Recording a run

Date, commit, command, per-file pass/fail, and — for a fix — the failure output
from running the new tests against the code before the fix. A test that has
never been seen to fail has not been shown to test anything
([L7](../05-knowledge/lessons-learned.md#l7--verify-a-new-test-against-the-old-code)).
