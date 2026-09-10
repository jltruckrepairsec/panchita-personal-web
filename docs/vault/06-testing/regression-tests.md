# Regression Tests

> **Status:** sourced — 61 tests verified at `ed568e6`. `origin/main` carries
> **74** and is under active development.
> **Source:** `tests/` @ `ed568e6`
> **Lifecycle:** CURRENT TEST
> **Basis:** `ed568e6` (61 tests, verified here). `origin/main` @ `149d94e` carries 74 — see *Current state*
> **Last reviewed:** 2026-09-10

> **Canonical page** for suite composition and test counts. Other pages link
> here rather than restating numbers.

## Run

```sh
node --test tests/*.test.js
```

No dependencies, no install step, no network.

## Scope

The suite covers **only** `voice-v2.html`. `index.html` is not imported, not
loaded and not touched by anything in it.

### Composition at `ed568e6` (this vault's basis)

| File | Tests | Covers |
| --- | --- | --- |
| `voice-v2-helpers.test.js` | 14 | The `BEGIN/END PURE HELPERS` block, extracted verbatim |
| `voice-v2-turn-assembly.test.js` | 25 | Android turn assembly, and the behaviour it must not break |
| `voice-v2-self-echo.test.js` | 22 | The reproduced Android loudspeaker feedback loop |
| **Total** | **61** | |

### Current state on `main`

`origin/main` @ `149d94e` carries **74 tests, all passing** — the 61 above plus
13 in a new `voice-v2-turn-taking.test.js`. Verified read-only; the file itself
is not documented here because the work it covers is unfinished
([02 · Voice v2](../02-development/voice-v2.md#current-state--active-development-do-not-treat-as-settled)).

## How it works

`tests/harness.js` reads `voice-v2.html`, pulls the real `<script>` body out of
it, and runs that in a `vm` sandbox behind:

* a minimal DOM,
* a scriptable `SpeechRecognition` — tests drive interim and final results
  directly,
* a fully controllable fake clock, so timing is asserted rather than waited on,
* a stubbed network.

The helper tests use a second extraction, taking the block between the
`// ===== BEGIN PURE HELPERS` and `// ===== END PURE HELPERS` markers verbatim.

Two design choices matter:

* **The code under test is the code that ships.** Nothing is re-implemented, so
  a regression in the page is a failing test here
  ([C8](../00-master-blueprint/constitution.md#c8--the-test-runs-the-shipped-code)).
* **Assertions read the page's own diagnostic panel**, not private state, so
  internals can be refactored without rewriting tests.

## The gates held — turn assembly

| Gate | Test |
| --- | --- |
| Interim hypotheses reach the Gateway 0 times | "interim hypotheses produce zero Gateway submissions" |
| One utterance's cumulative finals = exactly 1 submission | "a cumulative final burst produces exactly one Gateway submission" |
| Stale recogniser callbacks submit 0 times | the four "stale" / "replaced" tests |
| No rate-limit flood | "a long dictation…", "three real turns…" |
| Mute / End voice discard buffered speech | "mute discards…", "End voice discards…" |
| Continuous listening survives a completed turn | "the microphone is still listening after a full turn completes" |
| Barge-in, echo guard, dedupe, text fallback intact | the remaining tests |
| Auth boundaries unchanged | "the login handshake payload is unchanged", "an expired session still forces re-login…", "voice cannot start without a session" |
| The coalesce window stays labelled provisional | "the coalesce window is declared provisional and not an end-of-turn timer" |

That last one is unusual and worth noting: it is a test on a *comment*. It
existed so that nobody could quietly repurpose `FINAL_COALESCE_MS` into the
end-of-turn timer the design removed — the guard rail was asserted, not just
written. See [L8](../05-knowledge/lessons-learned.md#l8--label-provisional-code-in-the-code).

(That constant was later removed outright rather than repurposed, so the test's
subject is gone. Whether an equivalent guard rail now covers its replacement is
not established here — the work is unfinished.)

## The gates held — self-echo

| Gate | Test |
| --- | --- |
| Her TTS fed back = 0 Gateway submissions | "REPRO: Panchita's own TTS fed back into the mic…" |
| The short fragments that actually leaked (`Claro`, `Aquí`, `dime`) | "REPRO: the short fragments that actually got through…" |
| A garbled transcription of her audio is contained too | "REPRO: a mis-transcription of her audio…" |
| No runaway loop | "REPRO: the runaway loop cannot start — 10 rounds…" |
| No rate-limit flood | "self-echo cannot flood Gateway: 14 distinct fragments…" |
| Nothing submits while the loudspeaker is live | "nothing at all can be submitted while the loudspeaker is live" |
| Intentional barge-in still works | "Luis can still interrupt Panchita intentionally" |
| She never interrupts herself | "she never interrupts herself…" |
| Recognition resumes safely after TTS | "the gate opens once she is silent…", "voice survives Android refusing the first `start()`…" |
| The gate cannot wedge shut | "the gate never wedges shut when TTS never reports an end" |
| Stale events during/after TTS submit nothing | "the recogniser that was live during TTS cannot submit after the reset" |
| Mute / End voice during TTS | the two "during TTS" tests |

Both groups were verified against the pre-fix page —
see [Test Results](test-results.md).

## What the suite does not prove

**Anything that lives in real audio.** As of `149d94e` the suite's own README
puts it as "they model an engine, not a room": pause tolerance, how promptly
barge-in feels, and audible artefacts are properties of a real phone in a real
room.

This is not hypothetical. 74 offline tests pass on `main` while **two failures
reproduce on Luis's Android phone** — a natural pause still submits early, and
there are repeated audible clicks while listening. Neither has offline coverage.
See [Physical Tests](physical-tests.md).

## Gap

Production `index.html` has no tests. See
[Test Plans](test-plans.md#indexhtml--no-plan-exists).
