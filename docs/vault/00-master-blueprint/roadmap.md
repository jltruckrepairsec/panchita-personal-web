# Roadmap

> **Status:** partial — the near term is sourced from open work in the
> repository; anything beyond it is a stub.
> **Source commit:** `ed568e6`
> **Last reviewed:** 2026-09-09

Sequenced work lives in [09 — Backlog](../09-backlog/). This page is the shape
of the journey, not the queue.

## Now — close out Voice v2

Voice v2 is code-complete against every failure reproduced so far and has a
green offline suite. One thing stands between it and production, and it cannot
be settled at a desk:

> "They do not prove the **long natural-pause** problem is solved … That
> behaviour can only be judged on real Android hardware." — `tests/README.md`

Exit criteria: a hardware session on Luis's Android phone where a long natural
pause mid-sentence does not end the turn, and no self-echo turn appears.

Then: merge to `main`, and `index.html` inherits continuous voice.

## Next — the Gateway contract, written down

The browser currently knows the Gateway's response shape by having been written
against it. Nothing states it. Every future surface — Central, Mission Control,
a second client — re-derives it by reading `index.html`.

Writing [01 · Gateway](../01-live-systems/gateway.md) up to a real contract is
the cheapest de-risking available right now.

## Next — module routing made legible

Section 03 lists seven module areas. This repository cannot see any of them.
Until routing is documented, no one can answer "why did Panchita answer that
way?" without opening n8n.

## Later — stubbed

* Central, and its division of labour with Panchita Personal.
* Memory and date-time handling ([02](../02-development/memory-and-date-time.md)).
* Mission Control ([02](../02-development/mission-control.md)).
* Builder ([02](../02-development/builder.md)).
* Guardian and the wider security posture ([04](../04-security/guardian.md)).

## Open questions

* Does Voice v2 replace `index.html`'s voice path outright, or ship behind a
  toggle for one phone-test cycle?
* Is a second client (desktop, native) anywhere on the horizon? It changes how
  much the Gateway contract needs to be formalised.
