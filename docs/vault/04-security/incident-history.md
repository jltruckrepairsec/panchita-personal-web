# Incident History

> **Status:** sourced — one incident, reconstructed in full from the source and
> the tests written to close it.
> **Lifecycle:** HISTORICAL RECORD
> **Basis:** `ed568e6`
> **Last reviewed:** 2026-09-10

> **Canonical page** for the self-echo incident: root cause, the leaked
> fragments, the length-exemption defect, the fix and the proof. Other pages
> link here rather than restating it.

---

## INC-001 — Android loudspeaker self-echo loop

| | |
| --- | --- |
| **Date found** | 2026-09-09 |
| **Found by** | Luis, on his own Android phone |
| **Affected** | `voice-v2.html` only. Production `index.html` never had continuous recognition and was never altered — it is byte-identical to `b01eb18` today. Note that `voice-v2.html` **is** publicly reachable from `main`, deliberately, so "prototype" here means not-production, not un-deployed |
| **Severity** | High for the prototype: unbounded self-driven Gateway traffic |
| **Closed by** | `ed568e6` "Voice v2: contain the Android loudspeaker self-echo loop" |
| **Status** | Fixed, reproduced in tests, contained by construction |

### What happened

Panchita spoke through the phone's loudspeaker. The open microphone recognised
her own speech as the user's. Fragments of her answer — `Claro`, `Aquí`,
`dime` — became user bubbles. She answered them. Those answers fed back too.

The loop ran until the Gateway's message limit stopped it:
`Límite de mensajes alcanzado`.

Nobody stopped it from inside the system. The only thing that ended it was a
rate limiter belonging to a different component, doing its job for a completely
different reason.

### Root cause

Two flaws, and only together did they matter:

1. **Submission was allowed at all times.** There was no state in which the
   microphone's output was refused. Whatever was heard was eligible to be sent.
2. **The only defence was a text similarity test — with a length exemption.**
   Transcripts shorter than six characters were ignored by the check entirely.

`Claro` is five characters.

So the guard did not fail. It was never consulted. The fragments that actually
leaked were precisely the ones short enough to be exempt, which is why the loop
started with filler words rather than whole sentences.

### The deeper cause

The guard was **content-based**. It asked "does this text look like something
she just said?" That question has no reliable answer:

* Short fragments carry too little signal to compare — hence the exemption that
  killed it.
* A garbled transcription of her audio does not resemble her text at all, so
  even without the exemption it would pass.

A content check on a feedback loop is a test on the wrong variable.

### Fix

Gate on **lifecycle**, not on text.

From the moment `speak()` is called until `speechSynthesis` reports silence
**and** a tail has elapsed, the gate is held and nothing the microphone hears
may reach the turn assembler or the Gateway — regardless of what it says. A
garbled transcription of her audio is contained as reliably as an exact one,
because the gate never looks at the transcript.

When the gate opens, the recogniser is **replaced**, so audio captured while
the gate was held is discarded with it and cannot arrive late.

Supporting constants (`voice-v2.html:300` @`ed568e6`):

| Constant | Value | Role |
| --- | --- | --- |
| `TTS_TAIL_MS` | 450 ms | Speaker tail and room reverb after she stops |
| `TTS_POLL_MS` | 150 ms | How often to re-check whether she is speaking |
| `TTS_MIN_HOLD_MS` | 700 ms | Covers the deferred `speak()` start-up |
| `TTS_GATE_MAX_MS` | 90 000 ms | Absolute ceiling — the gate can never wedge |

`TTS_MIN_HOLD_MS` closes the window where `speak()` had been called but
synthesis had not yet started, in which `speechSynthesis` would have reported
silence and opened the gate just before she began talking.

`TTS_GATE_MAX_MS` exists because the fix introduced a way to be permanently
deaf: if `speechSynthesis` never reports an end, a gate with no ceiling never
opens. The ceiling is the fix's own failure mode being handled in the same
change.

### Proof

The incident is reproduced as a test, and the reproduction was run against the
pre-fix page to confirm it actually reproduces:

> `fragment "Claro" reached Gateway` · `self-echo flooded Gateway with 5 extra
> turns`

Gates now held (all in `tests/voice-v2-self-echo.test.js`):

* Her TTS fed back = 0 Gateway submissions
* The exact fragments that leaked — `Claro`, `Aquí`, `dime` — are contained
* A mis-transcription of her audio is contained too
* No runaway loop: 10 rounds
* No rate-limit flood: 14 distinct fragments
* Nothing at all can be submitted while the loudspeaker is live
* Intentional barge-in still works
* She never interrupts herself
* Recognition resumes safely after TTS, including when Android refuses the
  first `start()`
* The gate never wedges shut when TTS never reports an end
* A recogniser live during TTS cannot submit after the reset
* Mute and End-voice during TTS behave

### Lessons

1. **Enforce on lifecycle, not on content.** Adopted as
   [C6](../00-master-blueprint/constitution.md#c6--safety-is-enforced-on-lifecycle-not-on-content).
2. **An exemption inside a guard is a hole in the guard.** The six-character
   exemption was a reasonable-looking noise filter and it was the entire bug.
3. **Every hold needs a ceiling.** Adopted as
   [C7](../00-master-blueprint/constitution.md#c7--a-gate-must-never-be-able-to-wedge-shut).
4. **A rate limiter is not a safety mechanism.** It stopped this loop, but it
   was never designed to, and the next loop may sit under its threshold.
5. **The prototype was isolated by *file*, so this cost nothing.** Continuous
   recognition never touched `index.html`. Worth being precise about why: the
   protection was a separate file, not an unmerged branch — the branch was
   later merged and the prototype is now public, and production was still
   unaffected. See
   [C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment).

Also in [05 · Lessons Learned](../05-knowledge/lessons-learned.md).

### Follow-ups

* [ ] Confirm the Gateway's actual rate limit and whether a self-driven loop
      below it would be detected at all. Nothing currently would notice.
* [ ] Consider a server-side turn-rate anomaly signal, since the client's turn
      breaker only protects the client.

---

## Recording an incident

Copy the shape above: what happened in plain language, root cause, the *deeper*
cause if the immediate one is a symptom, the fix, the proof it is fixed, and
the lessons — with any rule promoted into the
[Constitution](../00-master-blueprint/constitution.md) and any general lesson
copied into [05](../05-knowledge/lessons-learned.md).

An incident is not closed by a fix. It is closed by a test that fails without
the fix.
