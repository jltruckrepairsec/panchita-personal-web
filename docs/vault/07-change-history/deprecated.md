# Deprecated

> **Status:** sourced — two mechanisms removed, both in Voice v2.
> **Last reviewed:** 2026-09-09

Things deliberately removed, and why, so that nobody rebuilds them by accident.
Both entries below are still live in production `index.html`; they are
deprecated in Voice v2 and will be gone from production when it merges.

---

## D1 — The fixed silence timer (`SILENCE_MS = 3500`)

**Removed in:** `acfd1ec` (Voice v2) · **Still present in:** `index.html:582`

A stopwatch decided when a spoken turn had ended. Raised to 3500 ms in
`b01eb18` because shorter windows cut people off mid-thought — which is the
tell: a value being tuned upward against a problem it cannot solve.

**Replaced by:** the recogniser's own endpointer (ADR-005). A timer has no
acoustic information; the endpointer does.

### Do not rebuild this

`FINAL_COALESCE_MS = 400` is the constant most likely to be mistaken for a
replacement, because it is a millisecond value in the same code path. It is the
width of Android's cumulative-final burst and nothing else. The source states
this three times over, and the test suite asserts the statement:

> "It is provisional hardware-test scaffolding, it is not semantic end-of-turn,
> and it is not a reinstatement of the removed fixed silence timer."

If a long natural pause ends a turn prematurely on hardware, that is a design
question about end-of-turn — not a knob to turn. See
[06 · Physical Tests, PT-1](../06-testing/physical-tests.md#the-blocking-test).

---

## D2 — The text-similarity echo guard, with its length exemption

**Removed in:** `ed568e6` (Voice v2) · **Still present in:** `index.html`, where
it is harmless because production never has the microphone open while Panchita
speaks

Submission was permitted at all times, and the only defence against Panchita
hearing herself was a text similarity test that **ignored any transcript shorter
than six characters**.

**Why it was unfixable rather than under-tuned:**

* Short fragments carry too little signal to compare — hence the exemption,
  which was the entire bug (`Claro` is five characters).
* A garbled transcription of her audio does not resemble her text at all, so
  even with the exemption removed it would pass.

The check was on the wrong variable.

**Replaced by:** a TTS lifecycle gate (ADR-006). While she is speaking, nothing
the microphone hears may be submitted, regardless of what it says.

### Do not rebuild this

Any future proposal to filter self-echo "by checking whether the text matches
what she just said" is this mechanism returning. It has a full post-mortem:
[INC-001](../04-security/incident-history.md).

---

## Deprecating something

Say what it was, when it was removed, what replaced it, and — the part that
earns the page — **what it will look like when someone tries to reintroduce
it**. Both entries above have that section, because in both cases the
reintroduction would look perfectly reasonable at the time.
