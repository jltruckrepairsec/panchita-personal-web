# AI Council

> **Status:** concept — named in the Master Blueprint. No definition given.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known

Approved as a governance/long-horizon concept. Nothing about its composition or
authority is decided.

## The two readings

* **A council *of* AIs** — several models or agents deliberating, cross-checking
  or voting before something consequential happens.
* **A council *about* AI** — a human body governing how AI is used: what
  Panchita may do, what requires approval, what is off limits.

The second is closer to
[Governance](governance.md) and to
[P6 · human approval for critical actions](../00-master-blueprint/principles.md#p6--human-approval-for-critical-actions).
The first is an architectural pattern.

## The constraint that applies either way

If AI Council ever *decides* anything, one declared principle governs it before
any design begins:

> **Identity and permissions must not be inferred from conversational claims
> alone** — [04 · Permissions](../04-security/permissions.md).

A deliberating council is a system where components persuade each other in
natural language. That is precisely the channel where authority must not be
grantable by argument. Whatever this becomes, its decisions have to be bounded
by something outside the conversation.

## Deliberately undefined

Who or what sits on it, what it has authority over, how it is convened, and
whether it is advisory or binding.

## Related

* [Governance](governance.md)
* [04 · Guardian](../04-security/guardian.md) — runtime enforcement
* [04 · Permissions](../04-security/permissions.md)
