# Truck Repair

> **Status:** stub — the module is not in this repository. External assistant
> skills describe the work in detail.
> **Last reviewed:** 2026-09-09

## The business

J & L Truck Repair LLC. See
[01 · JL Truck Repair](../01-live-systems/jl-truck-repair.md) for the system;
this page is the capability.

## What the existing skills already cover

Three assistant skills exist outside this repository and describe the work as
it is done today:

| Area | Covered |
| --- | --- |
| Quoting and invoicing | Estimates and invoices for shop customers |
| Shopmonkey reporting | Receivables, real margin per job, mechanic pay at 40% of labour, fleet customers, unclosed quotes, inventory |
| Social content | Posts and review requests for the shop specifically |

Two facts in there are real operational rules worth surfacing, because they are
the kind of thing that gets lost: **mechanics are paid 40% of labour**, and
Shopmonkey is the system where job and inventory truth lives.

## What belongs on this page

* Which of those capabilities are actually wired into the Gateway, versus
  handled by the assistant conversationally.
* The Shopmonkey integration: credentials, read/write direction, refresh cadence.
* Document templates for quotes and invoices, and where issued documents go.
* The reports the owner actually asks for, and how fresh they must be.

## Open questions

* Is Shopmonkey read-only from Panchita's side?
* Do quotes and invoices get written back to Shopmonkey, or produced alongside it?
* Who besides Luis interacts with this module?
