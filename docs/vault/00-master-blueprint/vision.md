# Vision

> **Status:** defined by owner decision 2026-09-10 as a *concept*; its content
> — the actual strategic direction — remains to be written by the owner.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## Vision is not the Blueprint

**Panchita Vision is the long-term strategic direction and purpose of Panchita.**

**The [Panchita Master Blueprint](panchita-master-blueprint.md) is the
structured architectural and organizational map used to preserve and execute
that vision.**

They are different artefacts and must not be conflated:

| | Vision | Master Blueprint |
| --- | --- | --- |
| Answers | *Why*, and where this is going | *What exists*, and how it fits together |
| Changes when | Purpose changes — rarely | The system changes — often |
| Fails by | Being vague, or unwritten | Going stale |
| Owned by | The owner alone | The vault, maintained against evidence |

A Blueprint with no Vision is a map with no destination. A Vision with no
Blueprint is a destination with no route. This page is the first of the two, and
it is still empty.

## Purpose of this page

The answer to "what is Panchita for, and how will we know it worked?" Every
roadmap item and every concept in sections 10–12 should be justifiable against
it.

## What belongs here

* The end state, written as a day in the owner's life once Panchita works.
* Who Panchita serves, in priority order — owner first, then which businesses.
* The boundary: what Panchita will deliberately never do.
* Success measures that are observable, not aspirational.

## What can be said today, from the code alone

The shipped front end shows a narrow, deliberate product: Spanish first
(`<html lang="es">`), phone shaped, one owner, one conversation, voice as a
first-class input rather than a novelty. Nothing in the source suggests
multi-user or multi-tenant intent.

That is an inference from the interface, not a stated vision.

## Open questions

* Is Panchita a single-owner assistant permanently, or does it grow to staff?
  The answer decides whether
  [04 · Permissions](../04-security/permissions.md) is urgent or theoretical.
* Which business outcome is the first proof of value — truck repair operations
  ([03](../03-business-domains/truck-repair.md)), real estate deal flow
  ([03](../03-business-domains/real-estate.md)), or personal time?
* What does Panchita refuse to do on the owner's behalf? That question is the
  whole content of [04 · Guardian](../04-security/guardian.md).

## Naming — resolved

The blueprint's "Panchita Vision" and this page are **the same thing**, settled
by owner decision on 2026-09-10. There is no separate Vision module. This page is
canonical, and
[12 — Governance & Legacy](../12-governance-and-legacy/README.md) points here
rather than duplicating it.
