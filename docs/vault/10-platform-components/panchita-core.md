# Panchita Core

> **Status:** concept — named in the Master Blueprint. No definition has been
> given and none is invented here.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known

The name is approved as a platform component. Nothing else about it has been
decided.

## The question this page exists to hold

**What is Core, given that [Central](../01-live-systems/central.md) is already
the orchestration layer?**

Two readings are possible and they are meaningfully different:

* **Core as the substrate** — the shared runtime, conventions and primitives
  that Central, modules and every other component are built *on*. Central would
  then be one thing that runs on Core.
* **Core as the essential Panchita** — the identity, reasoning and behaviour
  that make her *her*, independent of any surface or module.

Nothing in the blueprint distinguishes them, and building against the wrong one
would be expensive. This is the first question to answer, and it is an owner
decision.

## Possible relationship to what exists

The [Gateway](../01-live-systems/gateway.md) is currently the only thing that
behaves like a core: every request goes through it, and all reasoning and
routing happen behind it. Whether the Gateway is an early Core, a component of
one, or unrelated is **unknown** — the browser cannot see past it.

## Deliberately undefined

* Whether Core is a component, a layer, or a concept.
* Its relationship to Central, the Gateway, and the modules.
* Whether anything called Core exists today under another name.

## Related

* [01 · Central](../01-live-systems/central.md) — orchestration, definitely not
  this
* [01 · Gateway](../01-live-systems/gateway.md) — the only core-like thing that
  exists
* [00 · Architecture Map](../00-master-blueprint/architecture-map.md)
