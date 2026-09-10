# Vision

> **Status:** stub — no source in this repository.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## Purpose of this page

The one-paragraph answer to "what is Panchita for, and how will we know it
worked?" Every roadmap item and every module should be justifiable against it.

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
  ([03](../03-modules/truck-repair.md)), real estate deal flow
  ([03](../03-modules/real-estate.md)), or personal time?
* What does Panchita refuse to do on the owner's behalf? That question is the
  whole content of [04 · Guardian](../04-security/guardian.md).

## Note on naming

"Vision" is also the name of a long-term Panchita module in the owner's
blueprint. This page is the *section* sense — the system's purpose — and the two
must not be conflated. Unresolved owner decision; see
[09 · Later](../09-backlog/later.md).
