# Cost Constitution

> **Status:** partial — one rule, and it is enforced in code rather than by
> intention.
> **Lifecycle:** GOVERNING
> **Basis:** `ed568e6`
> **Last reviewed:** 2026-09-10

> Evidence for CC2 lives in
> [04 · Incident History](../04-security/incident-history.md); the standards it
> leans on are in [Quality Standards](quality-standards.md).

## CC1 — Free until the paid version is proven worth it

```js
var PAID_REALTIME_ENABLED = false;   // voice-v2.html:270 @ed568e6
```

Voice v2 is labelled in its own header as a **"FREE PROTOTYPE FOR PHONE
TESTING"**. Everything it does uses browser-native Web Speech —
`SpeechRecognition` and `speechSynthesis` — which costs nothing per turn and
runs on the device.

Paid realtime voice exists in the code as a switch, off. The whole architecture
of Voice v2 — turn assembly, echo guard, lifecycle gate — is the work of making
the free path good enough. That is a cost decision expressed as engineering.

**Test of compliance:** a paid capability arrives switched off, with the free
path attempted first and its limits documented.

## CC2 — Flooding is a cost defect, not just a bug

Both Voice v2 failures were, materially, cost events:

* Cumulative finals turned one sentence into four Gateway requests.
* The self-echo loop generated unbounded self-driven turns until the rate limit
  stopped it.

Neither was noticed as a cost problem, because nothing measures cost. Both are
now held by tests that assert *submission counts* — "exactly one Gateway
submission", "no rate-limit flood", "14 distinct fragments" — which makes those
tests cost regression tests as much as correctness ones.

**Candidate rule, not yet adopted:** any code path that can submit to the
Gateway needs a bounded-submission test before it ships.

## What is missing

Everything with a number in it. There is no accounting of what the n8n instance
costs, what the LLM behind the Gateway costs per turn, or what a month of normal
use runs to. Nothing measures spend, and nothing alerts on it.

The rules above are real but they are qualitative. A cost constitution with no
figures cannot say whether a decision was right.

## Open questions

* What is the monthly floor — the cost of the system sitting idle? Blocked on
  [Provider Costs](provider-costs.md).
* What does one conversational turn cost, roughly? Same blocker, and it is what
  [Budgets](budgets.md) needs before a ceiling means anything.
* At what point does paid realtime voice become cheaper than more engineering on
  the free path? Nothing has evaluated this, and the case has strengthened:
  the free path's end-of-turn behaviour has now failed hardware testing twice
  ([06 · Physical Tests](../06-testing/physical-tests.md)). CC1 says free until
  the paid version is proven worth it — that proof is now worth seeking rather
  than assuming.
