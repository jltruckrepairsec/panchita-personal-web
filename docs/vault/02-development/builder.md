# Builder

> **Status:** stub — no source in this repository, and the concept itself is
> not defined anywhere the vault can see.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What belongs here

The name suggests something that creates parts of Panchita rather than being
part of it — a way to add a module, a workflow or a skill without hand-editing
n8n. That reading is inference from the name alone and should be confirmed
before anything is built against it.

If that reading is right, the page would need:

* What can be built: modules, workflows, prompts, skills?
* Who may build — is this an owner tool or an assistant capability?
* What stops a generated component from reaching production unreviewed. This is
  the important one: [C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment)
  says production is never the experiment, and a builder is a machine for
  producing experiments.
* Where built artefacts are stored and versioned.

## Open questions

* Is Builder a tool Luis uses, or something Panchita does on her own?
* Does it write to this repository, to n8n, or somewhere else?
* What is the review gate?

Until the first question is answered this page cannot be written, and nothing
should be built against the name.
