# Gateway

> **Status:** sourced from the client side only. Everything here is what the
> browser observably sends and expects; the Gateway's internals are not in this
> repository.
> **Source:** `index.html` @ `ed568e6`
> **Lifecycle:** CURRENT PRODUCTION — client-observed contract only
> **Basis:** `b01eb18` (`index.html` unchanged since)
> **Last reviewed:** 2026-09-10

## What it is

One hosted n8n webhook. It is the entire back end as far as the browser is
concerned: authentication, session issuance, rate limiting, module routing and
the answer itself all come out of the same URL.

The URL is declared at `index.html:161` and `voice-v2.html:266` @`ed568e6`. It is
deliberately not repeated here.

## The single most important property

**There is no login-only endpoint.** Authentication happens together with the
first message (`index.html:270`). Every consequence below follows from that:

* Sign-in and conversation are the same request shape.
* The browser sends a throwaway greeting ("Hola" / "Hello") as the first
  message so the owner gets a real reply on landing.
* A login failure and a message failure share a code path in the UI.
* Any future client must implement the same trick or the Gateway must grow a
  real login endpoint.

## Request

Three shapes, all `POST` with a JSON body to the one URL:

```jsonc
// 1. Login (also the first turn)
{ "message": "Hola", "language": "es",
  "phone_hint": "XXX-XXX-1234", "factor_provided": "<password>" }

// 2. Authenticated turn
{ "message": "<text>", "language": "es", "session_id": "<session_token>" }

// 3. Logout
{ "action": "logout", "language": "es", "session_id": "<session_token>" }
```

`language` is `"es"` or `"en"`. `phone_hint` is masked to the last four digits
— the browser never holds the full number.

## Response

```jsonc
{ "status": "completed" | "denied" | "validation_error" | "error",
  "human_readable_response": "<text shown to the owner>",
  "session_token": "<issued on login; may be re-issued on any turn>",
  "session_expires_at": "<optional>" }
```

Observed rules:

* `human_readable_response` is the only text the UI ever displays from the
  Gateway. The browser has no template for a Gateway-side condition and falls
  back to a generic local string when the field is absent.
* `session_token` may come back on **any** `completed` turn, not just login.
  The client rolls its stored token whenever one arrives, so sessions slide
  forward with use (`index.html:536`).
* `denied` **while holding a token** means the session is gone. The client does
  not retry — it fails safe to the login screen (`index.html:542`).
* HTTP status is captured (`{ httpStatus, body }` at `index.html:260`) but the
  UI branches on `body.status`, not on the HTTP code.

## Rate limiting

The Gateway enforces a message limit and says so in Spanish:
`Límite de mensajes alcanzado`. This is not a theoretical concern — it is the
wall the Android self-echo loop ran into before anyone noticed the loop, which
is how the incident was found. See
[04 · Incident History](../04-security/incident-history.md).

The limit's actual threshold and window are unknown from the client side.

## What is not known from here

* Which modules exist behind it, and how one is selected.
* Session lifetime, and whether `session_expires_at` is ever populated.
* What the rate limit actually is.
* Whether `error` is a real status the Gateway emits or defensive client
  handling — the client accepts it, but nothing proves it is sent.
* Where credentials for downstream systems live.

Closing these is the "Gateway contract" item on the
[Roadmap](../00-master-blueprint/roadmap.md).
