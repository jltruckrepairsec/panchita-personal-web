# Lessons Learned

> **Status:** sourced — each lesson has a specific event behind it.
> **Last reviewed:** 2026-09-09

A lesson belongs here when it would change how the next piece of work is done.
Lessons general enough to be binding get promoted into the
[Constitution](../00-master-blueprint/constitution.md).

---

## L1 — Enforce on lifecycle, not on content

**From:** [INC-001](../04-security/incident-history.md)

The self-echo guard asked "does this text look like something she said?". That
question is unanswerable for short fragments and for garbled transcriptions, so
the guard could not work no matter how it was tuned. Gating on *whether she is
currently speaking* is a question with a definite answer.

When a check keeps needing exceptions, the check is probably on the wrong
variable.

**Promoted:** [C6](../00-master-blueprint/constitution.md#c6--safety-is-enforced-on-lifecycle-not-on-content)

---

## L2 — An exemption inside a guard is a hole in the guard

**From:** [INC-001](../04-security/incident-history.md)

Transcripts shorter than six characters were exempt from the echo check. It
looked like sensible noise filtering. It was the entire bug: `Claro` is five
characters, and the fragments that leaked were exactly the exempt ones.

An exemption is an attack surface with a friendly name. If one is needed, the
case it excludes has to be handled somewhere else, deliberately.

---

## L3 — Every hold needs a ceiling

**From:** the INC-001 fix

Gating submission on TTS lifecycle created a new way to fail: if
`speechSynthesis` never reports an end, the gate never opens and Panchita is
permanently deaf. `TTS_GATE_MAX_MS = 90000` and the test "the gate never wedges
shut when TTS never reports an end" were part of the same change.

A fix that introduces a new failure mode is not finished until that mode is
handled too.

**Promoted:** [C7](../00-master-blueprint/constitution.md#c7--a-gate-must-never-be-able-to-wedge-shut)

---

## L4 — A rate limiter is not a safety mechanism

**From:** [INC-001](../04-security/incident-history.md)

The Gateway's message limit stopped the runaway loop. It was not designed to.
Nothing in the system noticed the loop, and a loop below the threshold would
still be running today.

Do not count a limit that exists for another purpose as protection. See
[04 · Guardian](../04-security/guardian.md).

---

## L5 — Isolating the experiment is what made the failure cheap

**From:** the whole Voice v2 sequence

Continuous recognition, cumulative-final flooding and the self-echo loop all
happened in `voice-v2.html`, on a branch, never served. Production kept working
throughout. The cost of INC-001 was a debugging session; had it shipped in
`index.html`, it would have been an outage in the owner's only interface.

**Promoted:** [C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment)

---

## L6 — Test the shipped artefact, not a model of it

**From:** `tests/harness.js`

The suite extracts the real `<script>` body out of the page and runs it in a
sandbox behind a minimal DOM, a scriptable `SpeechRecognition` and a
controllable clock. Nothing is re-implemented, so a regression in the page is a
failing test rather than a test that still passes against a stale copy.

The counters are read from the page's own diagnostic panel instead of private
state, so the tests survive internal refactoring.

**Promoted:** [C8](../00-master-blueprint/constitution.md#c8--the-test-runs-the-shipped-code)

---

## L7 — Verify a new test against the old code

**From:** `tests/README.md`

Both test suites record what they do against the pre-fix page: `fragment "Claro"
reached Gateway`, `self-echo flooded Gateway with 5 extra turns`, and for the
turn-assembly work `15 of these fail, including expected 1 submission, got 4`.

A test that has never failed has not been shown to test anything. Running it
against the broken version is the cheapest possible proof, and writing the
numbers down means the next person does not have to redo it.

---

## L8 — Label provisional code in the code

**From:** `FINAL_COALESCE_MS`

The constant is stated three times over to be a burst width, not an end-of-turn
timer, and not a reinstatement of the deleted silence timer. Without that, the
obvious response to a mis-detected long pause is to raise it — silently
rebuilding the mechanism the design deliberately removed.

Where a value could be misread as something structural, the source has to say
what it is not.

**Promoted:** [C5](../00-master-blueprint/constitution.md#c5--scaffolding-is-labelled-as-scaffolding)

---

## L9 — Write the error message the field taught you

**From:** the `notSupported` voice message

"Microphone isn't available in this browser. If you opened this link from
another app (WhatsApp, Gmail, etc.), open it directly in Chrome instead."

The generic version of that message would send the owner to check his
microphone settings, which are fine. The specific version names the actual cause
and resolves it in one step. Somebody had to hit it first.
