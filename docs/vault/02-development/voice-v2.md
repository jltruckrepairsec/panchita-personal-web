# Voice v2

> **Status:** sourced for the `ed568e6` state recorded below. **The
> implementation has since moved and is under active development** — see
> *Current state* before relying on any detail on this page.
> **Source:** `voice-v2.html`, `tests/` @ `ed568e6`
> **Lifecycle:** DEPLOYED PROTOTYPE · ACTIVE DEVELOPMENT · HARDWARE VERIFICATION PENDING
> **Basis:** `ed568e6` (last state this vault verified). `origin/main` is at `149d94e` and moving — see *Current state* below
> **Last reviewed:** 2026-09-10

> **Canonical page** for the Voice v2 record and its current lifecycle. Other
> pages link here rather than describing its implementation.

## Goal

Make voice a conversation instead of a series of button presses. Production
voice is push-to-talk: one tap, one turn. Voice v2 keeps the microphone open
across turns so one tap starts a whole conversation.

## Why it is a separate page

`voice-v2.html` is a self-contained prototype kept in its own file so that
`index.html` is never touched by voice experiments. That guarantee has held:
`index.html` is byte-identical to `b01eb18` on `origin/main` today.

The header of the file states its intent plainly:

> "PANCHITA VOICE v2 — FREE PROTOTYPE FOR PHONE TESTING. NOT PRODUCTION."

The interface is the production interface. The only visual addition is a
compact voice bar shown while a voice session is running.

### It is now deployed, and that is deliberate

`voice-v2.html` is on `main` and therefore publicly reachable through GitHub
Pages, so that Luis can load it on a real Android phone. **Deployed is not
production.** Its lifecycle is DEPLOYED PROTOTYPE · ACTIVE DEVELOPMENT ·
HARDWARE VERIFICATION PENDING; the official production voice experience
remains `index.html`
([01 · Panchita Personal](../01-live-systems/panchita-personal.md)).

Two stale statements survive inside the file's own header and should not be
read as current: that it "lives only on an unmerged branch", and its
description of `FINAL_COALESCE_MS`, a constant that no longer exists. The
vault quotes the header where it is still accurate and flags it where it is
not.

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

At `ed568e6`, `FINAL_COALESCE_MS = 400` was the width of that burst **and
nothing more**. The source said so in three separate places because it was the
single most misreadable constant in the file:

> "It is provisional hardware-test scaffolding, it is not semantic end-of-turn,
> and it is not a reinstatement of the removed fixed silence timer."

Raising it to paper over a long pause would have silently rebuilt the timer that
change 2 deleted. See
[C5](../00-master-blueprint/constitution.md#c5--scaffolding-is-labelled-as-scaffolding).
The constant has since been removed rather than raised — *Current state* below.

### Stale recogniser callbacks (fix 6)

Aborted, replaced, muted or ended recognisers still fire queued events. Every
callback now returns immediately unless it belongs to the recogniser the
session currently owns. A stale callback can never submit.

### Self-echo (fix 7)

Reproduced on Luis's own Android phone: the loudspeaker fed straight back into
the open microphone, Panchita's answer was recognised as user speech, fragments
of it ("Claro", "Aquí", "dime") became user bubbles, she answered herself, and
the loop ran until the Gateway message limit.

**Fix.** Submission is gated on **lifecycle, not text**: from `speak()` until
`speechSynthesis` reports silence plus a tail, nothing the microphone hears may
reach the turn assembler or the Gateway, regardless of what it says.

Root cause, the leaked fragments, the length-exemption defect and the proof are
recorded once, in the canonical account —
**[04 · INC-001](../04-security/incident-history.md#inc-001--android-loudspeaker-self-echo-loop)**.
The rule it produced is
[C6](../00-master-blueprint/constitution.md#c6--safety-is-enforced-on-lifecycle-not-on-content).

## Tuning constants — as recorded at `ed568e6`

All in `voice-v2.html` @ `ed568e6`, lines 266–318. **This table is a historical
record, not the current configuration.** `FINAL_COALESCE_MS` has since been
removed outright and `TURN_BREAKER_MAX` changed; see *Current state*.

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

## Current state — active development, do not treat as settled

`origin/main` is at `149d94e` ("Voice v2: real turn-taking, and mute as a user
decision only"), one commit past this page's basis. That work is **not
finished**, so this vault records only what can be stated without endorsing an
in-flight design:

* `FINAL_COALESCE_MS` no longer exists. A turn-silence grace period replaced it
  after real-phone testing showed the 400 ms window cut Luis off mid-sentence.
  **The replacement value is not validated** — the suite on `main` says so
  itself, calling it "a starting point to tune from, not a verified value".
* A barge-in quarantine and an explicit mute/`SILENCIADO` state were added.
  Neither is documented here yet.
* The offline suite grew from 61 tests to 74. See
  [06 · Regression Tests](../06-testing/regression-tests.md).

**No architecture decision has been recorded for any of it.** [ADR-005](../07-change-history/architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer) is marked
*under review* rather than superseded, because the design that would replace it
is still being diagnosed —
[07 · ADR-005](../07-change-history/architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer).

Another session owns this work. Nothing on this page should be edited to
describe it as complete until that session reports.

## What is left — two unresolved hardware failures

A real Android physical test confirmed two failures that remain open. Reported
by the owner on **2026-09-10**; the test itself was run against the deployed
prototype at or after `149d94e`:

1. **A natural conversational pause still causes premature submission.** The
   problem the fixed-timer removal was meant to solve is not solved.
2. **Repeated audible clicks while Voice v2 is listening**, occurring even when
   both Luis and Panchita are silent. This is a new symptom with no entry in
   [05 · Research](../05-knowledge/research.md) and no offline coverage.

Both are being diagnosed in another session. Protocol and status:
[06 · Physical Tests](../06-testing/physical-tests.md).

## Open questions

* `voice-v2.html` is deployed for phone testing. What is the end state — does
  its behaviour eventually land in `index.html`, or does it stay a separate
  page permanently?
* The test suite points at `voice-v2.html` by path
  (`tests/harness.js:17`). If production ever inherits this voice path, the
  suite has to be re-pointed or it guards nothing.
* `PAID_REALTIME_ENABLED` is dead code while `false` — is paid realtime a real
  plan or a placeholder?
* `PAID_REALTIME_ENABLED` is dead code while `false` — is paid realtime a real
  plan or a placeholder?
