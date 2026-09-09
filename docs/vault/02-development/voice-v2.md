# Voice v2

> **Status:** sourced — code-complete against every failure reproduced so far,
> offline suite green, blocked on real-hardware validation.
> **Source:** `voice-v2.html`, `tests/` @ `ed568e6`
> **Last reviewed:** 2026-09-09

## Goal

Make voice a conversation instead of a series of button presses. Production
voice is push-to-talk: one tap, one turn. Voice v2 keeps the microphone open
across turns so one tap starts a whole conversation.

## Why it is a separate page

`voice-v2.html` is a self-contained prototype on an unmerged branch. GitHub
Pages serves `main`, so this file is never served to anyone
([C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment)).
`index.html` was not modified by any of this work.

The header of the file states it plainly:

> "PANCHITA VOICE v2 — FREE PROTOTYPE FOR PHONE TESTING. NOT PRODUCTION."

The interface is the production interface. The only visual addition is a
compact voice bar shown while a voice session is running.

## What changed from production

| # | Change | Why |
| --- | --- | --- |
| 1 | `SpeechRecognition.continuous = true` | The microphone stays open across turns |
| 2 | The fixed `SILENCE_MS = 3500` timer is **removed** | End-of-turn now comes from the recogniser's own endpointer, not a stopwatch |
| 3 | Mute / End voice session controls | An open microphone needs an off switch |
| 4 | Duplicate-final suppression and an echo guard | An open microphone must not re-submit the same words |
| 5 | Android turn assembly | One spoken turn must produce exactly one Gateway request |
| 6 | Stale callback protection | A replaced recogniser must not be able to submit |
| 7 | TTS lifecycle gate | Panchita's loudspeaker must not reach her own microphone |

Items 5–7 each came from a real failure on a real phone, not from design
review.

## The three hard problems, and their fixes

### Android cumulative finals (fix 5)

Android Chrome delivers one spoken turn as a burst of **cumulative** final
hypotheses:

```
"Panchita" → "Panchita quiero" → "Panchita quiero que" → …
```

Each one used to become its own Gateway request, so one sentence fired four
times and could trip the rate limiter. They are now coalesced locally: interim
hypotheses are dropped outright, and one finished turn produces exactly one
submission.

`FINAL_COALESCE_MS = 400` is the width of that burst **and nothing more**. The
source says so in three separate places because it is the single most
misreadable constant in the file:

> "It is provisional hardware-test scaffolding, it is not semantic end-of-turn,
> and it is not a reinstatement of the removed fixed silence timer."

Raising it to paper over a long pause would silently rebuild the timer that
change 2 deleted. See
[C5](../00-master-blueprint/constitution.md#c5--scaffolding-is-labelled-as-scaffolding).

### Stale recogniser callbacks (fix 6)

Aborted, replaced, muted or ended recognisers still fire queued events. Every
callback now returns immediately unless it belongs to the recogniser the
session currently owns. A stale callback can never submit.

### Self-echo (fix 7)

Reproduced on Luis's own Android phone: the loudspeaker fed straight back into
the open microphone, Panchita's answer was recognised as user speech, fragments
of it ("Claro", "Aquí", "dime") became user bubbles, she answered herself, and
the loop ran until the Gateway message limit.

**Root cause.** Submission was allowed at all times, and the only thing between
her loudspeaker and a Gateway turn was a *text similarity* test that ignored
any transcript shorter than six characters. Short fragments of her own speech
walked straight through.

**Fix.** Submission is gated on **lifecycle, not text**. From the moment
`speak()` is called until `speechSynthesis` reports silence and a tail has
elapsed, nothing the microphone hears may reach the turn assembler or the
Gateway — regardless of what it says. A garbled transcription of her audio is
contained as reliably as an exact one. When the gate opens the recogniser is
replaced, so audio captured during the gate is discarded with it.

This is the origin of
[C6](../00-master-blueprint/constitution.md#c6--safety-is-enforced-on-lifecycle-not-on-content).
Full write-up: [04 · Incident History](../04-security/incident-history.md).

## Tuning constants

All in `voice-v2.html`, lines 266–318.

| Constant | Value | Purpose |
| --- | --- | --- |
| `PAID_REALTIME_ENABLED` | `false` | Paid realtime voice, off |
| `RESTART_DELAY_MS` | 350 ms | Gap before reopening the recogniser |
| `IDLE_AUTO_END_MS` | 180 000 ms | 3 min of silence ends the session |
| `MAX_SESSION_MS` | 1 200 000 ms | 20 min hard session ceiling |
| `DUP_WINDOW_MS` | 15 000 ms | Identical final inside this window = duplicate |
| `ECHO_WINDOW_MS` | 9 000 ms | How long Panchita's words stay echo-suspect |
| `FINAL_COALESCE_MS` | 400 ms | Width of the cumulative-final burst — see above |
| `TTS_TAIL_MS` | 450 ms | Speaker tail / room reverb after she stops |
| `TTS_POLL_MS` | 150 ms | How often to re-check whether she is speaking |
| `TTS_MIN_HOLD_MS` | 700 ms | Covers the deferred `speak()` start-up |
| `TTS_GATE_MAX_MS` | 90 000 ms | Absolute ceiling — the gate can never wedge |
| `TURN_BREAKER_MAX` | 25 | Turns allowed inside the breaker window |
| `TURN_BREAKER_WINDOW_MS` | 20 000 ms | Breaker window |

`TTS_GATE_MAX_MS` and the turn breaker are the two "this can never run away"
ceilings, and each has a test named after that property
([C7](../00-master-blueprint/constitution.md#c7--a-gate-must-never-be-able-to-wedge-shut)).

## Testability design

The file carries explicit markers:

```
// ===== BEGIN PURE HELPERS (extracted verbatim by the offline test suite) ==
…
// ===== END PURE HELPERS ==================================================
```

The suite extracts that block *verbatim* and unit-tests it, and separately runs
the whole `<script>` body in a sandbox. The code under test is the code that
ships. Counters are read from the page's own diagnostic panel rather than from
private state, so the tests do not depend on internals that are free to change.

Details: [06 · Regression Tests](../06-testing/regression-tests.md).

## What is left

One thing, and it cannot be settled offline:

> "They do not prove the **long natural-pause** problem is solved …
> End-of-turn still comes from the recogniser's own endpointer. That behaviour
> can only be judged on real Android hardware." — `tests/README.md`

Removing the fixed silence timer means the recogniser decides when a turn ends.
Whether it waits out a real thinking pause mid-sentence is a property of
Android's endpointer, not of this code.

Exit criteria and the test protocol:
[06 · Physical Tests](../06-testing/physical-tests.md).

## Open questions

* Does Voice v2 replace `index.html`'s voice path outright on merge, or ship
  behind a toggle for one test cycle?
* Once merged, does `voice-v2.html` stay as a test harness target or get
  deleted? The test suite points at it by path.
* `PAID_REALTIME_ENABLED` is dead code while `false` — is paid realtime a real
  plan or a placeholder?
