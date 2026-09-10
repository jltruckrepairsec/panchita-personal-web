# Test Plans

> **Status:** partial — voice has a real plan; nothing else in the system does.
> **Lifecycle:** PLANNING
> **Basis:** `ed568e6`
> **Last reviewed:** 2026-09-10

## Voice v2 — the plan as executed

Three layers, in order of what each can prove:

| Layer | Where | Proves |
| --- | --- | --- |
| Pure unit | `voice-v2-helpers.test.js` | The extracted helper block behaves |
| End-to-end offline | `voice-v2-turn-assembly.test.js`, `voice-v2-self-echo.test.js` | The whole page's behaviour under scripted recognition events and a controlled clock |
| Physical | Luis's Android phone | Everything that depends on real hardware timing and real audio |

The layer boundary is drawn where offline testing genuinely stops being able to
answer the question, not where it becomes inconvenient. The suite says so
outright about the one thing it cannot cover — see
[Physical Tests](physical-tests.md).

### Method

* Extract the real `<script>` body from the page; run it in a `vm` sandbox
  behind a minimal DOM, a scriptable `SpeechRecognition` and a fully
  controllable fake clock (`tests/harness.js`).
* Assert on counters read from the page's **own diagnostic panel**, not on
  private state.
* Stub the network. Nothing leaves the process, and no key, token or endpoint
  appears anywhere in the test code.
* For each bug fixed, run the new test against the pre-fix page and record the
  failure it produces.

## `index.html` — no plan exists

Production has no automated tests. What would be worth covering, in rough
priority:

1. **The login handshake payload.** Voice v2 has a test for exactly this
   ("the login handshake payload is unchanged"); production, which actually
   serves it, does not.
2. **`status` branching in `sendMessage`.** Five branches including the
   fail-safe-to-login path on `denied`, all untested
   (`index.html:534`).
3. **Password clearing on both paths.** [C3](../00-master-blueprint/constitution.md#c3--the-secret-leaves-memory-at-the-first-opportunity)
   is enforced by nothing but reading the code.
4. **Session-token rolling** when a `completed` response carries a fresh token.
5. **Push-to-talk turn end** on each of its four triggers.

The harness that would run these already exists — it is generic over a page path
(`tests/harness.js:17` points at `voice-v2.html` and nothing else requires that).

## The rest of the system — no plan exists

The Gateway, its rate limiter, and every module in
[03](../03-business-domains/) are untested from here and untestable from here. Whether
they are tested at all is unknown.

## Open questions

* When Voice v2 merges, does the suite re-point at `index.html`, or does
  `voice-v2.html` stay as the test target? If the latter, the tests stop
  guarding production the moment they land.
