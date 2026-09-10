# 10 — Platform Components

> **Status:** section index — the register of platform capabilities.
> **Lifecycle:** VAULT INDEX
> **Last reviewed:** 2026-09-10

Platform components are the machinery Panchita is *made of*, as distinct from
[03 — Business Domains](../03-business-domains/README.md), which is the work she
*does for*.

Several components already have pages elsewhere and keep them — moving them
would break their history and their links. This section is the **register**: it
names every platform component in one place and says where each one lives.

## The register

| Component | Lifecycle | Home |
| --- | --- | --- |
| Panchita Core | CONCEPT ONLY | [here](panchita-core.md) |
| Panchita Personal | **CURRENT PRODUCTION** | [01 · Panchita Personal](../01-live-systems/panchita-personal.md) |
| Gateway | **CURRENT PRODUCTION** | [01 · Gateway](../01-live-systems/gateway.md) |
| Central | APPROVED FUTURE | [01 · Central](../01-live-systems/central.md) |
| API | CONCEPT ONLY | [here](api.md) |
| Memory | CONCEPT ONLY | [02 · Memory + Date-Time](../02-development/memory-and-date-time.md) |
| Builder | CONCEPT ONLY | [02 · Builder](../02-development/builder.md) |
| Guardian | CONCEPT ONLY | [04 · Guardian](../04-security/guardian.md) |
| Mission Control | CONCEPT ONLY | [02 · Mission Control](../02-development/mission-control.md) |
| Mentor | CONCEPT ONLY | [here](mentor.md) |
| Analytics | CONCEPT ONLY | [here](analytics.md) |
| Standards | CONCEPT ONLY | [here](standards.md) |
| Network | CONCEPT ONLY | [here](network.md) |

**2 of 13 exist.** Everything else is a name with a boundary, at most.

## The constraint that shapes this whole section

[Central](../01-live-systems/central.md) orchestrates, but **identity,
permissions and memory stay separable** with their own interfaces and security
boundaries. That single rule is why Memory has its own entry rather than being
folded into Central, and why permissions are tracked in
[04](../04-security/permissions.md) rather than here.

## Nothing here is scheduled

Every `CONCEPT ONLY` page in this section is a parking space. The execution
priority is [Truck Repair v1.0](../00-master-blueprint/execution-priority.md),
and a page in this register creates no commitment to build it.
