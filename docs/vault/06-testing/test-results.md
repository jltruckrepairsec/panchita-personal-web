# Test Results

> **Status:** sourced — offline suite verified; hardware suite not yet run.
> **Last reviewed:** 2026-09-09

## Offline suite — 2026-09-09, commit `ed568e6`

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

## Hardware suite

**Not yet run.** No physical test result exists for any commit. Protocol and
pass criteria: [Physical Tests](physical-tests.md).

Voice v2 cannot merge until PT-1 has a result.

## Production `index.html`

No automated test has ever been run against it. See
[Test Plans](test-plans.md#indexhtml--no-plan-exists).

## Recording a run

Date, commit, command, per-file pass/fail, and — for a fix — the failure output
from running the new tests against the code before the fix. A test that has
never been seen to fail has not been shown to test anything
([L7](../05-knowledge/lessons-learned.md#l7--verify-a-new-test-against-the-old-code)).
