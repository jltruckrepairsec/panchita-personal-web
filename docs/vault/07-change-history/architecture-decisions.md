# Architecture Decisions

> **Status:** sourced — reconstructed from the code and its commit history.
> These were not written as ADRs at the time; they are recovered here because
> the reasoning is still recoverable.
> **Last reviewed:** 2026-09-09

---

## ADR-001 — The browser holds no intelligence

**Status:** active · **Since:** the first commit

The front end sends one message shape to one URL and renders one reply. It never
names a module, never routes, never decides anything about content.

**Consequence:** adding a capability never requires shipping a new front end.
**Cost:** the browser cannot degrade gracefully — if the Gateway is down there
is no partial experience, and no offline anything.
**Constrains:** any permissions model must be enforced server-side, or this
property breaks. See
[04 · Permissions](../04-security/permissions.md).

---

## ADR-002 — Authentication rides on the first message

**Status:** active, by inheritance · **Since:** the first commit

The Gateway has no login-only endpoint (`index.html:270`), so login is a normal
message carrying `factor_provided`, and the browser sends "Hola" / "Hello" as
that message.

**Benefit:** the owner lands in the chat with a real reply instead of an empty
screen.
**Cost:** login and message failures share a code path; every future client must
implement the same trick.
**Note:** this looks like a Gateway constraint the client accommodated rather
than a choice made freely. Worth revisiting when the Gateway contract is written
down — [Roadmap](../00-master-blueprint/roadmap.md).

---

## ADR-003 — Sessions live in memory only

**Status:** active · **Since:** the first commit

No `localStorage`, no cookie, no `sessionStorage`. The token lives in a
JavaScript object for the life of the page.

**Benefit:** a closed tab on a stolen phone yields nothing.
**Cost:** a reload signs the owner out mid-conversation — a real cost on a
phone, where tabs are evicted by the OS.
**Mitigation in place:** sessions slide forward on use, so an active
conversation does not expire under the owner
(`index.html:536`).

---

## ADR-004 — Risky work ships as a separate page on a branch

**Status:** active · **Since:** `070bda9`

Voice v2 was built as `voice-v2.html` rather than as changes to `index.html`.
GitHub Pages serves `main`, so a branch is never served — the isolation is
enforced by infrastructure, not by discipline.

**Return already realised:** continuous recognition produced two serious
failures (cumulative-final flooding, the self-echo loop). Neither touched
production. See
[L5](../05-knowledge/lessons-learned.md#l5--isolating-the-experiment-is-what-made-the-failure-cheap).
**Cost:** duplicated markup and CSS between the two pages, and a merge to do at
the end.
**Promoted to:** [C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment)

---

## ADR-005 — End-of-turn belongs to the recogniser, not to a timer

**Status:** active in Voice v2, unvalidated on hardware · **Since:** `acfd1ec`

Production ends a turn on a fixed 3500 ms silence timer. Voice v2 removed it and
relies on Android's own endpointer.

**Reasoning:** a stopwatch cannot know whether someone has finished a sentence;
the endpointer is the only component with the acoustic information to decide.
**Risk, unretired:** whether Android's endpointer tolerates a long natural
thinking pause is unknown and cannot be tested offline. This is the single open
question on Voice v2 — [06 · Physical Tests](../06-testing/physical-tests.md).
**Guard rail:** `FINAL_COALESCE_MS` must never be repurposed into a replacement
timer. There is a test asserting the comment that says so.

---

## ADR-006 — Safety gates on lifecycle, not on content

**Status:** active · **Since:** `ed568e6`

The self-echo guard was rebuilt from "does this text look like hers?" to "is she
currently speaking?".

**Reasoning:** the content question is unanswerable for short fragments and for
garbled transcriptions. The lifecycle question has a definite answer at every
moment.
**Cost:** a new failure mode — a gate that never opens — handled in the same
change with `TTS_GATE_MAX_MS` and a test named after it.
**Origin:** [INC-001](../04-security/incident-history.md)
**Promoted to:** [C6](../00-master-blueprint/constitution.md#c6--safety-is-enforced-on-lifecycle-not-on-content)

---

## Writing the next one

Record the decision, the alternatives considered, the consequence accepted, and
the risk *not* retired. ADR-005 is the model: its open risk is stated as plainly
as its reasoning, which is why it is still actionable a day later.
