# Panchita Builder — isolated foundation

Design in [`ARCHITECTURE.md`](./ARCHITECTURE.md). This is the reference
implementation of Builder's **decision layer**: the rules a future Builder
runtime must obey, and the tests that prove it obeys them.

**Nothing here is live.** There is no Builder component running anywhere. This
tree is pure logic — it opens no socket, reads no credential, knows no
endpoint, and cannot reach n8n. Three tests assert exactly that.

## Run the tests

```sh
node --test tests/*.test.js        # everything: Builder + Voice v2
node --test tests/builder-*.test.js # Builder only
```

No dependencies, no install step, no network.

## Layout

| File | What it decides |
| --- | --- |
| `src/policy.js` | What Builder may never do, target, or grant itself. Fails closed. |
| `src/secrets.js` | Nothing credential-shaped enters a task, a log, or an evidence envelope. |
| `src/task.js` | The task record. References only — there is no session-token field by design. |
| `src/lifecycle.js` | The state machine and all eight gates. Builder's ceiling lives here. |
| `src/approval.js` | Verifies an owner approval. Deliberately cannot mint one. |
| `src/evidence.js` | The Guardian envelope: raw artifacts, never Builder's claims. |
| `src/verdict.js` | Reads Guardian's verdict. Never computes one. |
| `src/rollback.js` | A way back, designed before the way forward. |
| `src/audit.js` | Append-only hash chain. Refusals are recorded too. |
| `src/cost.js` | Budget control that cannot buy savings with safety. |
| `src/intake.js` | "Panchita, improve your memory" → a draft task, or a refusal. |

## Tests

| File | Holds |
| --- | --- |
| `tests/builder-policy.test.js` | Capability denial, protected surfaces, workspace isolation. |
| `tests/builder-secrets-audit.test.js` | Secret detection and redaction; tamper-evident audit chain. |
| `tests/builder-lifecycle.test.js` | The full path to `AWAITING_OWNER_APPROVAL`, and every way past it being refused. |
| `tests/builder-guardian-separation.test.js` | Guardian independence, structurally and behaviourally. |
| `tests/builder-cost-rollback.test.js` | Quality floor, budgets, paid activation, rollback validity, approvals. |
| `tests/builder-intake.test.js` | The submission path and what it refuses to receive. |

## The five that matter most

* Two exhaustive state-space searches: acting alone, Builder gets no further
  than `PLANNED` — approving a plan is already Luis's call. Seeded past that
  one approval it runs the whole job to `AWAITING_OWNER_APPROVAL` and reaches
  no deployment state, even with deployment switched on and a valid deploy
  approval on record.
* A failing test run lands in `TESTS_FAILED`, from which there is no route to
  evidence, Guardian, or deployment.
* A missing Guardian response fails closed; one claiming `can_publish` is
  treated as tampered.
* Cost optimization cannot drop a quality-floor item, even when the floor
  alone exceeds the budget.
* An envelope carrying `session_id`, `password` or `factor_provided` is
  refused as a routing bug rather than processed.

## Boundaries this tree does not cross

It does not touch `index.html`, `voice-v2.html`, the Voice v2 tests, Gateway,
Central, Guardian, GHL, ShopMonkey, payments, or any permission. It creates no
n8n workflow and no registry row.
