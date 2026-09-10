# API

> **Status:** concept — named in the Master Blueprint. **No API is specified,
> and none is invented here.**
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known

"API" is approved as a platform component. No interface, endpoint, schema,
authentication method or contract has been decided.

**Nothing on this page should be read as a specification.** Inventing an API is
explicitly out of scope for the vault.

## The one API-shaped thing that already exists

The [Gateway](../01-live-systems/gateway.md) has a request and response contract
that the browser already depends on: three request shapes, four `status` values,
and a session token that may be re-issued on any turn. It is undocumented on the
server side and was never designed as a public interface.

That contract is the natural starting point for whatever this component becomes,
and writing it down is already on the roadmap —
[09 · X2](../09-backlog/next.md#x2--write-the-gateway-contract). Doing that is
documentation of something real; designing an API is not.

## The question this page holds

**Who is the API for?** The answer changes everything downstream:

* *Panchita's own surfaces* — a second client, Mission Control, a mobile app.
  Then this is an internal contract and versioning is cheap.
* *Third parties* — customers, vendors, other systems. Then authentication,
  rate limiting, versioning guarantees, documentation and support all become
  real obligations, and
  [04 · Permissions](../04-security/permissions.md) becomes a prerequisite
  rather than a nicety.

## Deliberately undefined

Everything: protocol, shape, authentication, versioning, audience, and whether
this is one API or several.

## Related

* [01 · Gateway](../01-live-systems/gateway.md) — the existing, undocumented
  contract
* [04 · Permissions](../04-security/permissions.md) — a prerequisite for any
  external audience
* [12 · Governance](../12-governance-and-legacy/governance.md)
