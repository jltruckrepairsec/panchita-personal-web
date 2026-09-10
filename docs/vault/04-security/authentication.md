# Authentication

> **Status:** sourced for the client side. Server-side verification is not in
> this repository.
> **Source:** `index.html` @ `ed568e6`
> **Lifecycle:** CURRENT PRODUCTION
> **Basis:** `b01eb18` — `index.html` unchanged on `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

## Factors

Two, both supplied on one screen:

1. **Phone possession hint** — the last four digits of the owner's phone. The
   browser sends it masked as `XXX-XXX-<last4>` and never holds or transmits
   the full number. Input is constrained to four digits
   (`pattern="[0-9]{4}"`, `maxlength="4"`, `inputmode="numeric"`).
2. **Password** — sent as `factor_provided`.

Client-side validation is minimal by design: four digits present, password
non-empty. Everything real is decided by the Gateway.

## Flow

```
  owner types last4 + password
        │
        ▼
  POST { message: "Hola", language, phone_hint, factor_provided }
        │                    ← authentication and first turn are one request
        ▼
  status = completed + session_token  →  enter chat, render the reply
  status = denied / validation_error  →  stay on login, show the Gateway's text
  network failure                     →  stay on login, generic message
        │
        ▼
  in every case: state.pendingPassword = null; passInput.value = ""
```

## Properties worth keeping

**The password's lifetime is one request.** It is cleared on the success path
and the failure path, and the input field is blanked with it. Nothing writes it
to storage. — `index.html:298`, `index.html:317`

**The full phone number is never known to the client.** Only four digits are
ever entered, so a compromised page cannot leak what it does not have.

**Sessions are memory-only.** `state.sessionToken` lives in a JavaScript object
for the life of the page. No `localStorage`, no cookie, no
`sessionStorage`. Closing the tab ends the session client-side. The cost is
that a reload signs the owner out; the benefit is that a stolen device with a
closed tab yields nothing.

**Sessions slide forward.** Any `completed` response may carry a fresh
`session_token` and `session_expires_at`, and the client rolls its stored
values whenever one arrives (`index.html:536`). Active use extends the session
without a re-login.

**Denial fails safe.** A `denied` status while holding a token is read as
"session no longer valid server-side" — the client does not retry, does not
prompt, and does not degrade. It clears state and returns to login showing the
Gateway's own message (`index.html:542`).

**Missing token short-circuits.** `sendMessage` checks for a token before
building any request and returns to login if there is none
(`index.html:514`). No request is ever sent unauthenticated.

**Logout does not wait on the network.** UI returns to login first; the revoke
call is best-effort and its result ignored (`index.html:339`). A failed revoke
cannot leave a session looking open to the owner.

## Voice sessions inherit all of it

A voice session cannot start without a session token, and an expired session
during voice tears down to login the same way
(`index.html:905`). The offline suite holds these as explicit gates: "the login
handshake payload is unchanged", "an expired session still forces re-login",
"voice cannot start without a session" — see
[06 · Regression Tests](../06-testing/regression-tests.md). The voice work was
allowed to change a great deal, but not this.

## Not known from here

* How the password is verified and stored server-side.
* Whether `phone_hint` is verified against a known number or is decorative.
* Session lifetime, and whether `session_expires_at` is ever populated.
* Whether a token can be revoked out of band.
* Whether there is any rate limiting or lockout on failed logins. **This is the
  most important gap on the page** — a four-digit hint plus a password, with no
  known attempt limit, is a guessable surface.

## Open questions

* Should a failed-login limit exist client-side as defence in depth, or is that
  purely the Gateway's job?
* Is memory-only session the right trade, given a reload signs the owner out
  mid-conversation on a phone?
