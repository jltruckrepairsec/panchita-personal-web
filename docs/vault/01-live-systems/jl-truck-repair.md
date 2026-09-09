# JL Truck Repair

> **Status:** stub — the business is real and operational; its Panchita-facing
> system is not in this repository.
> **Last reviewed:** 2026-09-09

## What is known

J & L Truck Repair LLC is one of the owner's businesses and one of the systems
in the map. This repository contains no code for it.

Outside the repository, three assistant skills already exist covering shop
operations — quoting and invoicing, Shopmonkey reporting (receivables, real
margin per job, mechanic pay at 40% of labour, fleet customers, open quotes,
inventory), and shop social content. Those skills are the closest thing to a
written specification of what this system does today.

That is a pointer, not a source. The skills live in the assistant
configuration, not here, and are not versioned alongside this vault.

## What belongs on this page

* What "JL Truck Repair" means as a *system*: which surfaces exist, what runs
  where, and who uses it.
* Its Shopmonkey integration — read-only or read/write, which account, what is
  synced and how often.
* How it is reached: through the Gateway like everything else, or directly?
* The data it holds, and where.

## Open questions

* Is this a distinct deployed system or the shop-facing behaviour of the same
  Gateway?
* Does anyone besides the owner use it — mechanics, office staff?
* Is Shopmonkey the system of record, with Panchita reading it, or does
  Panchita write back?

Related: [03 · Truck Repair](../03-modules/truck-repair.md) covers the
capability; this page is meant to cover the deployment.
