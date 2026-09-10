# Panchita Master Blueprint

> **Status:** partial — the "what exists" half is sourced from this repository;
> the forward half is stubbed.
> **Source commit:** `origin/main` @ `149d94e`
> **Lifecycle:** MIXED — see the state table below
> **Basis:** `b01eb18` production · `149d94e` prototype
> **Last reviewed:** 2026-09-10

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

| Piece | Lifecycle | State | Page |
| --- | --- | --- | --- |
| Panchita Personal (`index.html`) | **CURRENT PRODUCTION** | Served from `main`; byte-identical to `b01eb18` | [01 · Panchita Personal](../01-live-systems/panchita-personal.md) |
| Gateway (n8n webhook) | **CURRENT PRODUCTION** | Single endpoint; contract known from the client side only | [01 · Gateway](../01-live-systems/gateway.md) |
| Voice v2 (`voice-v2.html`) | **DEPLOYED PROTOTYPE** · active development | Served from `main` for phone testing. **Not production.** Two hardware failures open | [02 · Voice v2](../02-development/voice-v2.md) |
| Offline voice suite | **CURRENT TEST** | 74 tests green on `main`, 4 files | [06 · Regression Tests](../06-testing/regression-tests.md) |
| Central | **CONCEPT ONLY** | Not in this repository, not referenced by it | [01 · Central](../01-live-systems/central.md) |

Both HTML files ship from `main`. Only one of them is production.

## The principles the code already obeys

These are not aspirations — each one is visible in the shipped source and is
recorded with its evidence in the [Constitution](constitution.md).

1. **Production is never the experiment.** Voice v2 exists as a separate *file*
   precisely so `index.html` keeps serving while the risky work happens. It has
   worked: four Voice v2 releases, zero bytes changed in production. The
   isolation is the file, not the branch — the branch was merged and production
   was still untouched.
2. **The confirmed interface is preserved.** New capability arrives as an
   addition to the existing markup, not a redesign of it.
3. **The secret leaves memory immediately.** The password is cleared from
   browser state the moment the login response returns, success or failure.
4. **Free until proven worth paying for.** Paid realtime voice is present in
   the code and switched off.
5. **A regression is a failing test.** The voice suite runs the shipped page
   itself, not a re-implementation of it. With the limit that offline tests
   model an engine, not a room: 74 pass while two failures reproduce on a real
   phone.

## What this blueprint does not yet cover

Unwritten, and needed before the map above is honest end to end:

* The relationship between Panchita Personal and Central — which one owns
  identity, which one owns memory, and what crosses between them.
* The module contract: how the Gateway decides which module answers, and what a
  module must expose to be routable.
* The data story: what is stored, where, for how long, and who may read it.

See [Vision](vision.md) and [Architecture Map](architecture-map.md).
