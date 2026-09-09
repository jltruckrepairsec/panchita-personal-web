# Rollbacks

> **Status:** sourced — none have occurred.
> **Last reviewed:** 2026-09-09

## Record

**No rollback has ever been performed.** The history is linear: three commits on
`main`, three on the Voice v2 branch, no reverts, no resets, nothing withdrawn
after release.

That is a real fact about the project, not an empty page.

## Why there has been nothing to roll back

The two serious failures so far — cumulative-final flooding and the self-echo
loop — both happened in `voice-v2.html`, on a branch that GitHub Pages never
serves. Neither reached production, so neither needed withdrawing. They were
fixed forward on the branch.

This is the payoff of ADR-004 measured directly: two production incidents
avoided, zero rollbacks required.

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
