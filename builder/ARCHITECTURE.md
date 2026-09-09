# Panchita Builder — Safe Self-Development Foundation

**Status: design + isolated reference implementation. Nothing in this document
is running in production. Builder does not exist as a live component.**

The goal is that Luis can say *"Panchita, improve your memory"* or *"Panchita,
add this capability"* and Panchita safely coordinates the development work —
analysing, planning, building candidates in isolation, testing them,
documenting the result and recommending a deployment that **Luis** performs.

---

## 1. What exists today, and what is only planned

Verified by reading the repository and the n8n instance on 2026-09-09.

### Verified to exist

| Thing | Where | State |
| --- | --- | --- |
| Panchita Personal client | `index.html` in this repo | Live. Posts to one Gateway webhook. Session held in memory only. |
| Voice v2 test page | `voice-v2.html` + `tests/voice-v2-*.test.js` | Isolated test page. **Another session's work — untouched here.** |
| Gateway v0.1 | n8n `KNuR7CRz7PwDznck` "HARDENED CANDIDATE, UNPUBLISHED" | Active. The client's only server contact point. |
| Personal→Central Adapter v0.1 | n8n `N7k0o05HEvV0SqyF` | Marked ISOLATED/TEST. Validates a session, mints a trusted-context envelope carrying *references*, never tokens. |
| Central v1.0 | n8n `HyZnOoYjPZsqBR8x` | Marked ISOLATED/TEST. Registry-driven router, replay-nonce protection, audit writes. Its own description states it "never [is] an authorization authority" and that the public path hardcodes `trusted_authorization_context = null`. |
| Module registry table | n8n data table `eMzrJ7GQTSYNJ4Tb` | Columns `module_id, status, endpoint_ref, risk_level, health_status`. |
| Central audit table | n8n data table `OFBUwrN4VxSAqnvx` | `correlation_id, source, module, intent, risk_classification, execution_mode, routing_status, error_category, timestamp`. |
| Builder **Guardian** v0.1 / v0.2 | n8n `1eagDRZgGCuMSppy`, `K1ykR9HKinC1UP4k` | **Inactive.** v0.2 evaluates only raw evidence; `can_publish` is hardcoded `false`. |
| Mission Control v0.1 | n8n `pDzw2k9AHiuzf1jw` | Inactive, read-only prototype. |
| `prompt_engineer` intent | inside Central v1.0's router | Already matches "nueva capacidad", "add this feature", "quiero que panchita pueda". The natural seam for Builder requests. |

### Does not exist

* **There is no Builder.** No workflow, no code, no registry row — anywhere.
* No approval channel, no approval store.
* No deployment path, no rollback executor, no post-deploy monitoring for
  Builder-originated change.
* Guardian is written but has never been activated or called by anything.

### What this task added

`builder/src/` — a dependency-free, network-free reference implementation of
Builder's **decision layer**, plus 110 tests. It is the set of rules a future
Builder runtime must obey. It is not a runtime: it cannot reach a network, a
credential, or n8n, and a test asserts that.

---

## 2. Architecture

```
Luis  ── the only authority. Approves, deploys, rolls back.
  │
  ▼
Panchita Personal (index.html)         no Builder logic; sends a sentence
  │  POST {message, language, session_id}
  ▼
Gateway v0.1                            AUTHENTICATION + AUTHORIZATION
  │                                     ── outside the AI's control ──
  ▼
Personal→Central Adapter                validates session → trusted context
  │  {identity_ref, tenant_ref, authz_ref, nonce}   references, never tokens
  ▼
Central v1.0                            ROUTES. Does not authorize.
  │  registry lookup: module_id = "builder_intake"
  ▼
┌─────────────── Builder control plane (proposed) ───────────────┐
│  Intake      natural language → BuilderTask, fails closed      │
│  Planner     analysis, plan, cost estimate, rollback plan      │
│  Provisioner isolated branch + sandbox environment             │
│  Generator   implementation candidates inside the sandbox      │
│  Runner      automated tests in the sandbox                    │
│  Collector   raw evidence artifacts (no narrative)             │
│  Reporter    recommendation to Luis                            │
└────────────────────────────────────────────────────────────────┘
  │  evidence envelope (four raw artifact keys)
  ▼
Guardian v0.2                           INDEPENDENT. Separate workflow.
  │  verdict; can_publish always false
  ▼
Approval queue  ─────────────────────►  LUIS  (out of band, human)
  │  approval record
  ▼
Deployer      NOT part of Builder. NOT built. Phase switch is off.
  │
  ▼
Monitoring / Rollback
```

### The boundaries, restated as properties of the design

| Boundary | How it is held |
| --- | --- |
| Central routes; it does not authorize | Builder refuses any envelope whose `trusted_authorization_context` is absent. Central's public path hardcodes that to `null`, so a request arriving that way can be read but never acted on. |
| Builder cannot grant itself permissions | `policy.FORBIDDEN_CAPABILITIES` includes `grant_permission`, `self_grant`, `publish`, `deploy`, `approve`. `builderMayPerform()` fails closed: anything not explicitly granted is denied. |
| Guardian is independent of Builder | Separate n8n workflow, separate trigger, no shared state. Builder sends artifacts and reads a verdict; it never computes one. A test greps every Builder source file to prove no module assigns a verdict or sets `can_publish: true`. |
| Auth stays outside the AI | Builder has no credential, no session table, no network call. Identity arrives as an opaque reference it cannot act on. |
| Critical actions require Luis | `HUMAN_ONLY_EVENTS` requires `actor_type === "human_owner"`; Builder calling one is refused and the refusal is audited. |
| No production writes without authorization | `assertScopeAllowed()` refuses a production path, a production target environment, or a business-data write, before a task record even exists. |
| No secrets anywhere | Every value entering a task, an audit entry or an evidence envelope passes `secrets.assertClean()`. A credential-shaped value aborts the operation; a sensitive field name is masked. |
| Tests, audit, versions, rollback on every change | All five are quality-floor items. A plan missing any of them is rejected as invalid, not accepted as cheaper. |
| Builder works in isolated branches/environments | `assertWorkspaceIsolated()` requires a non-protected branch, a non-production environment, and explicit `can_publish: false` / `has_production_credentials: false`. A missing field fails. |
| A failed test blocks deployment | A failing run lands in `TESTS_FAILED`, from which `SUBMIT_EVIDENCE` is not a legal transition. There is no path around it. |
| No paid service without approval | Any plan step with `activates_paid_service: true` needs a `human_owner` approval at stage `paid_activation`. |
| Cost optimization never weakens safety | `applyCostOptimization()` can only drop optional steps and re-asserts the quality floor afterwards. Marking a floor item "optional" does not make it droppable. |

---

## 3. Task lifecycle

```
DRAFT
  │ SPECIFY            scope allowed? no secrets? budget declared?
SPECIFIED
  │ PLAN               quality floor + budget + rollback plan validated
PLANNED
  │ APPROVE_PLAN       ◆ GATE A — Luis
APPROVED_TO_BUILD
  │ PROVISION          workspace proven isolated, no scope drift
WORKSPACE_READY
  │ BUILD              candidate touches only declared paths, no secrets
CANDIDATE_READY
  │ TEST               real execution result required
  ├──────────────► TESTS_FAILED ──REWORK──► WORKSPACE_READY  (max 3, then Luis)
TESTS_PASSED
  │ SUBMIT_EVIDENCE    raw artifacts only; requests_publish always false
EVIDENCE_SUBMITTED
  │ RECORD_VERDICT     Guardian's answer, read not computed
  ├──────────────► GUARDIAN_BLOCKED  (dead end for Builder)
GUARDIAN_CLEARED
  │ REQUEST_OWNER_APPROVAL
AWAITING_OWNER_APPROVAL     ◄── Builder's ceiling. It stops here. Always.
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ not built, phase switch off ╌╌╌╌╌╌╌
  │ APPROVE_DEPLOY     ◆ GATE B — Luis, and deployment_enabled must be true
APPROVED_FOR_DEPLOY
  │ DEPLOY             ◆ Luis. Rollback plan re-validated first.
DEPLOYED → MONITOR → MONITORING → COMPLETE
                          └────── ROLLBACK ──► ROLLED_BACK
```

Any non-terminal state also accepts `REJECT` (Luis), `ABANDON` and `BLOCK`.

**The ceiling is enforced twice**, deliberately. `HUMAN_ONLY_EVENTS` blocks the
event; a second check blocks any transition whose destination is
`APPROVED_FOR_DEPLOY`, `DEPLOYED` or `MONITORING` when the actor is not the
owner. Two independent checks means a future edit to one of them does not
silently open the gate.

An exhaustive search over the state machine confirms both halves of the
intended behaviour. Given every gate handed to it — valid owner approvals on
record for every stage, deployment switched on, and a payload satisfying every
gate — Builder acting alone reaches only `DRAFT`, `SPECIFIED`, `PLANNED`, and
the two ways of giving up. Gate A stops it before it can build anything.
Seeded past that single human approval, it runs the whole job to
`AWAITING_OWNER_APPROVAL` and reaches no deployment state at all.

---

## 4. Approval gates

| Gate | Where | Requires |
| --- | --- | --- |
| **G0 Intake** | `SPECIFY` | Scope outside every protected surface; no production path; no business-data write; no credential in the request; a declared positive budget. |
| **G1 Plan** | `APPROVE_PLAN` | A `human_owner` approval record scoped to this task and stage. |
| **G2 Isolation** | `PROVISION` | Non-protected branch, non-production environment, `can_publish: false`, `has_production_credentials: false`, writable paths ⊆ declared scope. |
| **G3 Tests** | `TEST` → `SUBMIT_EVIDENCE` | A real execution id, a status, and a non-zero test count. Failure is a different state with no route onward. |
| **G4 Guardian** | `RECORD_VERDICT` | Only `VERIFIED_COMPLETE` clears. Missing, unsigned, mismatched or `can_publish`-claiming responses are treated as tampered. |
| **G5 Owner deploy** | `APPROVE_DEPLOY` | `human_owner` approval at stage `deploy`, unexpired, unconsumed, correctly scoped. |
| **G6 Phase** | `APPROVE_DEPLOY`, `DEPLOY` | `phase.deployment_enabled === true`. It is `false` in `DEFAULT_PHASE` — in this phase even Luis's approval does not deploy, because there is no deployer. |
| **G7 Rollback** | `PLAN`, `REQUEST_OWNER_APPROVAL`, `DEPLOY`, `ROLLBACK` | A validated plan: every target has a restore reference *and* a verification step. |
| **G8 Cost** | every transition | Running spend within the declared budget; no unapproved paid activation. |

An approval is only ever *verified* here, never minted. There is deliberately
no function in this codebase that creates one — an approval Builder can
construct is not an approval.

---

## 5. Guardian separation

Guardian v0.2 already exists as its own n8n workflow and already implements the
right idea: it reads four raw evidence keys and *ignores Builder's prose
entirely*. Missing evidence yields `UNKNOWN`, which fails closed.

Builder's side of that contract:

* The evidence builder emits only `workflow_version_state`,
  `data_source_before_after`, `test_execution_result`, `registry_before_after`.
* Narrative keys (`summary`, `claim`, `tests_passed`, `confidence`,
  `production_untouched`, …) are stripped and the drop is reported.
* Evidence Builder could not collect is **absent**, not padded. Guardian then
  returns `UNKNOWN_FAILS_CLOSED`, which is the correct outcome.
* Builder never sets `requests_publish: true`.

Separation is also checked structurally: a test reads every file under
`builder/src/` and fails if any of them assigns a Guardian verdict, sets
`can_publish: true`, or contains a network call, `child_process`,
`process.env` access, or an embedded URL.

### Two gaps found in Guardian v0.2 — for Guardian's own owner, not for Builder to patch

1. **`production_impact` is still a caller-supplied field.** With every check
   verified, Guardian returns `VERIFIED_COMPLETE` when the submission says
   `production_impact: 'none'` and `PASS_WITH_APPROVAL_REQUIRED` otherwise. So
   one narrative field still influences the verdict, which is exactly what the
   rest of the workflow is built to avoid. Guardian should derive impact from
   the version metadata it already reads.
2. **Check 5 (`no_publish_occurred`) can pass on the same evidence that makes
   check 1 pass**, since `activeVersionId === baselineActiveVersionId`
   satisfies both. It is not wrong, but it is one fact counted twice rather
   than two independent checks.

Builder does not fix these. Guardian must remain independent, and modifying it
from the Builder workstream would defeat the point. They are recorded here for
a Guardian v0.3 owned separately.

---

## 6. Rollback model

Rollback is computed **before** the build, from state that exists now, and
every strategy is executable by Luis by hand — so getting back does not depend
on Builder working.

| Change kind | Restore reference | Manual procedure |
| --- | --- | --- |
| `n8n_workflow` | `previous_active_version_id` | n8n → workflow → Versions → restore → publish. |
| `static_web_asset` | `previous_commit_sha` | `git revert` the deploy commit, or redeploy the recorded sha. |
| `data_table_schema` | `additive_only: true` | Stop reading the added column. Only additive changes are permitted, so no data is destroyed. |
| `configuration` | `previous_value` | Set the key back to the recorded value. |

A plan with no targets is **invalid**, not empty: "nothing to roll back" must be
stated explicitly so silence is never mistaken for safety. Every target also
needs a verification step — a rollback nobody checked is a second incident.

---

## 7. Audit model

One task, one hash chain.

```
entry = { seq, at, task_id, event, actor, actor_type,
          from_state, to_state, outcome, detail, evidence_ref,
          prev_hash, hash }
hash  = sha256(canonical(entry without hash))
```

* **Append-only in fact, not by policy.** Entries and the entry array are
  frozen; `append()` returns a new log.
* **Refusals are recorded.** A blocked gate appends an entry with
  `outcome: "refused"` and leaves the state alone — a blocked attempt is
  exactly what the trail should show.
* **Tamper-evident.** Editing an entry breaks `content_tampered`; removing one
  breaks `sequence_gap`; re-hashing a forged entry breaks `chain_break` at the
  *next* link. All three are tested.
* **The log cannot become the leak.** Credential-shaped content is refused
  before hashing; sensitive field names are masked.

The chain is Builder-local and detailed. Central's existing audit table stays
the coarse, cross-module record; a Builder task contributes one row there
(`module: builder`, `correlation_id`) plus its own chain, referenced by
`audit_reference`.

---

## 8. Cost and quality controls

The quality floor — seven items every plan must contain:

```
automated_tests · test_execution_evidence · secret_scan · isolation_check
rollback_plan · audit_trail · guardian_review
```

* Budget is declared at intake and checked at **every** transition. Over
  budget stops the task; it never quietly reduces its scope.
* `applyCostOptimization()` drops optional steps, dearest first, until the
  estimate fits — then re-asserts the floor. If only floor work remains and it
  still does not fit, the answer is "over budget", never a trimmed floor.
* Marking a floor item `required: false` does not make it droppable. The
  normalizer forces floor items to required regardless of what the step claims.
* Any step that would switch on a paid service needs a `human_owner` approval
  at stage `paid_activation`. A Builder-issued approval for that stage is
  rejected.

---

## 9. How Panchita Personal will submit Builder requests

**No client change is required.** `index.html` already posts
`{message, language, session_id}` and already renders whatever
`human_readable_response` comes back. The Builder reply reuses the Adapter's
existing response contract: `status`, `human_readable_response`, `data`,
`requires_followup`, `requires_approval`, `audit_reference`.

The eventual flow:

1. Luis says *"Panchita, mejora tu memoria"* in the app.
2. Gateway authenticates and the Adapter validates the session, producing the
   trusted-context envelope. **This is where authentication ends** — nothing
   downstream re-decides it.
3. Central's router matches the request (its `prompt_engineer` keyword list
   already covers these phrases) and looks up the module registry.
4. Central dispatches to Builder Intake with the trusted envelope.
5. Intake refuses the request if it carries any credential field, or if the
   trusted context is absent — which is the case for anything that arrived over
   Central's public webhook.
6. Intake opens a `DRAFT` task and replies: *"I've opened an isolated
   development task and I'll come back with a plan for you to approve. Nothing
   changes until you say so."* — with `requires_approval: true`.
7. Builder plans, builds, tests and collects evidence on its own, up to
   `AWAITING_OWNER_APPROVAL`.
8. Luis approves through a **separate owner-authenticated channel**, not by
   replying in the same chat turn. A sentence in a conversation is not an
   approval record.

Scope is never inferred from Luis's sentence. An unscoped request becomes an
`ANALYSIS_ONLY` task: Panchita may think about it and come back with a
proposal, and nothing more.

---

## 10. What can be implemented now, and what cannot

**Built here, safely, in isolation:**

* Capability and scope policy, with fail-closed defaults.
* Secret scanning and redaction for every record Builder produces.
* The task record and its public view.
* The full lifecycle state machine with all eight gates.
* The Guardian evidence envelope and verdict interpretation.
* The rollback model and its validator.
* The hash-chained audit log.
* Cost and quality-floor control.
* The Personal → Central → Builder intake mapping.
* 110 tests over all of it, including two exhaustive state-space searches.

**Deliberately not built:**

* The Builder n8n workflow. Creating it would put a Builder in the live
  instance, and the design is not reviewed yet.
* Any registry row for Builder. Registering it would make Central able to
  dispatch to it.
* Activating Guardian.
* The approval channel and store — this needs an auth design decision that is
  Luis's, not Builder's.
* Any deployer, monitor or rollback executor.
* Any change to Gateway, Central, GHL, ShopMonkey, payments or permissions.
* Any change to Voice v2 or the Memory + Date/Time work in other sessions.

---

## 11. Exact next milestone

**M1 — Builder Intake as an isolated, unregistered n8n workflow.**

Scope, precisely:

1. Create `Panchita Builder Intake v0.1 (ISOLATED, TEST, DO NOT ACTIVATE)`
   with an Execute-Workflow trigger only — **no webhook, no public URL** —
   left **inactive**.
2. It implements exactly the intake step: trusted-context check, credential
   refusal, task-draft creation, and the "requires_approval" reply. Nothing
   downstream of `SPECIFY`.
3. It writes its task records to a **new** data table `panchita_builder_tasks`
   (additive; touching no existing table).
4. **No registry row.** Central cannot reach it. It is invoked only by hand,
   from n8n, by Luis, with synthetic input.
5. Port the intake and policy rules from `builder/src/` verbatim, and re-run
   the isolated test-vector set against the workflow's output.

Exit criteria: Luis can run it manually with a synthetic envelope and see a
correct draft task and a correct refusal for each of the credential, missing
context, and protected-scope cases — with the workflow still inactive and
still unregistered.

**M1 requires Luis's approval before any n8n object is created.** This task
created none.

Deliberately *not* in M1: registry registration, Guardian activation, the
approval channel, the planner, the sandbox, or any deploy path.
