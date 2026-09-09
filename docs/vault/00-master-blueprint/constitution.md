# Constitution

> **Status:** partial — every rule below is one the shipped code already obeys,
> with its evidence. Rules that exist only in Luis's head are not here yet.
> **Source commit:** `ed568e6`
> **Last reviewed:** 2026-09-09

A rule earns a place here when breaking it would be a defect, not a preference.

## C1 — Production is never the experiment

Risky work ships as a separate artefact on an unmerged branch. Voice v2 lives
in `voice-v2.html`; `index.html` was not touched by it.

> "Production remains index.html (commit b01eb18), untouched and unchanged.
> GitHub Pages serves `main`; this file lives only on an unmerged branch."
> — `voice-v2.html:11`

**Test of compliance:** `main` can be served at any moment without knowing what
is on a branch.

## C2 — The confirmed interface is preserved

New capability is added to the existing markup and CSS. It does not redesign
them.

> "the confirmed Panchita Personal interface is PRESERVED … The only addition
> is a compact voice bar … Nothing was redesigned or replaced."
> — `voice-v2.html:14`

## C3 — The secret leaves memory at the first opportunity

The password is held only for the duration of the login request and cleared on
both the success and the failure path.

> `state.pendingPassword = null;` in both the `.then()` and the `.catch()` of
> `doLogin()` — `index.html:298`, `index.html:317`

## C4 — Session teardown never waits on the network

Logout returns the UI to the login screen first and revokes the token
best-effort afterwards. A dead network cannot leave a session looking open.

> "Best-effort revoke call; UI has already returned to login regardless of
> outcome." — `index.html:339`

## C5 — Scaffolding is labelled as scaffolding

A provisional constant carries, in the source, what it is and what it must not
be mistaken for.

> "FINAL_COALESCE_MS is the width of that burst ONLY. It is provisional
> hardware-test scaffolding, it is not semantic end-of-turn, and it is not a
> reinstatement of the removed fixed silence timer." — `voice-v2.html:36`

## C6 — Safety is enforced on lifecycle, not on content

The self-echo fix gates submission on whether Panchita is speaking, not on
whether the text looks like something she said. A content test can always be
walked through by a garbled transcript; a lifecycle gate cannot.

> "submission is now gated on LIFECYCLE, not on text … regardless of what it
> says" — `voice-v2.html:55`

See [04 · Incident History](../04-security/incident-history.md) for what this
rule cost to learn.

## C7 — A gate must never be able to wedge shut

Every hold has an absolute ceiling and a test proving it releases.

> `var TTS_GATE_MAX_MS = 90000; // absolute ceiling; the gate can never wedge`
> — `voice-v2.html:303`, held by the test "the gate never wedges shut when TTS
> never reports an end".

## C8 — The test runs the shipped code

Tests extract the real `<script>` body out of the page and run it. Nothing is
re-implemented for testing.

> "the code under test is the code that ships, so a regression in the page is a
> failing test." — `tests/harness.js:7`

## C9 — Tests take no dependencies and touch no network

> "No dependencies, no install step, no network. The Gateway is a local stub;
> nothing leaves the process and there are no keys, tokens or endpoints in the
> test code." — `tests/README.md`

## C10 — Paid capability is off until it is justified

> `var PAID_REALTIME_ENABLED = false;` — `voice-v2.html:270`

See [08 · Cost Constitution](../08-cost-and-quality/cost-constitution.md).

## Candidate rules — not adopted

Written down so they are not lost, but not binding until Luis confirms them:

* Every Gateway response must carry a human-readable string, so the UI never
  has to invent an error message. (The code behaves this way; it has not been
  stated as a rule.)
* No module may hold its own credentials — the Gateway holds all of them.
* Nothing ships to production without a hardware test on a real Android phone.
