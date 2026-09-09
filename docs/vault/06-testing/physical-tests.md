# Physical Tests

> **Status:** sourced — this is the one open blocker on Voice v2.
> **Last reviewed:** 2026-09-09

## Why a physical test is required at all

The offline suite is thorough, and it says plainly what it cannot do:

> "They do not prove the **long natural-pause** problem is solved.
> `FINAL_COALESCE_MS` coalesces Android's rapid cumulative final hypotheses; it
> is not an end-of-turn timer and must not be raised to mask a long pause.
> End-of-turn still comes from the recogniser's own endpointer. That behaviour
> can only be judged on real Android hardware." — `tests/README.md`

Voice v2 deleted the fixed 3500 ms silence timer and handed end-of-turn to
Android's own endpointer. Whether that endpointer waits out a real thinking
pause is a property of Android, not of this code, and no sandbox can answer it.

The self-echo loop is the same story from the other direction: it was found on
hardware, not in review, because loudspeaker-to-microphone coupling does not
exist in a test harness.

## Device

Luis's Android phone, Chrome, opened directly (not from inside WhatsApp, Gmail
or any other in-app browser — those webviews have no `SpeechRecognition`).

Page: `voice-v2.html` from the branch. It is not on `main` and is not served by
GitHub Pages, so it must be loaded from wherever the branch is previewed.

## The blocking test

**PT-1 — Long natural pause mid-sentence**

1. Start a voice session.
2. Begin a sentence, pause for a real thinking beat mid-way — the kind of pause
   that happens when recalling a part number or a name — then finish the
   sentence.
3. Observe whether the turn was cut at the pause.

**Pass:** the whole sentence arrives as one turn.
**Fail:** the turn ends at the pause and the remainder becomes a second turn.

**If it fails, do not raise `FINAL_COALESCE_MS`.** That constant is the width of
Android's cumulative-final burst and nothing else; raising it silently rebuilds
the timer the design removed
([C5](../00-master-blueprint/constitution.md#c5--scaffolding-is-labelled-as-scaffolding),
and the suite asserts the label). A failure here is a design question about
end-of-turn, not a tuning knob.

## The rest of the protocol

Everything below has offline coverage; these confirm the offline result holds on
real hardware and real audio.

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

**Not yet run.** This is the item blocking the Voice v2 merge; see
[09 · Blocked](../09-backlog/blocked.md).
