# Financial

> **Status:** stub — no source in this repository, no external skill either.
> **Last reviewed:** 2026-09-09

## What belongs here

Money across all of the owner's businesses, as opposed to the per-job margin
work that sits inside [Truck Repair](truck-repair.md).

* Which entities are in scope — J & L Truck Repair LLC, J & J Real Development
  Inc, personal.
* Sources of truth: bank feeds, Shopmonkey, spreadsheets, accountant.
* What Panchita is allowed to *see*, and separately what she is allowed to *do*.
  Read-only reporting and payment initiation are different modules wearing the
  same name, and conflating them is the risk on this page.
* Recurring outputs: cash position, receivables, payroll, tax set-aside.

## Why this is the highest-risk module to build

Everything else in section 03 is advisory. This one touches money, and the
security model in [04](../04-security/) is not written yet. The permissions and
audit pages should be real before this module is.

## Open questions

* Read-only, or does Panchita ever move money?
* Is there an accountant in the loop whose systems are authoritative?
* How does this relate to the receivables reporting already covered by the
  Shopmonkey skill — is that a subset of this, or separate?
