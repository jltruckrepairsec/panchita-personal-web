# Panchita Personal

> **Status:** sourced — this is the production front end and it lives in this
> repository.
> **Source:** `index.html` @ `ed568e6` (last functional change `b01eb18`)
> **Lifecycle:** CURRENT PRODUCTION
> **Basis:** `b01eb18` — `index.html` is byte-identical on `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

## What it is

A single-file phone web app, served by GitHub Pages from `main`. It is the
owner's way into Panchita: sign in, talk or type, get an answer. It contains no
business logic — every question goes to the Gateway.

`<title>Panchita Personal</title>` · `<html lang="es">` · one HTML file, no
build step, no dependencies, no framework.

## Screens

| Screen | Contents |
| --- | --- |
| Login | Last 4 digits of phone (`inputmode="numeric"`, `maxlength="4"`), password, language, sign-in button |
| Chat | Message list, session pill, text input ("Escribe tu pregunta…"), send button, microphone button, hint line, diagnostic panel |

Both are the *confirmed* interface — see
[C2](../00-master-blueprint/constitution.md#c2--the-confirmed-interface-is-preserved).

## Sign-in

The owner types the last four digits of their phone and a password. The browser
sends `phone_hint` as `XXX-XXX-<last4>` — never the full number, which it never
has — together with `factor_provided` and a neutral first message.

```
POST { message: "Hola", language: "es",
       phone_hint: "XXX-XXX-1234", factor_provided: <password> }
```

Because the Gateway has no login-only endpoint (`index.html:270`), that first
request is both the authentication and the first conversational turn, so the
owner lands in the chat with a real reply already waiting rather than an empty
room.

On the response, whatever the outcome, the password is dropped from memory
immediately — `state.pendingPassword = null` on both the success and failure
paths ([C3](../00-master-blueprint/constitution.md#c3--the-secret-leaves-memory-at-the-first-opportunity)).

A `completed` response carrying a `session_token` enters the chat. Anything
else stays on the login screen showing `human_readable_response`, falling back
to a generic message if the Gateway sent none.

## Sending a message

```
POST { message: <text>, language: "es" | "en", session_id: <session_token> }
```

Handling by `status` (`index.html:534`):

| `status` | Behaviour |
| --- | --- |
| `completed` | Render the reply. If a fresh `session_token` came back, roll the stored token and expiry — the session slides forward as it is used |
| `denied` | Treat as an invalid session: clear state, return to login showing the Gateway's message. Holding a token and being denied is read as expired or revoked, and it fails safe to login |
| `validation_error`, `error` | Render as a bot message, keep the session |
| anything else | Render a generic error, keep the session |
| network failure | Remove the "thinking" bubble, show a generic error, keep the session |

Sending with no token at all short-circuits to the login screen before any
request is made.

## Sign-out

The UI returns to login first; the revoke call (`{ action: "logout",
session_id }`) is fired afterwards and its result is ignored
([C4](../00-master-blueprint/constitution.md#c4--session-teardown-never-waits-on-the-network)).

## Voice (production behaviour)

Browser-native `SpeechRecognition`, push-to-talk, one turn per tap:

| Constant | Value | Meaning |
| --- | --- | --- |
| `SILENCE_MS` | 3500 | Silence that ends a turn (`index.html:582`) |
| `MAX_TURN_MS` | 15000 | Hard ceiling on one turn (`index.html:583`) |
| `SPEAK_RESTART_DELAY_MS` | 180 | Gap before recognition resumes after speech (`index.html:398`) |

A turn ends on the first of: a final result, the silence timer, the
max-duration failsafe, or `onend` (`index.html:628`). The 3500 ms threshold was
raised deliberately in `b01eb18` — see
[07 · Releases](../07-change-history/releases.md).

This is the behaviour Voice v2 is built to replace; see
[02 · Voice v2](../02-development/voice-v2.md).

### Voice failure messages

Every microphone failure has a specific, actionable Spanish message rather than
a generic one — `notSupported`, `permissionDenied`, `noMic`, `network`,
`genericFail` (`index.html:661`). The `notSupported` case is worth noting: it
names the real-world cause, which is opening the link from inside WhatsApp or
Gmail instead of Chrome. That is a field-learned message, not a boilerplate
one.

### Diagnostic panel

The page reports its own voice state — constructor in use, secure context,
`mediaDevices` availability, permission state, `getUserMedia` result, which
callbacks fired, any start exception, error code, timeout flag
(`index.html:680`). This exists because voice failures on Android are otherwise
invisible from a phone, and the offline test suite reads its counters rather
than reaching into private state.

## Known constraints

* Session lives in page memory only. A reload signs the owner out.
* Chrome on Android is the tested target; other browsers are untested.
* Voice is push-to-talk, one turn per tap — the microphone does not stay open.
