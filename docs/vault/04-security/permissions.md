# Permissions

> **Status:** stub — there is no permissions model. The system has one user.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is true today

Authentication is binary: signed in or not. A valid `session_token` grants
whatever the Gateway will do, and the browser draws no distinction between
capabilities — there is one message field and one reply.

For a single-owner assistant that is a defensible design, not an oversight. It
stops being defensible at the first of these:

* A second human uses Panchita (staff, office, mechanics).
* A module can move money — [03 · Financial](../03-modules/financial.md).
* A module holds data about third parties —
  [03 · Recruiter](../03-modules/recruiter.md).

Two of those three are already in the module map.

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

* Will anyone other than Luis ever sign in? The answer determines whether this
  page is urgent or theoretical.
* Does Panchita ever act without a human turn — scheduled work, triggers? If so
  she is a subject in the model, not just a conduit.
