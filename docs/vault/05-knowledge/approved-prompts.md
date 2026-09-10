# Approved Prompts

> **Status:** stub — no prompt is recorded in this repository.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is true today

The front end sends no prompt of any kind. It sends the owner's literal message
plus `language`, and the only text it originates is the throwaway greeting
"Hola" / "Hello" used to carry the login request
([01 · Gateway](../01-live-systems/gateway.md)).

Every prompt in the system therefore lives behind the Gateway or inside
assistant skills, neither of which is versioned here.

## What belongs here

* Prompts approved for production use, versioned, with the date approved.
* What each is for, and what it must never be used for.
* Language variants where both Spanish and English are needed.
* A changelog per prompt — a prompt edit is a behaviour change and should be
  traceable the same way code is.

## Known candidates

Two bodies of prompt-shaped text already exist and are unversioned:

* **Seller scripts, Spanish and English** — part of the wholesaling playbook.
  See [03 · Real Estate](../03-business-domains/real-estate.md).
* **Shop social content and review requests** — see
  [03 · Marketing](../03-business-domains/marketing.md).

Both are customer-facing text produced on the owner's behalf. That is exactly
the category that should be approved and frozen rather than regenerated
freshly each time.

## Open questions

* Is this page for prompts *given to* Panchita, or for text Panchita produces
  that has been approved for reuse? The two need different structures, and the
  name fits both.
* Who approves? For customer-facing text the answer matters legally, not just
  editorially.
