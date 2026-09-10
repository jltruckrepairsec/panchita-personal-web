# Quality Standards

> **Status:** sourced — every standard below is derived from what the code and
> tests already do, not from an aspiration.
> **Lifecycle:** GOVERNING
> **Basis:** `ed568e6`
> **Last reviewed:** 2026-09-10

## Q1 — A bug is closed by a test that fails without the fix

Not by a fix. Both Voice v2 fixes were verified against the pre-fix page and the
failure output recorded: `expected 1 submission, got 4`, `fragment "Claro"
reached Gateway`. A test that has never been seen to fail has not been shown to
test anything.

## Q2 — Test the artefact that ships

The suite extracts the real `<script>` body from the page and runs it. Nothing
is re-implemented, so a regression in the page is a failing test rather than a
green test against a stale copy.

## Q3 — Assert on observable surfaces, not internals

Counters come from the page's own diagnostic panel. Internals can be refactored
without rewriting tests, and the assertion surface is one a human can also read
from a phone.

## Q4 — Tests take no dependencies and touch no network

`node --test tests/*.test.js`, and nothing else. No install step, no keys, no
endpoints in test code. A suite anyone can run in five seconds gets run; one
needing setup does not.

## Q5 — Timing is asserted, not waited on

The harness runs a fully controllable fake clock, so timing behaviour is tested
deterministically. There is not one `sleep` in the suite, and the whole of it
runs in under a second — counts in
[06 · Regression Tests](../06-testing/regression-tests.md).

## Q6 — Every ceiling has a test named after it

`TTS_GATE_MAX_MS` has "the gate never wedges shut when TTS never reports an
end". The turn breaker has its flood tests. A limit nobody tests is a limit
nobody knows works.

## Q7 — Error messages name the actual cause

The `notSupported` voice message tells the owner that opening the link from
WhatsApp or Gmail is the problem and to use Chrome directly. A generic message
would send him to check settings that are fine.

## Q8 — Instrument what is otherwise invisible

The diagnostic panel exists because voice failures on Android cannot be seen
from a phone. It then became the test surface — instrumentation built for
debugging paid off twice.

## Q9 — Provisional code says so, in the code

`FINAL_COALESCE_MS` stated what it was and what it must not be mistaken for, and
a test asserted the statement. Where a value could be misread as something
structural, the source has to say what it is not.

The standard outlived the constant, which has since been removed. It is worth
re-checking against whatever governs end-of-turn now, once that work settles —
[02 · Voice v2](../02-development/voice-v2.md#current-state--active-development-do-not-treat-as-settled).

## Q10 — A guarantee in a commit message is a guarantee

"production interface unchanged" (`070bda9`) was true, and the isolation that
made it true was structural — a separate file on an unserved branch, not
carefulness.

---

## Where these standards are not met

Honesty requires naming it: **production `index.html` meets none of Q1–Q6**,
because it has no tests at all. Every standard on this page was developed on the
prototype. The page that actually serves the owner is the untested one.

See [06 · Test Plans](../06-testing/test-plans.md#indexhtml--no-plan-exists).
