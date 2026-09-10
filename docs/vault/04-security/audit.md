# Audit

> **Status:** stub — no audit trail is known to exist.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is true today

Nothing in this repository writes an audit record, and nothing suggests one
exists behind the Gateway. The browser keeps no history: the message list is
cleared on entering the chat (`index.html:326`), holds only the current
conversation, and is lost on reload.

The one thing that does record anything is the diagnostic panel — voice
subsystem state, which callbacks fired, error codes, timeouts
(`index.html:680`). It is a debugging aid, in-memory, per-session. It is not an
audit trail, though it is evidence that instrumentation gets built here when a
failure is otherwise invisible.

## Why this matters concretely

[INC-001](incident-history.md) was found because the owner watched it happen on
his phone. The reconstruction in that page comes from reading the source and
writing tests, not from any record of the event. There is no log of when it
started, how many turns it generated, or whether it had happened before
unnoticed.

That is the cost of having no audit trail, already paid once.

## What belongs here

* What is recorded: authentication attempts and outcomes, session issue and
  revoke, each turn, each module invocation, each write to an external system,
  each rate-limit or guard trip.
* Where records live, and for how long.
* Who can read them, and how — likely
  [02 · Mission Control](../02-development/mission-control.md).
* What must *not* be recorded. Passwords and full phone numbers are the obvious
  cases, and the client is already built so it never has the latter.

## Minimum worth having first

If only one thing gets built, it should be authentication events — attempt,
outcome, session issue, session revoke. That is the record needed to answer "is
someone trying to get in?", which [Authentication](authentication.md) currently
flags as its most important unknown (no known failed-login limit).

## Open questions

* Is any of this already logged in n8n's execution history? If so, retention
  and readability need checking before anything new is built.
* Does the owner want a record of his own conversations, or is that itself a
  privacy cost he would rather not carry?
