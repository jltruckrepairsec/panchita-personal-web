# Panchita Master Blueprint

> **Status:** partial — the "what exists" half is sourced from this repository;
> the forward half is stubbed.
> **Source commit:** `ed568e6`
> **Last reviewed:** 2026-09-09

## What Panchita is

An assistant reachable from a phone browser, speaking Spanish first, that
authenticates its owner and answers through a single hosted workflow endpoint.
The browser holds no intelligence of its own — it is a transport, a session
holder and a voice interface. All reasoning, all module routing and all data
access happen behind the Gateway.

That split is the load-bearing decision of the whole system:

```
  phone browser            hosted workflow            modules / data
  ─────────────            ───────────────            ──────────────
  index.html      ──POST──▶   Gateway    ──────────▶  truck repair
  session token   ◀──JSON──   (n8n)                   financial
  speech in/out                                       real estate, …
```

The browser knows one URL and one message shape. Adding a capability never
requires shipping a new front end.

## What is actually running

| Piece | State | Page |
| --- | --- | --- |
| Panchita Personal (`index.html`) | Production, GitHub Pages from `main` | [01 · Panchita Personal](../01-live-systems/panchita-personal.md) |
| Gateway (n8n webhook) | Production, single endpoint | [01 · Gateway](../01-live-systems/gateway.md) |
| Voice v2 (`voice-v2.html`) | Prototype on branch, not served | [02 · Voice v2](../02-development/voice-v2.md) |
| Offline voice regression suite | Green, 3 files | [06 · Regression Tests](../06-testing/regression-tests.md) |
| Central | Not in this repository | [01 · Central](../01-live-systems/central.md) |

## The principles the code already obeys

These are not aspirations — each one is visible in the shipped source and is
recorded with its evidence in the [Constitution](constitution.md).

1. **Production is never the experiment.** Voice v2 exists as a separate page
   on an unmerged branch precisely so that `index.html` keeps serving while the
   risky work happens.
2. **The confirmed interface is preserved.** New capability arrives as an
   addition to the existing markup, not a redesign of it.
3. **The secret leaves memory immediately.** The password is cleared from
   browser state the moment the login response returns, success or failure.
4. **Free until proven worth paying for.** Paid realtime voice is present in
   the code and switched off.
5. **A regression is a failing test.** The voice suite runs the shipped page
   itself, not a re-implementation of it.

## What this blueprint does not yet cover

Unwritten, and needed before the map above is honest end to end:

* The relationship between Panchita Personal and Central — which one owns
  identity, which one owns memory, and what crosses between them.
* The module contract: how the Gateway decides which module answers, and what a
  module must expose to be routable.
* The data story: what is stored, where, for how long, and who may read it.

See [Vision](vision.md) and [Architecture Map](architecture-map.md).
