# Panchita Knowledge Vault

The single written record of the Panchita system: what it is, what is running,
what is being built, what broke, and what it costs.

Two kinds of page live here, and every page says which it is in its front
matter block:

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
* Source references are `path:line` against this repository at the commit named
  in the page. Line numbers drift — the surrounding quote is the real anchor.
* Secrets, tokens, endpoints and phone numbers are never copied into the vault.
  Pages point at the file that declares them instead.
* A page that is out of date is worse than a missing page. When a claim stops
  being true, change it or mark it stale in the same commit that breaks it.

## Scope of this repository

`panchita-personal-web` is the browser front end only:

```
index.html      Panchita Personal — production, served by GitHub Pages from main
voice-v2.html   Voice v2 prototype — branch only, never served from main
tests/          Offline regression suite for voice-v2.html
docs/vault/     This vault
```

Everything else in the map — Central, the Gateway workflows, the modules —
lives outside this repository. Those pages are stubs here by design and say so.
