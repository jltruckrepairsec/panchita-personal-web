# Digital Twin / Simulator

> **Status:** concept — named in the Master Blueprint. No definition given.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known

Approved as a learning/simulation concept. What is twinned, and to what end, is
undecided.

## The two readings

* **Digital Twin** — a live model of a real thing, kept in sync with it: a
  shop's workload, a fleet, a deal pipeline. Its value is prediction and
  what-if.
* **Simulator** — an environment to rehearse in safely: train a person, or test
  Panchita's behaviour, without real consequences.

They share a name in the blueprint and almost nothing else. A twin needs live
data from a system of record; a simulator needs a model of behaviour and a way
to run it.

## What already exists that is simulator-shaped

The offline test harness is a small, working simulator, and it is instructive:

> It runs the real shipped page in a sandbox behind a minimal DOM, a scriptable
> `SpeechRecognition` and a controllable clock — `tests/harness.js`

It rehearses Panchita's voice behaviour deterministically, 74 tests in under a
second, without a phone.

**And it demonstrates the limit of every simulator in the same breath.** Its own
README now says it "models an engine, not a room": 74 tests pass while two
failures reproduce on Luis's real Android phone
([06 · Physical Tests](../06-testing/physical-tests.md)).

That is the lesson this page should carry from the day it is written: a
simulator tells you about the model, and the gap between the model and the world
is exactly where the expensive failures live.

## Deliberately undefined

What is twinned, where its data comes from, who uses it, and whether Twin and
Simulator are one capability or two.

## Related

* [06 · Regression Tests](../06-testing/regression-tests.md) — the working
  simulator
* [06 · Physical Tests](../06-testing/physical-tests.md) — its limit, measured
* [University / Academy](university-academy.md)
