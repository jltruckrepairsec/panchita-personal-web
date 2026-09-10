# Core Principles — Owner Declared

> **Status:** governing — declared by the owner on 2026-09-10. Evidence status
> per principle is assessed against this repository and is not a claim about
> systems the vault cannot see.
> **Lifecycle:** GOVERNING
> **Basis:** `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

> **Canonical page** for owner-declared principles. The
> [Constitution](constitution.md) is a different thing: rules **inferred from
> shipped code**. Where the two touch, this page states the intent and the
> Constitution states what the code actually does.

## How to read this page

A principle here is **declared**, which means it governs design decisions from
now on. Declaring it does not make it true of the current system, and the vault
must never imply otherwise. Each principle therefore carries an evidence status:

| Status | Meaning |
| --- | --- |
| **CURRENTLY EVIDENCED** | Something in this repository demonstrably does this |
| **PARTIALLY EVIDENCED** | Done in one place, absent in others |
| **NOT YET IMPLEMENTED / UNKNOWN** | Declared only, or the evidence lies outside this repository |

Nine of the fourteen are **NOT YET IMPLEMENTED / UNKNOWN**. That is the honest
state of a system whose front end is one HTML file, and it is the point of
writing them down now rather than later.

---

## P1 — Truth / no fabrication

Panchita does not invent facts, and neither does her documentation. Where
something is unknown, it is recorded as unknown.

**Status: PARTIALLY EVIDENCED.** The vault enforces it on itself — every page
declares Sourced or Stub, 48 citations resolve against a named commit, and stubs
state what is missing rather than guessing. Nothing enforces it on Panchita's
own answers, because that behaviour lives behind the Gateway.

---

## P2 — Privacy

Personal data is collected only where needed, held only as long as needed, and
never exposed to a surface that does not require it.

**Status: PARTIALLY EVIDENCED.** The browser is built this way: it never holds
the full phone number (only the last four digits, sent masked), clears the
password from memory on both the success and failure paths, and persists nothing
([04 · Authentication](../04-security/authentication.md)). What happens to
conversation content after it reaches the Gateway is unknown.

---

## P3 — Security / zero trust

No component is trusted because of where it sits. Every boundary verifies.

**Status: PARTIALLY EVIDENCED.** The client treats itself as untrusted and fails
safe: a `denied` response while holding a token clears state and returns to
login without retrying, and no request is ever sent without a token. That is one
boundary behaving correctly. There is no evidence about any other boundary, and
[04 · Authentication](../04-security/authentication.md) records a real gap — no
known limit on failed login attempts.

---

## P4 — Least privilege

Every actor gets the minimum access needed, and no more.

**Status: NOT YET IMPLEMENTED.** Authentication is currently binary: signed in
or not. A valid session grants whatever the Gateway will do. See
[04 · Permissions](../04-security/permissions.md).

---

## P5 — Auditability

What happened, who did it, and when, is recoverable after the fact.

**Status: NOT YET IMPLEMENTED.** No audit trail is known to exist. The cost has
already been paid once: [INC-001](../04-security/incident-history.md) was
reconstructed by reading source and writing tests, because no record of the
event existed. See [04 · Audit](../04-security/audit.md).

---

## P6 — Human approval for critical actions

Anything consequential — moving money, contacting a third party, writing to a
system of record — waits for a human.

**Status: NOT YET IMPLEMENTED.** Nothing in the system distinguishes a
consequential action from an ordinary reply. This is the principle
[04 · Guardian](../04-security/guardian.md) exists to carry, and it gates
[03 · Financial](../03-business-domains/financial.md).

---

## P7 — Modular architecture

Capabilities are separable, with explicit interfaces, so one can change without
the others.

**Status: PARTIALLY EVIDENCED.** The browser knows one URL and one message
shape and never names a module, so capability can be added without shipping a
new front end
([ADR-001](../07-change-history/architecture-decisions.md#adr-001--the-browser-holds-no-intelligence)).
That is real modularity at one seam. Below the Gateway, the module contract is
undocumented, so modularity there is asserted rather than demonstrated.

---

## P8 — Learn from errors and incidents

Every failure produces a written record and, where possible, a test.

**Status: CURRENTLY EVIDENCED.** This is the strongest principle in the system.
[INC-001](../04-security/incident-history.md) has a full post-mortem;
[05 · Lessons Learned](../05-knowledge/lessons-learned.md) carries nine lessons
each traced to an event; three of them were promoted into the
[Constitution](constitution.md); and each fix was verified by running its new
test against the pre-fix code.

---

## P9 — Benefit employees, customers and businesses

Panchita exists to make real work better for the people doing it, not to be
impressive.

**Status: NOT YET IMPLEMENTED / UNKNOWN.** No measure of benefit exists. The
nearest thing to evidence is small and telling: the `notSupported` voice message
names the actual cause (opening the link from WhatsApp instead of Chrome)
because someone hit it in the field. That is the principle at work at the
smallest possible scale.

---

## P10 — U.S.-first with global scalability

Built for U.S. operations now, without decisions that make other regions
impossible later.

**Status: NOT YET IMPLEMENTED / UNKNOWN.** Nothing in the front end is
region-specific, and nothing is region-aware either. The one place it will bite
first is time: the browser sends no timezone at all, so any date reasoning
happens on a clock nobody has decided about
([02 · Memory + Date-Time](../02-development/memory-and-date-time.md)).

---

## P11 — Multilingual support

Panchita works in the language the person actually speaks.

**Status: CURRENTLY EVIDENCED, for two languages.** Spanish-first
(`<html lang="es">`), with a full `es`/`en` string table for the interface and
for every voice failure message, and `language` sent on every Gateway request.
This is implemented, not aspirational. Whether Panchita's *answers* are equally
bilingual is a Gateway question.

---

## P12 — Documentation

The system is written down, and the writing is kept true.

**Status: CURRENTLY EVIDENCED.** This vault, and the fact that its last pass was
a truth-restoration rather than an expansion. Documentation that is allowed to
go stale fails this principle even while it exists.

---

## P13 — Backups / recoverability

State can be restored, and there is a known way back from a bad change.

**Status: PARTIALLY EVIDENCED.** For the front end, recovery is real and cheap:
static pages in git, no database, no persisted client state, so a revert plus a
deploy is a full restore ([07 · Rollbacks](../07-change-history/rollbacks.md)).
For everything behind the Gateway — workflows, credentials, any stored data —
there is no known backup story at all.

---

## P14 — Succession and governance

Panchita survives changes of owners, employees, vendors, models and
infrastructure.

**Status: NOT YET IMPLEMENTED.** This is what
[12 — Governance & Legacy](../12-governance-and-legacy/README.md) exists to
carry. The vault is the first artefact that serves it: institutional knowledge
that outlives the person who holds it in their head.

---

## Summary

| # | Principle | Evidence status |
| --- | --- | --- |
| P1 | Truth / no fabrication | Partially evidenced |
| P2 | Privacy | Partially evidenced |
| P3 | Security / zero trust | Partially evidenced |
| P4 | Least privilege | Not yet implemented |
| P5 | Auditability | Not yet implemented |
| P6 | Human approval for critical actions | Not yet implemented |
| P7 | Modular architecture | Partially evidenced |
| P8 | Learn from errors and incidents | **Currently evidenced** |
| P9 | Benefit employees, customers, businesses | Not yet implemented / unknown |
| P10 | U.S.-first, globally scalable | Not yet implemented / unknown |
| P11 | Multilingual support | **Currently evidenced** (es/en) |
| P12 | Documentation | **Currently evidenced** |
| P13 | Backups / recoverability | Partially evidenced |
| P14 | Succession and governance | Not yet implemented |

**3 evidenced · 5 partial · 6 not yet.** Re-assess this table whenever a
principle's evidence changes, and never quietly upgrade a row.
