# Architecture Map

> **Status:** sourced for the web tier; everything past the Gateway is a stub.
> **Source commit:** `ed568e6`
> **Last reviewed:** 2026-09-09

## The whole picture, as far as it is known

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER  (this repository)                                 │
│                                                             │
│   index.html          Panchita Personal — production        │
│     · login screen (phone last 4 + password)                │
│     · message list, text input, mic button                  │
│     · Web Speech: SpeechRecognition + speechSynthesis       │
│     · holds session_token in memory only                    │
│                                                             │
│   voice-v2.html       Voice v2 — branch only, not served    │
│     · same interface, continuous recognition                │
│     · turn assembler, echo guard, TTS lifecycle gate        │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTPS POST, one JSON body
                            │  { message, language, phone_hint,
                            │    factor_provided | session_id }
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  GATEWAY  (n8n cloud webhook — outside this repository)      │
│    · authenticates and issues session_token                 │
│    · enforces a message rate limit                          │
│    · routes to modules                                      │
│    · returns { status, human_readable_response, … }         │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  MODULES  (unmapped — see 03)                               │
│    truck repair · financial · real estate · marketing ·     │
│    university · recruiter                                   │
└─────────────────────────────────────────────────────────────┘
```

## Tier 1 — Browser

**Hosting.** GitHub Pages, serving `main`. A branch is never served, which is
what makes [C1](constitution.md#c1--production-is-never-the-experiment)
enforceable at the infrastructure level rather than by discipline.

**State.** Session token and expiry live in a plain JavaScript object for the
life of the page. There is no persistence layer — closing the tab ends the
session client-side.

**Voice.** Browser-native Web Speech throughout. No audio ever leaves the
device except as recognised text inside a normal Gateway message, and paid
realtime voice is switched off (`PAID_REALTIME_ENABLED = false`).

## Tier 2 — Gateway

One webhook URL, declared once at `index.html:161` and again at
`voice-v2.html:266`. It is not repeated in this vault.

The significant property is that **there is no separate login endpoint**:

> "The gateway has no separate 'login-only' endpoint: authentication happens
> together with the first message." — `index.html:270`

So the first authenticated request is also the first conversational turn, and
the browser sends a neutral greeting ("Hola" / "Hello") as that message. This
is why a failed login and a failed message are the same code path in the UI.

Full contract in [01 · Gateway](../01-live-systems/gateway.md).

## Tier 3 — Modules

Not visible from this repository. The browser never names a module and never
routes; it sends one message and renders one reply. Whatever selection happens,
happens inside the Gateway.

## What the map is missing

* Where Central sits. It is in the map at 01 but has no edge drawn to it here,
  because nothing in this repository references it.
* Where memory lives, and whether the browser will ever hold any.
* Whether modules are n8n workflows in the same instance or separate services.
* The identity story beyond a single owner.
