# Next

> **Last reviewed:** 2026-09-09

---

## X1 — Merge Voice v2 to `main`

**Depends on:** [N1](now.md#n1--run-the-voice-v2-hardware-test)

Production inherits continuous voice. Decide before merging:

* Does Voice v2 replace `index.html`'s voice path outright, or ship behind a
  toggle for one cycle?
* Does the test suite re-point at `index.html`? **If it does not, the tests stop
  guarding production the moment they land** — they name `voice-v2.html` by path
  (`tests/harness.js:17`).
* Does `voice-v2.html` survive the merge, or get deleted?

The second question is the one that matters. 61 tests aimed at a file nobody
serves are 61 tests that guard nothing.

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

The page that serves the owner has no tests; the prototype has 61. The harness
that would run them already exists and is generic over a page path.

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
