# Voice v2 regression tests

Offline tests for `voice-v2.html`, the isolated voice test page.
They cover **only** `voice-v2.html`. `index.html` (production) is not
imported, not loaded and not touched by anything here.

## Run

```sh
node --test tests/*.test.js
```

No dependencies, no install step, no network. The Gateway is a local stub;
nothing leaves the process and there are no keys, tokens or endpoints in the
test code.

## What is under test

`tests/harness.js` extracts the real `<script>` body out of `voice-v2.html`
and runs it in a sandbox behind a minimal DOM, a scriptable
`SpeechRecognition` and a controllable clock. The code under test is the code
that ships, so a regression in the page is a failing test here. Counters are
read from the page's own diagnostic panel rather than from private state.

* `voice-v2-helpers.test.js` — unit tests over the block between the
  `BEGIN/END PURE HELPERS` markers, extracted verbatim.
* `voice-v2-turn-assembly.test.js` — end-to-end tests for the Android turn
  assembly fix and for the behaviour it must not break.
* `voice-v2-self-echo.test.js` — end-to-end tests for the reproduced Android
  loudspeaker feedback loop.

## The self-echo loop (reproduced on Luis's phone)

Panchita spoke through the loudspeaker, the open microphone recognised her own
TTS as user speech, fragments of her answer became user bubbles, she answered
herself, and it ran until `Límite de mensajes alcanzado`.

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
| Recognition resumes safely after TTS | "the gate opens once she is silent…", "voice survives Android refusing the first start()…" |
| The gate cannot wedge shut | "the gate never wedges shut when TTS never reports an end" |
| Stale events during/after TTS submit nothing | "the recogniser that was live during TTS cannot submit after the reset" |
| Mute / End voice during TTS | the two "during TTS" tests |

Verified against the pre-fix page: the reproduction fails there, with
`fragment "Claro" reached Gateway` and `self-echo flooded Gateway with 5
extra turns`.

## The gates these tests exist to hold

| Gate | Test |
| --- | --- |
| Interim hypotheses reach Gateway 0 times | "interim hypotheses produce zero Gateway submissions" |
| One utterance's cumulative finals = exactly 1 submission | "a cumulative final burst produces exactly one Gateway submission" |
| Stale recogniser callbacks submit 0 times | the four "stale"/"replaced" tests |
| No rate-limit flood | "a long dictation…", "three real turns…" |
| Mute / End voice discard buffered speech | "mute discards…", "End voice discards…" |
| Continuous listening survives a completed turn | "the microphone is still listening after a full turn completes" |
| Barge-in, echo guard, dedupe, text fallback intact | the remaining tests |
| Auth/session boundaries unchanged | "the login handshake payload is unchanged", "an expired session still forces re-login…", "voice cannot start without a session" |

Verified against the pre-fix page: 15 of these fail, including
`expected 1 submission, got 4` — the reported Android behaviour.

## What these tests do NOT prove

They do not prove the **long natural-pause** problem is solved. `FINAL_COALESCE_MS`
coalesces Android's rapid cumulative final hypotheses; it is not an
end-of-turn timer and must not be raised to mask a long pause. End-of-turn
still comes from the recogniser's own endpointer. That behaviour can only be
judged on real Android hardware.
