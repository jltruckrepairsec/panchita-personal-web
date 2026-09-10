# Mission Control

> **Status:** stub — no source in this repository.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What belongs here

The operator's view of Panchita: what is running, what it cost, what failed,
what is queued. Distinct from Panchita Personal, which is the conversational
surface — Mission Control is the surface for looking at the system rather than
talking to it.

Candidate contents, none confirmed:

* Live status of the Gateway and each module.
* Recent turns, errors, and rate-limit hits.
* Cost to date against the budgets in
  [08](../08-cost-and-quality/budgets.md).
* Session and auth activity, feeding
  [04 · Audit](../04-security/audit.md).

## The one piece that already exists

The diagnostic panel in `index.html` is a miniature of this idea for exactly
one subsystem: it reports voice state — constructor, secure context,
permissions, which callbacks fired, error codes, timeouts — because those
failures are otherwise invisible from a phone.

It was built for debugging, and the regression suite now reads its counters as
the test surface. That is worth noting before Mission Control is designed: an
operator view that tests can also read is more valuable than one only humans
read.

## Open questions

* Who is the user — only Luis, or staff?
* Is it a separate page in this repository, a separate deployment, or a mode
  inside Panchita Personal?
* Does it read from the Gateway, or from something the Gateway writes to?
