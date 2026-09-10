# Safety hardening pass — 2026-09-10

Five owner-approved stop-the-bleeding fixes, applied to the live n8n instance.
No new capability was added, no write path was enabled, no read scope widened,
no authorization weakened, and no customer data changed.

---

## 1. Exact changes

| # | Change | Where | Result |
| --- | --- | --- | --- |
| 1 | Revoked `appointments.write` from `ghl-caller-anonymous` | data table `mTEaG68qHmalnOiE`, row id 5 | `permissions` `"appointments.write"` → `""` |
| 2 | Gateway key gate on **both** public webhooks | Core `nMSfr0OE42rpPYgE`, Bridge `MS43EWU5Xl6JyaSZ` | unauthenticated requests rejected with HTTP 401 before any logic runs |
| 3 | Deactivated the stale Core v0.1 POC | `fs8RVP0WnOUa252L` | `/webhook/panchita-core-v01` no longer serves |
| 4 | Quarantined the module's write draft | `xxXqlnG4PPxTqbO5` | draft went 44 nodes → 20; the real Sheets write path now exists only in version history |
| 5 | Retry/backoff on the Google Sheets read | `xxXqlnG4PPxTqbO5`, node `Read From Google Sheets` | `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 1000` |

### On fix 2 — what it is, and what it is not

n8n's native webhook header-auth requires a stored credential, and this session
has no credential-creation capability. The gate is therefore implemented in a
Code node that verifies an `x-panchita-key` header against a **salted SHA-256
verifier**. Only the salt and the hash live in n8n; the secret itself never
enters the instance, the workflow JSON, or version history, and a verifier hash
cannot be replayed as a credential (proven in `gateway-key-gate.test.js`).

The primitive was verified before use rather than assumed: `require('crypto')`,
`createHash` and `timingSafeEqual` were confirmed available in this instance's
Code node by diagnostic workflow `YRBo0KXBEdjW8ULm`.

The bridge **relays** the header it received to Core rather than holding a
secret of its own. That keeps plaintext out of n8n entirely, at the cost of one
shared secret across both hops instead of two independent ones.

**This is a perimeter control, not per-identity authentication.** It stops
anonymous internet traffic. It does not prove *which* identity is calling — a
holder of the key can still assert any `user_id`. So defect **C3 is downgraded
from CRITICAL to HIGH, not closed.** Closing it requires per-identity
authentication, which is a design change beyond this pass.

### On fix 4 — why this was the dangerous one

The published module had 20 nodes; its saved draft had 44. The 24 extra nodes
were a complete Google Sheets write path, one node of which
(`Execute Prod Synthetic Test Write`) targeted the **production** spreadsheet.
An ordinary "publish" click in the n8n editor would have activated it.

The draft was restored to the published version, so the write path is now
reachable only by deliberately restoring a historical version. Afterwards
`versionId == activeVersionId` on all three production workflows — there is no
longer any draft/live divergence to publish by accident.

---

## 2. Workflow and version IDs

| Workflow | ID | Before | After |
| --- | --- | --- | --- |
| GHL Voice Bridge | `MS43EWU5Xl6JyaSZ` | `43e9d6d9-1a90-40e1-b905-c73f215c0fca` | `2e1f1f78-b650-4b31-9e71-3f810a82f2af` |
| Core v0.2 | `nMSfr0OE42rpPYgE` | `699407ef-4a67-4ebe-9295-50d987fb1867` | `2d7a42c2-6f90-4504-b340-b706cead132a` |
| JL Truck Repair Module | `xxXqlnG4PPxTqbO5` | active `8c36e555-…`, draft `e5cd2399-…` | `bc456f21-a63a-4290-b8aa-f10d9056d975` (draft == active) |
| Core v0.1 POC | `fs8RVP0WnOUa252L` | active `eba99535-…` | inactive, `activeVersionId: null` |

Support workflows created (all inactive, none on any request path):

| Purpose | ID |
| --- | --- |
| One-time permission revoke utility (re-armed to `dryRun`) | `jV2iWcp9wfqlmrfn` |
| Code-node crypto availability probe | `YRBo0KXBEdjW8ULm` |
| Sheets retry controlled experiment | `RueqtcZHMebGKLb7` |

---

## 3. Tests

### Live evidence

| Property required | Evidence |
| --- | --- |
| Anonymous callers no longer have `appointments.write` | exec **1660** — `PermissionError: not authorized for category 'appointments.write'` → handoff. Registry read confirms row 5 `permissions: ""`. |
| Unauthenticated webhook calls fail closed | exec **1655** (bridge, no key): 401, `Normalize GHL Request (trust boundary)` never executed. exec **1656** (Core, forged `user_id: owner-test`, `role: owner`, "revenue summary", no key): 401, `Normalize Request` and `Core Pipeline` never executed. |
| Authenticated normal calls still work | exec **1652** (ES, TRK-0002) and **1657** (EN, TRK-0001) — full path, correct data, `human_handoff: false`. |
| Stale Core v0.1 cannot receive live traffic | `active: false`, `activeVersionId: null`. |
| Draft write path cannot hit production | published module contains exactly one Sheets node, `operation: read`; zero mutating Sheets nodes; draft == active. |
| Transient Sheets failure retries safely | exec **1662**, controlled experiment: identical bad read, no-retry control **235 ms**, production settings **2652 ms** (≈235×3 + 2×1000). Both emit the same error-item shape `Build Sheet Response` uses to fail closed. |
| No new write paths enabled | only mutation in the published module is the pre-existing `Record Idempotency Key` data-table upsert. No Sheets write anywhere. |

The retry proof was run as an **isolated experiment**, not by injecting a fault
into the production module — same evidence, zero production risk. It used a
404 rather than a 503; that is the stricter case for the fail-closed assertion,
since a 404 is not transient and still exhausts every retry.

### Offline suite

`node --test tests/truck-repair/*.test.js` — **27 tests, all passing** (was 17).

* `authorization.test.js` — 14 invariants, including three new post-fix
  assertions: the anonymous caller now holds zero permissions, can no longer
  reach the reschedule dry-run, and the revoke disturbed no other identity.
* `known-defects.test.js` — 5 characterisations (was 6). The H1 test was
  **deleted because it started failing**, which is exactly the workflow its
  README prescribes: a defect test that fails means the defect is fixed, and it
  is replaced by a real assertion.
* `gateway-key-gate.test.js` — 8 new tests over the deployed verification
  logic, using locally generated key material. Covers missing, empty, wrong,
  near-miss and wrong-type keys, header-case handling, and the fact that the
  stored salt and hash cannot themselves be used as the key.

Voice V2's 91 tests still pass and its files remain byte-identical.

---

## 4. Rollback points

Every change is individually reversible; none depends on another.

| # | Rollback |
| --- | --- |
| 1 | Run `jV2iWcp9wfqlmrfn` with `permissions` set back to `appointments.write` and `dryRun` off. It is currently re-armed to `dryRun: true`, so an accidental run is a no-op. |
| 2 (Core) | `publish_workflow(nMSfr0OE42rpPYgE, versionId="699407ef-4a67-4ebe-9295-50d987fb1867")` |
| 2 (Bridge) | `publish_workflow(MS43EWU5Xl6JyaSZ, versionId="43e9d6d9-1a90-40e1-b905-c73f215c0fca")` |
| 3 | `publish_workflow(fs8RVP0WnOUa252L)` — restores version `eba99535-e691-471b-b767-72ff39375014` |
| 4 | `restore_workflow_version(xxXqlnG4PPxTqbO5, "e5cd2399-883e-4d6c-a248-6a59fe9debca")` restores the 44-node write draft. **Do not publish it.** |
| 5 | `publish_workflow(xxXqlnG4PPxTqbO5, versionId="8c36e555-bfd1-42ec-944e-ec8cf9d02d6a")` |

Repository changes are documentation and offline tests only; `git revert`
touches no running system.

---

## 5. Production interruption

**None observed, and none likely.** The bridge was published before Core, so
there was never a window in which Core required a key the bridge was not yet
sending. The read path was verified working immediately after every publish
(execs 1646, 1652, 1657).

The system has also never carried real traffic: all bridge executions to date
are synthetic, and none predate this session except the 2026-09-07/08 harness
runs.

**One thing did change for any future caller**: both webhooks now require the
`x-panchita-key` header. Nothing is currently configured to send it, so GHL
must be configured with it before a real call can succeed. That is deliberate —
it fails closed rather than open.

---

## 6. Key handling

The shared secret was generated during this pass and delivered to the owner
once, in conversation. It is **not** stored in this repository, in n8n, or in
any workflow version.

To rotate it: generate a new secret and salt, recompute
`sha256(salt + secret)`, and update `SALT` / `VERIFIER_HASH` in the
`Verify Gateway Key` node of both `nMSfr0OE42rpPYgE` and `MS43EWU5Xl6JyaSZ`,
then update the caller's configuration. Rotating requires no change to any
other node, and no downtime if the caller is updated between the two publishes.

---

## 7. Go-live level after this pass

**Still LEVEL 1 — INTERNAL TEST ONLY.**

The hardening removed real attack surface but did not add a missing capability.
Level 2 requires a customer's information to be scoped to that customer (C2),
a human fallback that actually reaches a human (C4), and emergency handling
(C1). All three remain open, and all three are build work rather than
configuration.

What did change: the system is now materially safer to leave running while that
work happens. Before this pass, `panchita-core-v02` would serve owner-scoped
data to any anonymous internet caller who guessed a user id, and a single UI
click could have armed a production-spreadsheet write.
