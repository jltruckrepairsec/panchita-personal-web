# Later

> **Status:** partial — wanted, unscheduled, not committed to.
> **Lifecycle:** PLANNING
> **Last reviewed:** 2026-09-10

---

## L-1 — Define Central, and draw it on the architecture map

Central sits in [01 — Live Systems](../01-live-systems/central.md) with nothing
behind it. Until someone says whether it owns identity and memory, with Panchita
Personal as a thin client, the
[Architecture Map](../00-master-blueprint/architecture-map.md) cannot draw an
edge to it and the blueprint is incomplete.

## L-2 — The module contract

How the Gateway picks a module, what a module receives, what it must return,
whether modules can call each other. This blocks all of
[03 — Modules](../03-modules/) from being documented, and nobody can currently
answer "why did Panchita answer that way?" without opening n8n.

## L-3 — Memory and date-time

The browser holds no memory and sends no timestamp or timezone —
[02](../02-development/memory-and-date-time.md). If Panchita knows what day it
is, she learns it server-side. Sending the phone's timezone is a one-line client
change with a real correctness payoff, but it is a contract change, so it waits
on X2.

## L-4 — Permissions model

Not needed while there is one user. Needed before either
[Financial](../03-modules/financial.md) (money) or
[Recruiter](../03-modules/recruiter.md) (third-party personal data) is built.
Two of seven modules already depend on it.

## L-5 — Guardian

What Panchita refuses to do, and what notices when she does it anyway.
[INC-001](../04-security/incident-history.md) is the case study: unbounded
traffic, nothing noticed, stopped by an unrelated rate limiter.

## L-6 — Mission Control

The operator's view. The diagnostic panel in `index.html` is a working
miniature of the idea for one subsystem, and its useful property — an operator
surface that tests can also read — is worth carrying forward.

## L-7 — Write the SOPs down

The most valuable one is already followed and unwritten: build risky work as a
separate page on a branch, reproduce the failure in a test, fix, verify the test
fails against the pre-fix code, merge. It survives only as long as whoever holds
it keeps holding it. See [05 · SOPs](../05-knowledge/sops.md).

## L-8 — Price paid realtime voice

`PAID_REALTIME_ENABLED` has been `false` since it was written and the paid path
has never been costed. It is the number that would settle whether the
engineering invested in the free path was the right trade — and the question has
sharpened: the free path's end-of-turn behaviour has now failed hardware testing
twice, against two different mechanisms
([06 · Physical Tests](../06-testing/physical-tests.md)).

## L-9 — iOS and desktop browser support

Entirely untested. Unknown whether any of the Android findings in
[05 · Research](../05-knowledge/research.md) transfer.

## L-9b — Owner decisions the vault is holding

Not work items — questions the vault cannot answer for itself, parked here so
they are not lost:

* **Three name collisions** between blueprint modules and existing vault
  sections: *Legacy* (vs. [07 · Deprecated](../07-change-history/deprecated.md)),
  *Standards* (vs.
  [08 · Quality Standards](../08-cost-and-quality/quality-standards.md)), and
  *Vision* (vs. [00 · Vision](../00-master-blueprint/vision.md)). Nothing should
  be filed under any of the three until they are settled.
* **Taxonomy expansion.** 16 long-term blueprint concepts have no home, and
  they do not all belong in [03 — Modules](../03-modules/README.md): business
  domains, platform components, knowledge/simulation and governance/legacy are
  four different families. Deliberately not expanded yet.

## L-10 — Define Builder

The concept is not defined anywhere the vault can see. Nothing should be built
against the name until it is — see
[02 · Builder](../02-development/builder.md).
