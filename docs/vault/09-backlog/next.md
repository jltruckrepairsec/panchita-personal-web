# Next

> **Status:** sourced — derived from open work in the repository.
> **Lifecycle:** PLANNING
> **Basis:** `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

---

## X1 — Decide the end state for the deployed prototype

**Depends on:** [N1](now.md#n1--resolve-the-two-open-hardware-failures-owned-elsewhere)

Voice v2 is already on `main` and public; there is no merge pending. The open
question is what happens *after* the two hardware failures close:

* Does `index.html` eventually inherit the continuous voice path, or does
  `voice-v2.html` remain a permanent second page?
* If production ever inherits it, does the suite re-point at `index.html`?
  **If not, the tests stop guarding production the moment the behaviour moves**
  — they name `voice-v2.html` by path (`tests/harness.js:17`).
* Does the deployed prototype stay reachable indefinitely? It is public with two
  known failures, which is fine for testing and worth an explicit decision
  rather than drift.

The second question is the one that matters: tests aimed at a page that is not
production guard the prototype, not the owner's experience.

---

## X2 — Write the Gateway contract

**From:** [Roadmap](../00-master-blueprint/roadmap.md)

The browser knows the Gateway's response shape by having been written against
it. Nothing states it. Every future surface re-derives it by reading
`index.html`.

[01 · Gateway](../01-live-systems/gateway.md) documents the client's side; what
is missing is the server's confirmation, plus session lifetime, the real status
set, and whether `session_expires_at` is ever populated.

Cheapest de-risking currently available.

---

## X3 — Tests for production `index.html`

**From:** [06 · Test Plans](../06-testing/test-plans.md#indexhtml--no-plan-exists)

The page that serves the owner has no tests; the prototype has 74
([06 · Regression Tests](../06-testing/regression-tests.md)). The harness that
would run them already exists and is generic over a page path.

Priority order: the login handshake payload, the five `status` branches in
`sendMessage`, password clearing on both paths, session-token rolling, and the
four push-to-talk turn-end triggers.

Note that X1 may resolve part of this by re-pointing the existing suite — do X1
first and see what is left.

---

## X4 — Minimum audit trail: authentication events

**From:** [04 · Audit](../04-security/audit.md)

Attempt, outcome, session issue, session revoke. That is the record needed to
answer "is someone trying to get in?", which
[04 · Authentication](../04-security/authentication.md) names as its most
important unknown — a four-digit hint plus a password with no known attempt
limit.

Check first whether n8n's execution history already covers this.
