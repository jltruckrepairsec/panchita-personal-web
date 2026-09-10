# Architecture Decisions

> **Status:** sourced — reconstructed from the code and its commit history.
> These were not written as ADRs at the time; they are recovered here because
> the reasoning is still recoverable.
> **Lifecycle:** GOVERNING — ADR-005 under review
> **Basis:** `149d94e`
> **Last reviewed:** 2026-09-10

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

**Status:** active — **restated**; the title's "on a branch" no longer applies ·
**Since:** `070bda9`

Voice v2 was built as `voice-v2.html` rather than as changes to `index.html`.

The decision was originally justified twice over: a separate *file*, and an
unmerged *branch* that GitHub Pages would never serve. **Only the first half was
ever load-bearing.** The branch was merged at `070bda9`, `voice-v2.html` has
been public ever since, and production was unaffected anyway — because it is a
different file.

The heading is left unchanged so existing links keep working; read it as "as a
separate page". See
[C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment).

**Return already realised:** continuous recognition has produced four serious
failures — cumulative-final flooding, the self-echo loop, and the two open
hardware failures. None touched production. See
[L5](../05-knowledge/lessons-learned.md#l5--isolating-the-experiment-is-what-made-the-failure-cheap).
**Cost:** duplicated markup and CSS between the two pages, and a publicly
reachable prototype carrying known failures.
**Promoted to:** [C1](../00-master-blueprint/constitution.md#c1--production-is-never-the-experiment)

---

## ADR-005 — End-of-turn belongs to the recogniser, not to a timer

**Status:** ⚠️ **UNDER REVIEW — do not rely on this decision** · **Since:**
`acfd1ec`

The decision as recorded below is contradicted by hardware evidence and by the
code on `main`, but **no replacement decision has been made**. Voice v2 is under
active development and its end-of-turn design is being diagnosed in another
session. This entry is left standing, marked, rather than rewritten.

What is known:

* At `ed568e6` end-of-turn came from the endpointer plus a 400 ms coalesce
  window. On hardware that window cut Luis off mid-sentence.
* At `149d94e` the coalesce constant is gone and a silence grace period governs
  end-of-turn instead. That value is **not validated** — the suite on `main`
  calls it "a starting point to tune from".
* PT-1 still fails: a natural pause still causes premature submission
  ([H-1](../06-testing/physical-tests.md#h-1--a-natural-conversational-pause-still-causes-premature-submission)).

**No ADR-007 will be written until that session reports.** Recording a decision
now would freeze a design that is still failing.

### The decision as originally taken

Production ends a turn on a fixed 3500 ms silence timer. Voice v2 removed it and
relies on Android's own endpointer.

**Reasoning:** a stopwatch cannot know whether someone has finished a sentence;
the endpointer is the only component with the acoustic information to decide.
**Risk, unretired — and now realised:** whether Android's endpointer tolerates a
long natural thinking pause could not be tested offline. It was tested on
hardware, and it does not. See
[06 · Physical Tests](../06-testing/physical-tests.md).
**Guard rail as written:** `FINAL_COALESCE_MS` must never be repurposed into a
replacement timer. That constant no longer exists; the guard rail's intent is
carried by [D1](deprecated.md#d1--the-fixed-silence-timer-silencems--3500),
also under review.

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
