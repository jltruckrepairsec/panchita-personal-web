# Budgets

> **Status:** stub — no budget exists.
> **Last reviewed:** 2026-09-09

## What is true today

No budget is set, no spend is tracked, and no alert exists. The only cost
control in the system is architectural: use free browser capabilities, keep the
paid path switched off
([Cost Constitution](cost-constitution.md)).

## What belongs here

* A monthly ceiling for the whole system, and a per-service breakdown.
* What happens on approach and on breach — alert, degrade, or stop.
* Who is alerted, and where. The owner's interface is a phone browser, so an
  alert has to reach him somewhere he actually looks.
* Whether any module gets its own budget. Anything that calls an LLM per turn
  should.

## Prerequisite

A budget needs [Provider Costs](provider-costs.md) filled in first, and that
page is largely unknown. Setting a ceiling before knowing the floor produces a
number that means nothing.

## The reason this is not merely hygiene

[INC-001](../04-security/incident-history.md) generated unbounded Gateway
traffic until a rate limit stopped it. Nothing measured that traffic, nothing
alerted on it, and the only reason the cost was small is that the loop ran on
one phone for a short time. A budget alert would have caught it independently of
anyone watching the screen.
