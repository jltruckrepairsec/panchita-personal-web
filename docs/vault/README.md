# Panchita Knowledge Vault

> **Status:** vault index — conventions and map.
> **Lifecycle:** VAULT INDEX
> **Last reviewed:** 2026-09-10

The single written record of the Panchita system: what it is, what is running,
what is being built, what broke, and what it costs.

Every page carries a front-matter block with four fields: `Status`,
`Lifecycle`, `Basis` (where evidence supports one) and `Last reviewed`.

## Lifecycle — read this before trusting any page

**Deployed is not production.** An artefact can be on `main` and publicly
reachable and still be a prototype under active development. The vault must
never let one look like the other, so `Lifecycle` is a required field:

| Value | Meaning |
| --- | --- |
| `CURRENT PRODUCTION` | The official experience. Today: `index.html` only |
| `DEPLOYED PROTOTYPE` | Publicly reachable, deliberately, but not production. Today: `voice-v2.html` |
| `CURRENT TEST` | Test assets and results |
| `APPROVED FUTURE` | Decided, not built |
| `CONCEPT ONLY` | Named, not defined |
| `DEPRECATED` | Removed, recorded so it is not rebuilt |

Modifiers may be appended: `ACTIVE DEVELOPMENT`, `HARDWARE VERIFICATION
PENDING`, `UNDER REVIEW`.

Vault-internal pages use `VAULT INDEX`, `GOVERNING`, `HISTORICAL RECORD` or
`PLANNING`.

## Status

Two kinds of page live here:

* **Sourced** — the content is derived from something checked in (a file, a
  commit, a test). Each claim points at its source so it can be re-verified.
* **Stub** — the section exists in the map but has no source in this repository
  yet. It states what belongs there and what is unknown. A stub is never
  filled with a guess.

## Map

| # | Section | Holds |
| --- | --- | --- |
| [00](00-master-blueprint/) | Master Blueprint | Intent: **priority**, **principles**, vision, constitution, architecture |
| [01](01-live-systems/) | Live Systems | What is deployed and serving today |
| [02](02-development/) | Development | What is being built now, not production |
| [03](03-business-domains/) | Business Domains | The work Panchita does *for* |
| [04](04-security/) | Security | Auth, permissions, audit, incidents |
| [05](05-knowledge/) | Knowledge | SOPs, research, lessons, approved prompts |
| [06](06-testing/) | Testing | Plans, regression suites, hardware tests, results |
| [07](07-change-history/) | Change History | Decisions, releases, rollbacks, deprecations |
| [08](08-cost-and-quality/) | Cost & Quality | Cost rules, budgets, provider costs, quality |
| [09](09-backlog/) | Backlog | Now / Next / Later / Blocked |
| [10](10-platform-components/) | Platform Components | The machinery Panchita is *made of* |
| [11](11-learning-and-simulation/) | Learning & Simulation | Teaching, discovery, rehearsal |
| [12](12-governance-and-legacy/) | Governance & Legacy | Who decides, and what endures |

Sections 10–12 were added on 2026-09-10 so every approved Master Blueprint
concept has an explicit home. **A home is not a work item** — see below.

## Start here

* **[00 · Execution Priority](00-master-blueprint/execution-priority.md)** —
  finish Truck Repair v1.0 first. Read this before section 10, 11 or 12 makes
  anything look urgent.
* [00 · Core Principles](00-master-blueprint/principles.md) — the 14
  owner-declared principles, each with an honest evidence status.
* [01 · Panchita Personal](01-live-systems/panchita-personal.md) — the only
  thing in production.

## Documenting ≠ committing

A page in sections 10–12 with lifecycle `CONCEPT ONLY` is a **parking space, not
a queue ticket**. It creates no commitment, no roadmap position and no priority.
Real work lives in [09 — Backlog](09-backlog/).

One concept carries a stronger cap:
[Panchita Coin / Economy](12-governance-and-legacy/panchita-coin-economy.md) is
**not a project, not a commitment, not a token launch, not a financial product
and not a roadmap priority.** Read that page before referring to it anywhere.

## Names that collide, deliberately

| Both are correct | This one | And this one |
| --- | --- | --- |
| **Legacy** | [12 · Legacy](12-governance-and-legacy/legacy.md) — continuity and succession | [07 · Deprecated](07-change-history/deprecated.md) — obsolete mechanisms |
| **Standards** | [10 · Standards](10-platform-components/standards.md) — ecosystem governance | [08 · Quality Standards](08-cost-and-quality/quality-standards.md) — engineering quality |
| **Vision** | [00 · Vision](00-master-blueprint/vision.md) — strategic direction | [00 · Master Blueprint](00-master-blueprint/panchita-master-blueprint.md) — the map that executes it |

## Conventions

* One leaf of the map = one Markdown file. Section folders carry a `README.md`
  index only.
* Source references are `path:line` against the commit named in the page's
  `Basis`. Citations into `voice-v2.html` are pinned as `path:line @commit`
  because that file is under active development and its line numbers move.
  Line numbers drift regardless — the surrounding quote is the real anchor.
* A page describing work owned by another session records **findings**, never
  that session's design as settled architecture.
* Secrets, tokens, endpoints and phone numbers are never copied into the vault.
  Pages point at the file that declares them instead.
* A page that is out of date is worse than a missing page. When a claim stops
  being true, change it or mark it stale in the same commit that breaks it.

## Scope of this repository

`panchita-personal-web` is the browser front end only:

```
index.html      Panchita Personal — CURRENT PRODUCTION, served from main.
                Byte-identical to b01eb18; no Voice v2 commit has altered it.
voice-v2.html   Voice v2 — DEPLOYED PROTOTYPE, also served from main so it can
                be loaded on a real Android phone. Not production.
                Active development; two hardware failures open.
tests/          Offline suite for voice-v2.html (74 tests on main)
docs/vault/     This vault
```

`main` is at `149d94e`. **Both HTML files ship from it, with different
lifecycles** — that is the single most important fact for reading this vault
correctly.

Everything else in the map — Central, the Gateway workflows, the modules —
lives outside this repository. Those pages are stubs here by design and say so.
