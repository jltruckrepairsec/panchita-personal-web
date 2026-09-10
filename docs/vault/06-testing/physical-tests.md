# Physical Tests

> **Status:** sourced — hardware testing **has run**; two failures are open.
> **Lifecycle:** PHYSICAL ANDROID FAILURE UNDER DIAGNOSIS · HARDWARE
> VERIFICATION PENDING
> **Basis:** `ed568e6` for the protocol; findings dated 2026-09-09
> **Last reviewed:** 2026-09-10

## Open hardware failures

Reported by the owner on **2026-09-10**, against the deployed prototype at or
after `149d94e`. Both reproduce on Luis's real Android phone while **74 offline
tests pass**.

### H-1 — A natural conversational pause still causes premature submission

The turn is cut at a real thinking pause mid-sentence and the remainder becomes
a second turn.

This is the failure this vault flagged as unanswerable offline, and it has now
been observed twice: once against the 400 ms coalesce window at `ed568e6`, and
again against its replacement. **The problem is not solved.**

Do not treat any current constant value as the fix. Under diagnosis in another
session.

### H-2 — Repeated audible clicks while listening

Repeated clicks are audible while Voice v2 is listening, **with both Luis and
Panchita silent**.

This is a new symptom class:

* No offline test covers it. The harness has no audio path at all, so it cannot.
* Nothing in [05 · Research](../05-knowledge/research.md) anticipated it.
* Silence on both sides rules out speech handling as the trigger, which points
  at recogniser lifecycle — the repeated `stop()`/`start()` cycle that
  continuous listening depends on is the obvious suspect, and that is a
  hypothesis, not a finding.

Under diagnosis in another session.

## Why a physical test is required at all

The offline suite says plainly what it cannot do. At `149d94e` it puts it as
"they model an engine, not a room": pause tolerance, how promptly barge-in
feels, and audible artefacts are all properties of real audio on real hardware.

H-1 and H-2 are that limit made concrete. So was the self-echo loop, which was
found on hardware and not in review, because loudspeaker-to-microphone coupling
does not exist in a test harness.

## Device

Luis's Android phone, Chrome, opened directly (not from inside WhatsApp, Gmail
or any other in-app browser — those webviews have no `SpeechRecognition`).

Page: `voice-v2.html`, served from `main` by GitHub Pages. **It is publicly
reachable on purpose** — that is what makes phone testing possible without a
preview build. It is a DEPLOYED PROTOTYPE and not the production voice
experience, which remains `index.html`.

## The protocol

**PT-1 — Long natural pause mid-sentence** · **currently FAILING, see H-1**

1. Start a voice session.
2. Begin a sentence, pause for a real thinking beat mid-way — the kind of pause
   that happens when recalling a part number or a name — then finish the
   sentence.
3. Observe whether the turn was cut at the pause.

**Pass:** the whole sentence arrives as one turn.
**Fail:** the turn ends at the pause and the remainder becomes a second turn.

**A failure here is a design question about end-of-turn, not a tuning knob.**
That guidance was written against `FINAL_COALESCE_MS` at `ed568e6`, a constant
that has since been removed. It still holds against whatever value currently
governs end-of-turn: PT-1 has now failed twice, against two different
mechanisms, which is evidence that tuning is not what is missing.

See [07 · D1](../07-change-history/deprecated.md#d1--the-fixed-silence-timer-silencems--3500)
and [07 · ADR-005](../07-change-history/architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer),
both marked under review.

## The rest of the protocol

Everything below has offline coverage; these confirm the offline result holds on
real hardware and real audio.

**PT-0 — Idle listening is silent.** Start a voice session and leave it
listening with nobody speaking. *Pass:* no audible clicks or artefacts.
**Currently FAILING — see H-2.** Added 2026-09-10; there was no such test
before, which is why H-2 was not caught earlier.

**PT-2 — Self-echo, loudspeaker at full volume.** Ask a question that produces a
long spoken answer, hold the phone normally, say nothing. *Pass:* no user bubble
appears from her own speech; no turn is submitted.

**PT-3 — Intentional barge-in.** Interrupt her mid-answer with a real
instruction. *Pass:* she stops and the instruction is submitted once.

**PT-4 — One sentence, one submission.** Speak a normal-length sentence.
*Pass:* exactly one user bubble and one Gateway request.

**PT-5 — Continuous conversation.** Three or four turns without touching the
microphone button. *Pass:* the microphone is still listening after each turn.

**PT-6 — Mute and End voice.** Both mid-speech and while she is speaking.
*Pass:* buffered speech is discarded; nothing arrives afterwards.

**PT-7 — Session ceilings.** Leave the session idle 3 minutes
(`IDLE_AUTO_END_MS`). *Pass:* it ends cleanly.

**PT-8 — Permission paths.** Deny microphone permission, and separately open
the page from inside WhatsApp. *Pass:* the specific message for each case
appears, not the generic one.

## Recording a run

There is no results log yet. Each run should record: date, device, Android and
Chrome versions, which tests were run, pass/fail, and for any failure the
diagnostic panel contents — that panel exists precisely because these failures
are otherwise invisible from a phone.

Results go in [Test Results](test-results.md).

## Status

**Run. Two failures open** (H-1, H-2), both under diagnosis in another session.
The remaining PT items have no recorded result.

`voice-v2.html` is already deployed to `main` for exactly this testing, so
nothing is waiting on a merge. What is blocked is treating the voice path as
settled — see [09 · Blocked](../09-backlog/blocked.md).
