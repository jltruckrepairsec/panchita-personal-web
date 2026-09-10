# Research

> **Status:** partial — 7 established findings, plus 1 unexplained symptom
> under diagnosis. All learned from hardware rather than from reading.
> **Lifecycle:** HARDWARE FINDINGS
> **Basis:** `ed568e6`, plus unresolved findings dated 2026-09-09
> **Last reviewed:** 2026-09-10

## Android Chrome speech recognition

Everything here was discovered by running voice on a real Android phone. None of
it is obvious from the Web Speech API surface, and all of it shaped
[Voice v2](../02-development/voice-v2.md).

### Finals arrive cumulatively, not once

One spoken turn produces a burst of **cumulative** final hypotheses:

```
"Panchita" → "Panchita quiero" → "Panchita quiero que" → …
```

Each is flagged final. A naive implementation submits every one, so one sentence
becomes four requests. The desktop mental model — one final per utterance — is
simply wrong on Android.

*Consequence:* finals must be coalesced locally.

### The endpointer, not a timer, decides when a turn ends

Production uses a fixed 3500 ms silence timer. Voice v2 removed it and relies on
the recogniser's own endpointer, which is the only component that actually knows
whether speech has finished.

*Resolved, badly:* it does **not** reliably tolerate a long natural thinking
pause. Tested on hardware and confirmed twice — against the 400 ms coalesce
window at `ed568e6`, and against its replacement at `149d94e`. Tracked as
[H-1](../06-testing/physical-tests.md#h-1--a-natural-conversational-pause-still-causes-premature-submission).

### Callbacks outlive their recogniser

Aborted, replaced, muted and ended recognisers still fire queued events. Any
handler that does not check ownership will act on a dead recogniser's audio.

### `start()` can be refused

Android may refuse the first `start()` call. Recovery has to be built in, and it
is covered by the test "voice survives Android refusing the first `start()`".

### Recognition permission is a separate gate from `getUserMedia`

> "SpeechRecognition itself is denied (a separate gate on Android Chrome)"
> — `index.html:812`

Microphone permission granted does not imply recognition permitted. They must be
diagnosed separately, which is part of why the diagnostic panel exists.

### The loudspeaker reaches the microphone

Phone speaker to phone microphone is a live audio path. With continuous
recognition, TTS output becomes recognised input. See
[INC-001](../04-security/incident-history.md).

### Links opened from other apps break voice

Opening the page from inside WhatsApp or Gmail lands in an in-app webview where
`SpeechRecognition` is unavailable. This is why the `notSupported` message names
the cause and tells the owner to open it in Chrome directly — a field-learned
message, not boilerplate.

## Unexplained — under diagnosis

### Repeated audible clicks while listening

Reported by the owner on 2026-09-10 against the deployed prototype at or after
`149d94e`: repeated clicks are audible while Voice v2 is listening, **with both
Luis and Panchita silent**.

**No cause is established.** What the silence on both sides does rule out is
speech handling — nothing is being recognised or spoken when it happens. That
leaves recogniser lifecycle as the place to look, since continuous listening
depends on repeatedly stopping and restarting the recogniser, but that is a
direction to investigate and **not a finding**.

It is recorded here rather than above because the section above is established
behaviour and this is not. It moves up when it is understood.

Tracked as
[H-2](../06-testing/physical-tests.md#h-2--repeated-audible-clicks-while-listening).
Under diagnosis in another session.

## What is not researched

* iOS Safari: entirely untested. Unknown whether any of the above transfers.
* Desktop browsers: untested.
* Whether paid realtime voice would sidestep the endpointer problem outright.
  `PAID_REALTIME_ENABLED` exists and is `false`; nothing evaluates the trade.
  This is worth more attention now than when it was written: the endpointer
  problem has failed PT-1 twice, against two different mechanisms.
  See [08 · Provider Costs](../08-cost-and-quality/provider-costs.md).
