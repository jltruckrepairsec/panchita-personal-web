# Panchita Legacy

> **Status:** meaning defined by owner decision 2026-09-10. No implementation
> given and none invented.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What Panchita Legacy means

**Continuity.** Succession, preservation of institutional knowledge, long-term
stewardship, and the ability for Panchita to survive changes in **owners,
employees, vendors, models and infrastructure**.

## What it does not mean

**Not deprecated or legacy software.** That is
[07 · Deprecated](../07-change-history/deprecated.md) — obsolete or replaced
technical mechanisms.

The word collision is real and both meanings are kept, because both are correct
in their own domain. Anything filed in the wrong one becomes invisible to the
people who need it.

## The five things Panchita must survive

Each is a different kind of loss, and the vault can already say something honest
about how exposed the system is to each:

| Change | Current exposure |
| --- | --- |
| **Owners** | Total. Almost everything about intent lives with Luis; [00 · Vision](../00-master-blueprint/vision.md) is still empty |
| **Employees** | High. [05 · SOPs](../05-knowledge/sops.md) is empty — the project's most valuable procedure is followed and unwritten |
| **Vendors** | Unknown. n8n, Shopmonkey and the LLM provider are all single points with no recorded alternative or exit |
| **Models** | Unknown. Nothing records which model is behind the Gateway, so nothing could tell what changing it would break |
| **Infrastructure** | Low for the front end — static pages in git, recovery is a revert plus a deploy. Unknown for everything else, and [P13](../00-master-blueprint/principles.md#p13--backups--recoverability) records no backup story behind the Gateway |

That table is the useful content of this page today. It is not a plan; it is an
honest inventory of what is currently unsurvivable.

## What already serves Legacy

**This vault.** It is the first artefact in the project whose purpose is to
outlive the person who holds the knowledge. The truth-restoration pass that
preceded this one matters for the same reason: documentation allowed to go stale
fails continuity while appearing to serve it.

## Deliberately undefined

Whether Legacy is a capability, a set of practices, or a legal structure; how
succession is triggered; and what "Panchita survives" means concretely for a
system nobody else currently operates.

## Related

* [Succession](succession.md) — the mechanism, if Legacy is the goal
* [Foundation](foundation.md)
* [07 · Deprecated](../07-change-history/deprecated.md) — the *other* Legacy
* [P14](../00-master-blueprint/principles.md#p14--succession-and-governance)
