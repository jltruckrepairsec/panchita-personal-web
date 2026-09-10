# Analytics

> **Status:** concept — named in the Master Blueprint. No definition given.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known

Approved as a platform component. No metrics, sources or surfaces decided.

## Analytics and Mission Control overlap

[Mission Control](../02-development/mission-control.md) is the operator's view of
the system; Analytics is measurement. The plausible split is *system health*
versus *business measurement* — but nothing states it, and if the two are never
distinguished they will be built twice.

## The prerequisite nobody can skip

Analytics measures something. Today the system records almost nothing:

* No audit trail exists ([04 · Audit](../04-security/audit.md)).
* No cost is tracked
  ([08 · Provider Costs](../08-cost-and-quality/provider-costs.md)).
* The browser persists nothing at all.

**So Analytics is blocked on there being data, not on being built.** The cost has
already been demonstrated: [INC-001](../04-security/incident-history.md)
generated unbounded traffic and no measurement noticed — it was stopped by a
rate limiter belonging to another component.

The measurable things that already exist are per-business and live in
[03 — Business Domains](../03-business-domains/README.md) — margin per job,
receivables, deal KPIs. Whether Analytics serves those or is separate is
undecided.

## Deliberately undefined

What is measured, where it is stored, who reads it, and how it relates to
Mission Control.

## Related

* [02 · Mission Control](../02-development/mission-control.md)
* [04 · Audit](../04-security/audit.md) — the missing input
* [08 · Budgets](../08-cost-and-quality/budgets.md)
