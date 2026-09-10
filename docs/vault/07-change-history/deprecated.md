# Deprecated

> **Status:** sourced — two mechanisms removed. **D1 is under review**: its
> subject matter is being redesigned under hardware testing.
> **Lifecycle:** HISTORICAL RECORD — D1 under review
> **Basis:** `149d94e`
> **Last reviewed:** 2026-09-10

Things deliberately removed, and why, so that nobody rebuilds them by accident.

> **Not to be confused with Panchita Legacy.** This page is *deprecated* —
> obsolete or replaced technical mechanisms. **Panchita Legacy** is continuity
> and succession: institutional knowledge, long-term stewardship, and Panchita
> surviving changes of owners, employees, vendors, models and infrastructure.
> Different concept, different section —
> [12 · Legacy](../12-governance-and-legacy/legacy.md). The word collision is
> unfortunate and deliberate to keep, because both meanings are correct in their
> own domain.
Both entries below are still live in production `index.html`; they are
deprecated in Voice v2 and will be gone from production when it merges.

---

## D1 — The fixed silence timer (`SILENCE_MS = 3500`)

⚠️ **UNDER REVIEW.** The deprecation below is accurate as history. Its guidance
— "do not rebuild a silence timer" — is being tested against reality right now
and should not be applied mechanically; see *Where this stands* at the end of
this entry.

**Removed in:** `acfd1ec` (Voice v2) · **Still present in:** `index.html:582`,
which is CURRENT PRODUCTION and unaffected

A stopwatch decided when a spoken turn had ended. Raised to 3500 ms in
`b01eb18` because shorter windows cut people off mid-thought — which is the
tell: a value being tuned upward against a problem it cannot solve.

**Replaced by:** the recogniser's own endpointer ([ADR-005](architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer)). A timer has no
acoustic information; the endpointer does.

### Do not rebuild this — as originally written

`FINAL_COALESCE_MS = 400` was the constant most likely to be mistaken for a
replacement, because it is a millisecond value in the same code path. It was the
width of Android's cumulative-final burst and nothing else. The source stated
this three times over, and the suite asserted the statement:

> "It is provisional hardware-test scaffolding, it is not semantic end-of-turn,
> and it is not a reinstatement of the removed fixed silence timer."

If a long natural pause ends a turn prematurely on hardware, that is a design
question about end-of-turn — not a knob to turn.

### Where this stands

`FINAL_COALESCE_MS` no longer exists. On `main` @ `149d94e` a silence grace
period governs end-of-turn instead, introduced after real-phone testing showed
400 ms cut Luis off mid-sentence.

Two things must be said carefully, because they pull in opposite directions:

* **That change was treated as a design question, not a knob.** The constant was
  removed rather than raised, the replacement has a different reset condition,
  and it came with new tests. D1's warning was about a silent re-tune; that is
  not what happened.
* **It has not worked yet.** PT-1 still fails — a natural pause still causes
  premature submission
  ([H-1](../06-testing/physical-tests.md#h-1--a-natural-conversational-pause-still-causes-premature-submission)) —
  and the replacement value is explicitly unvalidated.

So D1 is neither vindicated nor superseded. It stays marked under review until
the session diagnosing H-1 reports, at which point either D1 is restated or a
new ADR replaces [ADR-005](architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer). **Neither will be written on the strength of an
unfinished implementation.**

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

**Replaced by:** a TTS lifecycle gate ([ADR-006](architecture-decisions.md#adr-006--safety-gates-on-lifecycle-not-on-content)). While she is speaking, nothing
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
