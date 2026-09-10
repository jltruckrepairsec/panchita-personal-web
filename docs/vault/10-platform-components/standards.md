# Panchita Standards

> **Status:** scope defined by owner decision 2026-09-10. **No standard is
> written and none is invented here.**
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What Panchita Standards is

**The global standards and governance capability for the Panchita ecosystem:**
system-wide rules, interoperability expectations, operating standards and
approved conventions.

## What it is not

**It is not [08 · Quality Standards](../08-cost-and-quality/quality-standards.md).**
The two share a word and nothing else:

| | Panchita Standards (this page) | Quality Standards (08) |
| --- | --- | --- |
| Scope | The whole ecosystem | Engineering and testing |
| Governs | How components interoperate and operate | How code and tests are held to a bar |
| Example | "Every module exposes X" | "A bug is closed by a test that fails without the fix" |
| Lifecycle | CONCEPT ONLY | GOVERNING, evidenced |

Filing a rule in the wrong one makes it invisible to the people who need it.

## Where it sits among the governance-shaped concepts

Three approved concepts govern, and they govern different things:

* **Standards** — the *rules the system follows*. Conventions, interoperability,
  operating expectations.
* [**Governance**](../12-governance-and-legacy/governance.md) — *who decides*,
  and how decisions are made and changed.
* [**Guardian**](../04-security/guardian.md) — *what is enforced at runtime*,
  and what Panchita refuses to do.

A standard without governance is a suggestion; governance without enforcement is
paperwork. All three are CONCEPT ONLY today.

## What already behaves like a standard

Two things in this vault are proto-standards, written before the capability was
named:

* The [Constitution](../00-master-blueprint/constitution.md) — ten rules
  inferred from shipped code, where breaking one is a defect rather than a
  preference.
* The [Core Principles](../00-master-blueprint/principles.md) — fourteen
  owner-declared governing principles.

Whether Panchita Standards eventually absorbs these, or sits above them, is
undecided. They are not moved.

## Deliberately undefined

The standards themselves, how one is proposed, approved, versioned or retired,
and what happens when a component does not comply.

## Related

* [08 · Quality Standards](../08-cost-and-quality/quality-standards.md) — the
  other Standards
* [00 · Constitution](../00-master-blueprint/constitution.md)
* [12 · Governance](../12-governance-and-legacy/governance.md)
