# Innovation Lab / Labs

> **Status:** concept — named in the Master Blueprint. No definition given.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known

Approved as a learning/simulation concept. Nothing about its form is decided.

## This is already happening, unnamed

Voice v2 *is* a lab project, and it has been run with unusual discipline:

* Built as a separate file so production could not be affected — and across four
  releases, `index.html` has not changed by a byte.
* Deployed publicly on purpose, so it could be tested on a real phone.
* Every failure reproduced in a test before being fixed, and each new test run
  against the pre-fix code to prove it failed.
* Still not treated as settled while two hardware failures are open.

So the question this page holds is not "should there be a lab?" but **"what did
Voice v2 do that should become the standard, and what was accidental?"**

Three candidates for the standard, each already recorded as a rule:

* [C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment) —
  production is never the experiment. Note the precise mechanism: **file
  isolation**, not branch isolation, which turned out to be luck.
* [L7](../05-knowledge/lessons-learned.md#l7--verify-a-new-test-against-the-old-code) —
  verify a new test against the old code.
* [C5](../00-master-blueprint/constitution.md#c5--scaffolding-is-labelled-as-scaffolding) —
  provisional code says so, in the code.

## The tension a lab has to manage

A lab produces experiments; the
[execution priority](../00-master-blueprint/execution-priority.md) says finish
Truck Repair v1.0 first. Those pull against each other, and naming the tension
is more useful than pretending it resolves. Voice v2 is the current example: it
is real work, it is not Truck Repair, and it continues because it is maintenance
of something already deployed rather than a new thing being started.

## Deliberately undefined

Whether Labs is a process, a place, a budget or a team; who may start an
experiment; and what the graduation criteria to production are.

## Related

* [02 · Voice v2](../02-development/voice-v2.md) — the unnamed lab project
* [00 · Execution Priority](../00-master-blueprint/execution-priority.md)
* [07 · Architecture Decisions](../07-change-history/architecture-decisions.md)
