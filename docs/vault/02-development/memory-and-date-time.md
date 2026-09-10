# Memory + Date-Time

> **Status:** stub — no source in this repository.
> **Lifecycle:** CONCEPT ONLY
> **Last reviewed:** 2026-09-10

## What is known from here

The browser holds no memory at all. Session token and expiry live in a plain
JavaScript object for the life of the page; a reload loses everything. No
conversation history is persisted client-side, and the message list is rebuilt
empty on entering the chat (`messagesEl.innerHTML = ""`, `index.html:326`).

So whatever memory Panchita has is entirely behind the Gateway, and this
repository cannot see it.

Date and time appear nowhere in the front end. The browser never sends a
timestamp, a timezone or a locale beyond `language: "es" | "en"`. If Panchita
knows what day it is, she learns it server-side.

That last point is the likely reason this page exists as a work item.

## What belongs here

* Where conversation memory lives, its shape, and how long it is kept.
* What Panchita is expected to remember across sessions, and what she must not.
* How the current date, time and timezone reach her, and whose clock is
  authoritative — the phone's or the server's.
* Behaviour on ambiguity: "mañana", "el lunes", "en dos semanas" resolved
  against which timezone?

## Open questions

* Should the browser start sending its timezone and local time on each turn?
  It is a one-line change with a real correctness payoff, but it is a contract
  change — so it waits on
  [01 · Gateway](../01-live-systems/gateway.md) being written up, tracked as
  [X2](../09-backlog/next.md#x2--write-the-gateway-contract).
* Is memory per-session, per-day, or permanent?
* Does memory cross module boundaries — does the truck-repair conversation know
  what the real-estate one said? That is a question about the module contract,
  which blocks all of [03 — Modules](../03-modules/README.md).

## Not being worked on here

This page is a record, not a design. The Memory + Time candidate is an owner
decision item and nothing in this vault should propose an implementation for it
— see [09 · Later](../09-backlog/later.md).
