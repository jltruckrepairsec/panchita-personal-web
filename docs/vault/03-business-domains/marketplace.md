# Marketplace

> **Status:** concept — named in the Master Blueprint. No definition given.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known

Approved as a business domain. Who trades with whom is undecided.

## The readings

* **A marketplace the businesses use** — sourcing parts, subcontractors,
  vendors. Closest to [Truck Repair](truck-repair.md), where parts and inventory
  are already tracked in Shopmonkey.
* **A marketplace Panchita operates** — matching buyers and sellers as a
  business in its own right. Wholesaling already does something adjacent:
  cash-buyer lists are a two-sided matching problem
  ([Real Estate](real-estate.md)).
* **A marketplace of Panchita capabilities** — modules or skills offered to
  others. That reading is really a product decision about
  [10 · API](../10-platform-components/api.md), not a business domain.

## Why the third reading needs flagging

If Marketplace means offering Panchita's capabilities to outside parties, it
changes the security posture of the entire system rather than adding a module:
external users, external data, and authorization that must hold against people
the owner does not employ. That would make
[04 · Permissions](../04-security/permissions.md) a hard prerequisite and
[10 · API](../10-platform-components/api.md) a real obligation with versioning
and support.

Filing that under "business domains" would understate it considerably. Worth
knowing which reading is meant before anyone treats this as a module-sized idea.

## Deliberately undefined

Everything, including whether this belongs in this section.

## Related

* [10 · API](../10-platform-components/api.md)
* [10 · Network](../10-platform-components/network.md) — overlapping ambiguity
* [04 · Permissions](../04-security/permissions.md)
