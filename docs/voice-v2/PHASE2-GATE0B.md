# Panchita Voice v2 — Gate 0B: Voice Request Budget

**Status:** BUILT AND TESTED OFFLINE. **NOT INSTALLED.** Zero cost.
**Production:** Gateway workflow `KNuR7CRz7PwDznck` **unmodified and still active**.
`index.html` byte-identical to `b01eb18`. No n8n object created, modified, or activated.

---

## 1. Existing rate-limit architecture (inspected, not assumed)

Traced through the live workflow's node graph:

```
Webhook → Normalize & Validate → Is Logout?
   → Get Existing Session → Get Verification State → Get Candidate Credential
   → Decide Identity → Update Verification State → Verified?
        branch 0 (TRUE)  → Issue Session → Record Session ─┐
        branch 1 (FALSE) ───────────────────────────────────┤
                                                            ↓
                                            Get Owner Permissions
                                                            ↓
                                            Get Rate Limit State      (table NtavtO3F8rLkVU9I)
                                                            ↓
                                     Decide Authorization & Rate Limit
                                                            ↓
                                            Update Rate Limit State
                                                            ↓
                                                     Authorized?
                                        branch 0 → Message Valid? → …
                                        branch 1 → Build Denied Response
```

The rule, verbatim from `Decide Authorization & Rate Limit`:

```js
const RATE_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX = 10;
```

Four properties that matter, and one that corrected an earlier assumption:

1. **Fixed window, not sliding.** When the window lapses, the branch sets `authorized = true`,
   `count = 1`, `window_start = now`. A boundary straddle therefore permits up to 20 requests in quick
   succession. Pre-existing behaviour; not changed here.
2. **The counter increments even when the request is denied** (`Update Rate Limit State` runs *before*
   `Authorized?`). Good property — hammering does not reset the window.
3. **Both branches of `Verified?` converge on the rate-limit path.** *Correcting my earlier reading:*
   unverified requests also traverse `Get Owner Permissions → Get Rate Limit State → Update Rate Limit
   State`. They are denied on identity grounds inside `Decide Authorization`, but they still execute the
   full data-table chain first.
4. It is the **only** post-authentication throughput control in the Gateway.

### 2. Scope of the existing limit

| Dimension | Scoped? |
| --- | --- |
| Authenticated user (`identity_id`) | **Yes — this is the key.** `Get Rate Limit State` filters on `identity_id` alone |
| Session | No — survives logout/login; one budget per identity |
| Device | No |
| Tenant | **No** — not in the filter. Harmless while single-tenant, a real gap if a second tenant is ever added |
| IP | No |
| Endpoint | No — one budget covers text, voice, research, everything |
| Global | No |

**Unauthenticated traffic is not covered by it at all.** Pre-auth abuse is bounded only by the login
lockout (3 failures / 15 minutes, keyed on `tenant_id + phone_hint`) — and that lockout only engages when
`phone_hint` *and* `factor_provided` are supplied. A flood carrying no credentials produces
`no_credentials_supplied`, increments nothing, and still runs the full data-table chain each time. That
is a pre-existing exposure on the production webhook, listed in §11. **Not changed here.**

### 3. Could changing it weaken anything?

| Property | Effect of raising the global limit |
| --- | --- |
| Authentication | No direct weakening — the limit sits after identity |
| Tenant isolation | No direct weakening |
| Authorization | No direct weakening |
| **Abuse protection** | **Weakened** — it is the only post-auth throughput control |
| **Cost control** | **Weakened** — every allowed request can invoke Claude Sonnet 5 and Brave Search on Gateway Credits |

So: raising the global number would trade away text-path abuse and cost protection to help voice. Rejected.
The budget below is **additive and lane-scoped** instead.

### 4. What continuous voice actually requires (measured)

A natural turn cycle: user speaks ~5 s + Gateway round trip ~3 s + Panchita speaks ~6 s + pause ~2 s
≈ **16 s → 3.75 turns/min sustained**. Rapid short exchanges burst to ~10/min briefly.

Against `RATE_LIMIT_MAX = 10`: the 10th turn lands at 160 s. **Reproduced in the harness — first denial at
exactly 160 s.** That is the ~2.5-minute failure point, confirmed rather than estimated.

### 5. Maximum rate that is safe

Chosen: **burst 12, refill 6/min sustained** — 1.60× the natural pace. Enough headroom that conversation
never stalls, tight enough that a runaway loop is capped at **360 requests/hour**.

Two *independent* ceilings were designed to converge on the same number, so neither alone is load-bearing:

* token bucket: 6/min × 60 = **360/hr**
* mint cap × turn cap: 4 × 90 = **360/hr**

**Honest cost note:** the current text ceiling is 120/hr. Voice raises the worst case to 360/hr — **3×**.
That is the deliberate, bounded price of continuous conversation, and it is stated rather than buried.
Each request remains a ≤300-token Claude Sonnet 5 completion on Gateway Credits.

---

## 3. Architecture selected

**Four independent lanes over one per-identity budget row.** Lane is derived **server-side** from request
shape — a client cannot select its own lane; claiming `voice` without a valid bound voice session simply
fails.

| Lane | Budget | Purpose |
| --- | --- | --- |
| `text` | **10 / 5 min fixed window — production rule, preserved exactly** | normal typing |
| `voice` | token bucket, burst 12, refill 6/min | authenticated conversation |
| `retry` | token bucket, burst 3, refill 1/min | client retries, isolated so a storm cannot eat the conversation |
| `mint` | 4/hour, min 20 s apart | voice-session control (system/internal); carries no content |

The decisive safety property:

```js
authorized_final = authorized_upstream AND budget_allows
```

**The budget node can only ever narrow a decision.** It cannot authorize anything upstream denied. Identity,
permissions, tenant isolation, session validation and audit remain entirely upstream and untouched.

### Safeguards

| Threat | Control | Consumes conversation budget? |
| --- | --- | --- |
| Duplicate transcripts / recogniser repeated finals | normalized-hash match within 15 s | **No** — it is a client defect, not abuse |
| Duplicate storm (real loop) | ≥20 duplicates → session revoked | n/a |
| Client retry storms | separate `retry` lane + 700 ms debounce | **No** |
| Rapid reconnect loops | 4 mints/hr + 20 s minimum interval; a new mint revokes the previous session | n/a |
| Replay / stolen `voice_session_id` | must match the live id **and** the bound `session_hash` | denied |
| Malformed requests | counted; ≥5 → session revoked | denied |
| Unauthenticated | denied before any budget is read or written | **No** |
| Expired session | checked before any budget is touched | **No** |
| Cross-tenant / identity mismatch | budget row bound to one `identity_id` + `tenant_id` | denied |
| Runaway request storm | 700 ms debounce + token bucket | bounded |

---

## 4. Files and n8n objects

| Item | Status |
| --- | --- |
| `voice-v2/budget/voice-budget.js` | **created** — pure algorithm, injected clock, no I/O |
| `voice-v2/budget/test-voice-budget.js` | **created** — 37-assertion harness, virtual clock |
| `voice-v2/budget/n8n-code-node.js` | **created** — drop-in Code node + wiring spec |
| `docs/voice-v2/PHASE2-GATE0B.md` | this file |
| **n8n workflows** | **NONE created, NONE modified, NONE activated** |
| **n8n data tables** | **NONE created** |
| `index.html` | **UNCHANGED** (`b01eb18`) |

**Why no n8n object was created.** The budget only takes effect if the live Gateway consults it, which
means editing production — explicitly out of scope. An isolated, inactive workflow would enforce nothing
and would leave an orphan object in the instance. The algorithm was instead verified offline, and the
verification is stronger than a manual n8n run would have been (§6).

---

## 5. Limits selected, and why

| Limit | Value | Reason |
| --- | --- | --- |
| Voice burst | 12 | absorbs the fastest natural exchange without throttling |
| Voice refill | 6/min | 1.60× the measured 3.75/min need; caps runaway at 360/hr |
| Retry burst / refill | 3 / 1 per min | enough for genuine transient failures, useless for a storm |
| Mint | 4/hr, ≥20 s apart | bounds reconnect loops; still allows real network recovery |
| Voice session TTL | 20 min | bounds one sitting; forces a fresh authorized decision |
| Voice session turns | 90 | a 20-min session at natural pace is ~75 turns, so this binds only on abuse |
| Debounce | 700 ms | below any human turn cycle; kills double-fires and storms |
| Duplicate window | 15 s | covers recogniser repeats; the same phrase later is legitimate |
| Duplicate abuse | 20 | a real loop, not a stutter |
| Malformed | 5 | tolerant of a transient client bug, intolerant of probing |
| **Text** | **10 / 5 min** | **unchanged from production, deliberately** |

---

## 6. Tests performed

Offline, deterministic, virtual clock — no network, no n8n, no provider, **$0**.

```
node voice-v2/budget/test-voice-budget.js
```

Every scenario requested was covered: 5 minutes, 15 minutes, burst speech, normal pauses, duplicate
recognition events, reconnection, retries, and unauthorized traffic — plus lane isolation, expiry,
malformed input, cross-tenant, replay, and a worst-case abuse bound.

**Parity check:** the algorithm inlined into `n8n-code-node.js` was extracted and run against the *same
unmodified suite* — **37/37**, confirming the deployable copy behaves identically to the tested one rather
than merely resembling it.

---

## 7. Results

**37 passed, 0 failed** (module) and **37 passed, 0 failed** (inlined n8n copy).

| Scenario | Result |
| --- | --- |
| Baseline reproduction of today's failure | first denial at **160 s**, 22/40 allowed — matches the reported symptom |
| 5-minute natural conversation | **19/19 allowed, 0 denied** |
| 15-minute natural conversation | **57/57 allowed, 0 denied** |
| Burst speech | 13 allowed, 1 throttled; **full recovery after a 60 s pause** |
| Long thinking pauses (75 s) | **0 denied** — pausing is never punished |
| Duplicate finals | 5/5 suppressed; **0 budget consumed**; turn counter stayed at 1 |
| Same phrase after the window | allowed again (not a false positive) |
| Duplicate storm | revoked after 20; **reached Central exactly once** |
| Retry storm (60 attempts) | 3 allowed; **voice budget untouched at 12.00/12**; conversation still worked |
| Reconnect loop (40 attempts) | **4 mints allowed** (cap 4), 12 rejected as too fast; recovered next hour |
| Reconnect mid-conversation | new session issued, **stale id rejected**, conversation resumed |
| Unauthenticated (500 requests) | **500/500 denied, 0 budget consumed** |
| Cross-tenant / identity mismatch | denied (`principal_mismatch`) |
| Stolen `voice_session_id` | denied (`session_binding_mismatch`) |
| Expired session | denied before any budget touched |
| Malformed storm | revoked after 5 |
| Voice session TTL | enforced |
| Lane isolation | 30 voice turns left `text.count = 0`; text still worked |
| **Worst-case abusive authenticated client** | **360 requests/hour**, matching both designed ceilings |

**Legitimate conversation ran 15 minutes without a single denial — roughly 6× past the current
2.7-minute failure point — while every abusive pattern stayed bounded.**

---

## 8. Abuse and security tests

All passed: unauthenticated flood (no budget consumed — attackers cannot exhaust Luis's allowance),
identity mismatch, cross-tenant, stolen voice-session replay, session-binding mismatch, expired session,
malformed storm, duplicate storm, retry storm, reconnect loop, and a full simulated hour of maximal abuse.

Preserved by construction: authentication, authorization, tenant/session isolation, existing security
boundaries, auditability (every decision emits a `budget_audit` trail), replay/loop protection, and
request-storm protection.

**Known limitation, stated plainly:** n8n data-table read-modify-write is not atomic. Two truly
simultaneous requests could both read the same state and both be allowed, overshooting by the concurrency
count. With one phone and a 700 ms debounce this is very unlikely and the overshoot is small and bounded —
but it is a real property of the storage layer, not something this algorithm can fix alone.

---

## 9. Did anything in production change?

**No.**

* Gateway workflow `KNuR7CRz7PwDznck`: unmodified, still active, byte-identical behaviour.
* No n8n workflow, data table, credential, or permission created or modified.
* `index.html`: byte-identical to `b01eb18` (verified: 0-line diff against `origin/main`).
* `origin/main`: still `b01eb18`. All work is on the unmerged branch; Pages serves `main` only.
* No business writes, no ShopMonkey, no payments, no GHL routing, no permission changes.

---

## 10. Can the phone prototype sustain normal conversation now?

**Not yet — and this must not be overstated.**

The budget layer (condition **B**) passes sustained testing. But it is **not installed**, so the live path
still enforces 10 / 5 min: a real phone conversation today would still be throttled at ~2.7 minutes. The
prototype no longer *ejects* Luis when that happens (denials are classified on `error.detail`), but it will
still be interrupted.

Condition **A** — the voice prototype working on Luis's actual device — is **unverified**. Nobody has run it
on the phone yet.

**Therefore the continuous voice milestone is NOT ready for production.** Both conditions must hold; one
is untested and the other is built but not installed.

---

## 11. Remaining blockers

1. **Installation requires a production Gateway edit** (3 new nodes + 1 data table). Out of scope without
   explicit approval. *This is the real blocker.*
2. **Luis's phone test of the free voice prototype** — still the decisive unknown.
3. **Pre-existing:** unauthenticated requests with no credentials run the full data-table chain and
   increment nothing. Separate hardening decision; not part of Voice v2.
4. **Pre-existing:** the rate-limit lookup is not filtered by `tenant_id`. Harmless today, a gap if a
   second tenant is added.
5. **Pre-existing:** fixed-window boundary straddle permits ~20 requests in quick succession on the text
   lane.
6. Data-table write atomicity (§8).

None require payment.

---

## 12. Next approval point

**Approve the production Gateway edit**, which is precisely:

1. Create data table `panchita_voice_budget` (`identity_id`, `tenant_id`, `state_json`, `updated_at`).
2. Insert three nodes between `Get Rate Limit State` and `Update Rate Limit State`:
   `Get Voice Budget Row` → `Decide Voice Budget` (the drop-in node) → `Update Voice Budget Row`.
3. Extend `Normalize & Validate Request` to pass through `voice_session_id` and `is_retry`.

Existing nodes keep their current behaviour; the text lane is bit-for-bit unchanged; the new node can only
narrow an authorization, never widen one. Rollback is deleting the three nodes.

Recommended order: **phone test first** (free, and it may change requirements), then the Gateway edit.
