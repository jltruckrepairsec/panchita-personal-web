# Current Execution Priority

> **Status:** governing — declared by the owner on 2026-09-10.
> **Lifecycle:** GOVERNING
> **Last reviewed:** 2026-09-10

## The priority

# Finish **Panchita Truck Repair v1.0** first.

Everything else in this vault is documented, preserved and **not started**.

## What this page is for

The [Master Blueprint](panchita-master-blueprint.md) now maps 31 long-term
concepts across four families, and
[10](../10-platform-components/README.md),
[11](../11-learning-and-simulation/README.md) and
[12](../12-governance-and-legacy/README.md) exist to give every one of them a
home.

**A home in the vault is not a work item.** Writing an idea down is how it stops
occupying attention — the opposite of scheduling it. This page exists because a
large, well-organised map is the most persuasive possible invitation to start
building the wrong thing.

## The rule

> Documenting a concept creates **no** commitment to build it, no roadmap
> position, and no priority. A concept page is a parking space, not a queue
> ticket.

Anything that is genuinely next lives in [09 · Next](../09-backlog/next.md).
Anything with a date lives in [09 · Now](../09-backlog/now.md). A page in
sections 10–12 with lifecycle `CONCEPT ONLY` is neither.

## What counts as work on the priority

Truck Repair v1.0 is the deliverable. Work that serves it:

* Anything in [03 · Truck Repair](../03-business-domains/truck-repair.md).
* The Gateway contract, because every module including this one depends on
  it — [01 · Gateway](../01-live-systems/gateway.md).
* Shopmonkey integration questions, since that is where shop truth lives.

Work that does **not** serve it, however reasonable it looks: new modules, new
platform components, and anything in 10–12.

## The honest caveat

Truck Repair v1.0 is not scoped anywhere in this vault. Its page is a stub, its
system page is a stub, and the module contract it would need is undocumented.

So the priority is clear and its definition of done is not. **Scoping v1.0 is
therefore the first piece of work the priority implies**, and it is an owner
decision, not something the vault can derive — see
[09 · Blocked](../09-backlog/blocked.md).

## What still gets attention regardless

Two things are maintenance, not new building, and are not in competition with
the priority:

* **Voice v2's two open hardware failures**, owned by another session —
  [06 · Physical Tests](../06-testing/physical-tests.md).
* **Keeping this vault true.** A stale vault is worse than no vault
  ([P12](principles.md#p12--documentation)).
