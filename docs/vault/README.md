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
| [00](00-master-blueprint/) | Master Blueprint | The intent: vision, constitution, architecture, roadmap |
| [01](01-live-systems/) | Live Systems | What is deployed and serving today |
| [02](02-development/) | Development | What is being built now, not yet production |
| [03](03-modules/) | Modules | Business capability areas Panchita covers |
| [04](04-security/) | Security | Auth, permissions, audit, incidents |
| [05](05-knowledge/) | Knowledge | SOPs, research, lessons, approved prompts |
| [06](06-testing/) | Testing | Plans, regression suites, hardware tests, results |
| [07](07-change-history/) | Change History | Decisions, releases, rollbacks, deprecations |
| [08](08-cost-and-quality/) | Cost & Quality | Cost rules, budgets, provider costs, standards |
| [09](09-backlog/) | Backlog | Now / Next / Later / Blocked |

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
