# Permissions

> **Status:** design principles declared by owner 2026-09-10. **No permissions
> model exists and no actual permissions are assigned** — the principles below
> constrain a future model, they do not describe one.
> **Lifecycle:** APPROVED FUTURE — principles declared, model undefined
> **Last reviewed:** 2026-09-10

## Multi-user is the design target

Luis is the primary current owner and user. **Panchita must be designed for
multiple authorized users and roles.** Examples the owner has named — employees,
managers, administrators, business owners, customers, specialized operators —
are illustrations, not a role list.

**No actual permissions are assigned yet, and none should be invented.**

### Declared principles for any future model

These constrain whatever gets built. They are binding on the design; none is
implemented.

1. **Least privilege.** Minimum access needed, never more —
   [P4](../00-master-blueprint/principles.md#p4--least-privilege).
2. **Explicit authorization.** Access is granted, never assumed or defaulted.
3. **Role separation.** Roles are distinct, and one role does not silently
   contain another.
4. **Auditability.** Every grant, use and change of access is recoverable
   afterwards — [P5](../00-master-blueprint/principles.md#p5--auditability).
5. **Human approval for critical actions** —
   [P6](../00-master-blueprint/principles.md#p6--human-approval-for-critical-actions).
6. **No privilege escalation through prompts.** What someone types cannot widen
   what they may do.
7. **Identity and permissions must not be inferred from conversational claims
   alone.** "I am the manager" is text, not authentication.

Principles 6 and 7 are the ones specific to an assistant, and they are the
easiest to violate by accident. A conversational system takes instructions in
the same channel as it takes content, so the boundary between *asking for
something* and *claiming the right to it* has to be enforced structurally —
never by how convincing the sentence is. This is the conversational form of
[P3 · zero trust](../00-master-blueprint/principles.md#p3--security--zero-trust),
and it is why identity must stay separable from
[Central](../01-live-systems/central.md).

## What is true today

Authentication is binary: signed in or not. A valid `session_token` grants
whatever the Gateway will do, and the browser draws no distinction between
capabilities — there is one message field and one reply.

For a single-owner assistant that is a defensible starting point, not an
oversight. It stops being defensible at the first of these:

* A second human uses Panchita (staff, office, mechanics).
* A module can move money — [03 · Financial](../03-business-domains/financial.md).
* A module holds data about third parties —
  [03 · Recruiter](../03-business-domains/recruiter.md).

All three are now in the map, and the owner has declared multi-user as the
design target — so this page has moved from theoretical to pending.

## What belongs here

* The subjects: who or what can act — owner, staff, Panchita herself acting
  autonomously.
* The objects: modules, data, external systems.
* The verbs, with read and write separated. Reporting on receivables and
  initiating a payment must never be the same grant.
* Where the model is enforced. It cannot be the browser.
* How a grant is changed, and by whom.

## The design constraint that already exists

The browser must stay dumb. It sends one message shape and renders one reply,
and it knows nothing about modules — that is what makes new capability shippable
without touching the front end
([Architecture Map](../00-master-blueprint/architecture-map.md)). A permissions
model that requires the client to know what it may ask for would break that
property. Enforcement belongs in the Gateway.

## Open questions

* Which roles actually exist first? The owner named examples deliberately, not a
  list — deriving a role model from those examples would be inventing
  permissions.
* Does Panchita ever act without a human turn — scheduled work, triggers? If so
  she is a subject in the model, not just a conduit.
* Where is the model enforced? It cannot be the browser, and Central must not
  own it ([Central](../01-live-systems/central.md)). That leaves a separable
  permissions capability whose home is not yet decided.

**Not urgent yet.** Multi-user is the design target, not current work — the
execution priority is
[Truck Repair v1.0](../00-master-blueprint/execution-priority.md). What matters
now is that nothing built for v1.0 makes these principles harder to honour
later.
