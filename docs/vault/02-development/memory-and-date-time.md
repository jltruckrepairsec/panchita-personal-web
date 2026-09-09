# Memory + Date-Time

> **Status:** stub — no source in this repository.
> **Last reviewed:** 2026-09-09

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
  change to the Gateway.
* Is memory per-session, per-day, or permanent?
* Does memory cross module boundaries — does the truck-repair conversation know
  what the real-estate one said?
