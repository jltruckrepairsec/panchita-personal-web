# 03 — Modules

> **Status:** section index.
> **Lifecycle:** VAULT INDEX
> **Last reviewed:** 2026-09-10

Business capability areas Panchita covers. A module is a *what she can do*;
[01 — Live Systems](../01-live-systems/) is a *where it runs*.

None of these are visible from this repository. The browser never names a
module and never routes — it sends one message and renders one reply, and
whatever selection happens, happens inside the Gateway. Every page here is
therefore a stub, and the richer ones are richer only because assistant skills
outside this repository describe the work.

| Page | Status |
| --- | --- |
| [Truck Repair](truck-repair.md) | Stub — external skills describe the work |
| [Financial](financial.md) | Stub |
| [Real Estate](real-estate.md) | Stub — external skill describes the work |
| [Marketing](marketing.md) | Stub — external skill describes the work |
| [University](university.md) | Stub |
| [Recruiter](recruiter.md) | Stub |
| [Future Modules](future-modules.md) | Stub |

## The missing contract

Before any of these can be documented properly, one thing has to be written
down: **what a module is, technically.** How the Gateway picks one, what it
receives, what it must return, and whether modules can call each other.

That is the "module routing made legible" item on the
[Roadmap](../00-master-blueprint/roadmap.md), and it blocks this entire
section.

## A note on the external skills

Several modules below reference assistant skills that already exist outside
this repository. Those skills are the closest thing to a written specification
of the work, but they are configuration, not source — they are not versioned
with this vault and can change without a commit here. Treat them as pointers,
never as the record.
