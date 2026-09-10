# Central

> **Status:** defined by owner decision 2026-09-10. **Not built, not in this
> repository** — the definition below is a boundary, not an implementation.
> **Lifecycle:** APPROVED FUTURE — boundary declared, implementation undefined
> **Last reviewed:** 2026-09-10

## What Central is

**Panchita Central is the orchestration layer.** It coordinates modules, tools,
workflows and authorized actions.

## What Central is not — the load-bearing constraint

**Central must NOT become the sole owner of identity or long-term memory.**

Identity, permissions and memory remain **logically separable capabilities with
explicit interfaces and security boundaries**. Central *consumes* only the
identity, permissions and memory context it is authorized to receive.

```
        ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
        │  IDENTITY   │   │ PERMISSIONS │   │   MEMORY    │
        │  (separable)│   │ (separable) │   │ (separable) │
        └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
               │ authorized      │ authorized      │ authorized
               │ context only    │ context only    │ context only
               └────────┬────────┴────────┬────────┘
                        ▼                 ▼
                 ┌────────────────────────────┐
                 │      PANCHITA CENTRAL      │
                 │   orchestration layer      │
                 │  modules · tools ·         │
                 │  workflows · authorized    │
                 │  actions                   │
                 └────────────────────────────┘
```

The arrows point one way on purpose. Central asks; it does not hold.

### Why the constraint exists

An orchestrator that owns identity, permissions and memory is a single component
that can grant itself anything and remember everything. Separating them keeps
four declared principles enforceable:

* [P3 · zero trust](../00-master-blueprint/principles.md#p3--security--zero-trust) —
  a boundary that verifies has to be a boundary someone else owns.
* [P4 · least privilege](../00-master-blueprint/principles.md#p4--least-privilege) —
  "authorized to receive" is meaningless if the receiver issues the
  authorization.
* [P5 · auditability](../00-master-blueprint/principles.md#p5--auditability) —
  a component cannot be the sole auditor of itself.
* [P7 · modular architecture](../00-master-blueprint/principles.md#p7--modular-architecture) —
  identity, permissions and memory must each be replaceable without replacing
  the orchestrator.

## Deliberately undefined

**No technical implementation is specified, and none should be inferred.** The
following are open and must not be invented:

* Where Central runs, and how it is reached.
* Its relationship to the [Gateway](gateway.md) — behind it, beside it, or is
  the Gateway a component of Central.
* The interfaces to identity, permissions and memory: protocol, shape, and how
  "authorized context" is expressed and verified.
* Whether Central is one service or several.
* What else talks to it besides Panchita.

## Current state

Nothing in this repository references Central. `index.html` and `voice-v2.html`
know exactly one back-end URL — the Gateway — and no second system.

So Central is **declared, not built**. It is filed under Live Systems because
that is where it will belong; today its lifecycle is APPROVED FUTURE.

## Related

* [10 · Platform Components](../10-platform-components/README.md) — the register
  Central belongs to
* [02 · Memory + Date-Time](../02-development/memory-and-date-time.md) — the
  memory capability Central must not absorb
* [04 · Permissions](../04-security/permissions.md) — the permissions capability
  Central must not absorb
* [04 · Guardian](../04-security/guardian.md) — what constrains the actions
  Central orchestrates
