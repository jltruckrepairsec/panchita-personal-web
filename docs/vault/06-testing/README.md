# 06 — Testing

> **Status:** section index.
> **Lifecycle:** VAULT INDEX
> **Last reviewed:** 2026-09-10

| Page | Status |
| --- | --- |
| [Test Plans](test-plans.md) | Partial — voice is planned, nothing else is |
| [Regression Tests](regression-tests.md) | Sourced — 61 verified at `ed568e6`; 74 on `main` |
| [Physical Tests](physical-tests.md) | Sourced — **two unresolved hardware failures** |
| [Test Results](test-results.md) | Sourced — offline green; hardware failing |

## Coverage in one line

`voice-v2.html` is thoroughly tested offline. `index.html` — the page that
actually serves production — has **no automated tests at all**. That asymmetry
is deliberate (the risky code got the tests) and is the largest known gap in the
project's testing.

## And one line on what offline coverage is worth here

74 offline tests pass on `main` while two failures reproduce on a real phone.
The suite models an engine, not a room: pause tolerance and audible artefacts
live in real audio. Offline green is necessary and not sufficient — see
[Physical Tests](physical-tests.md).
