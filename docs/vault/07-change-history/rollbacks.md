# Rollbacks

> **Status:** sourced — none have occurred.
> **Lifecycle:** HISTORICAL RECORD
> **Basis:** `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

## Record

**No rollback has ever been performed.** The history is linear: three commits on
`main`, three on the Voice v2 branch, no reverts, no resets, nothing withdrawn
after release.

That is a real fact about the project, not an empty page.

## Why there has been nothing to roll back

Every failure so far — cumulative-final flooding, the self-echo loop, and the two
open hardware failures — has happened in `voice-v2.html`. None reached
`index.html`, which is byte-identical to `b01eb18`, so nothing has ever needed
withdrawing from production. All were fixed forward.

The protection was **file isolation**, not branch isolation:
`voice-v2.html` has been on `main` and publicly reachable since `070bda9`, and
production was unaffected anyway. See
[ADR-004](architecture-decisions.md#adr-004--risky-work-ships-as-a-separate-page-on-a-branch)
and [C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment).

**A caveat this page owes the reader:** a deployed prototype with two open
hardware failures is reachable by anyone with the URL. That is a deliberate
testing decision, not an incident, and it is not a rollback candidate. But it
means "nothing has needed rolling back" is a statement about `index.html`, not
about everything `main` serves.

## How a rollback would work today

Production is a static page served from `main`. Reverting is `git revert`
followed by a push; GitHub Pages redeploys. There is no database migration, no
persisted client state, and no build artefact to reconcile — session state is
memory-only, so a rolled-back page starts clean on the next load. Recovery time
is a deploy.

The Gateway is a different matter. It is versioned outside this repository, and
a browser rollback does nothing about a Gateway change. If a Gateway change ever
breaks the response contract, reverting `main` will not help. Nothing is written
down about how a Gateway change is rolled back — that gap belongs in
[01 · Gateway](../01-live-systems/gateway.md).

## Recording one

Date, what was rolled back and to what, why, how long production was affected,
and — most usefully — the test that would have caught it.
