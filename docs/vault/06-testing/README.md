# 06 — Testing

| Page | Status |
| --- | --- |
| [Test Plans](test-plans.md) | Partial — voice is planned, nothing else is |
| [Regression Tests](regression-tests.md) | Sourced — 61 tests, green |
| [Physical Tests](physical-tests.md) | Sourced — the one open blocker |
| [Test Results](test-results.md) | Sourced — run 2026-09-09 |

## Coverage in one line

`voice-v2.html` is thoroughly tested offline. `index.html` — the page that
actually serves production — has **no automated tests at all**. That asymmetry
is deliberate (the risky code got the tests) and is the largest known gap in the
project's testing.
