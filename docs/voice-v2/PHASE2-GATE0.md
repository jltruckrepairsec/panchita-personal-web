# Panchita Voice v2 — Phase 2, Gate 0 (Design Only)

**Status:** DESIGN + ISOLATED PROTOTYPE. Nothing deployed, nothing published.
**Production:** `index.html` byte-identical to `b01eb18`; GitHub Pages serves `main` only.
**Branch:** `claude/happy-mayer-f3mqol` (unmerged).

This document supersedes §1.4 of `PHASE1-ARCHITECTURE.md`. That section proposed having the Realtime
model read Central's text aloud. **Under your correction, that approach is rejected** — see §3.

---

## 1. Architecture correction: the Realtime provider is now ears only

Your requirement:

> The Realtime provider must not independently reason, answer, add facts, paraphrase, or make business
> decisions.

Phase 1 proposed satisfying this with a prompt ("read the assistant message verbatim"). **That is a soft
control on a hard requirement, and the vendor's own guidance says it does not hold:**

> "If your tool returns a raw string and separately asks the model to 'repeat exactly,' the model may be
> more prone to paraphrasing, truncation, or blending in its own preamble."

So Voice v2 is re-scoped:

| Role | Phase 1 (rejected) | Phase 2 (adopted) |
| --- | --- | --- |
| Hear + detect end-of-turn | Realtime | **Realtime** |
| Transcribe | Realtime | **Realtime** |
| Decide the answer | Central | **Central** |
| Speak the answer | Realtime (generative) ❌ | **Non-generative renderer** ✅ |

**The generative model now produces no output at all.** `create_response: false` *and* the client never
sends `response.create`. It is reduced to a voice-activity detector plus a transcriber.

A second consequence, which is a genuine privacy improvement: **Central's answers are never sent into the
Realtime session.** OpenAI receives Luis's speech; it never receives Panchita's business responses.

---

## 2. Speech-out tiers

| Tier | Renderer | Drift risk | Cost | OpenAI sees Panchita's answers? |
| --- | --- | --- | --- | --- |
| **A — recommended for prototype** | browser `speechSynthesis` | **None (structural)** | $0 | **No** |
| **B — quality upgrade** | OpenAI `/v1/audio/speech`, proxied | **None (structural)** | ~$15/1M chars | Yes (text only) |
| **C — rejected** | Realtime generative | Paraphrase/truncation | $20–64/M audio tok | Yes |

**Tier A is recommended to start.** It is already proven on Luis's device, it is free, it keeps Panchita's
answers away from a third party, and it is drift-free by construction. Voice quality is its only weakness —
and voice quality was never the failure being fixed. The failure was push-to-talk and premature cut-off,
both of which live on the *input* side.

Tier B is a clean later upgrade: `/v1/audio/speech` is a text→audio transform, not a reasoning model, so it
is equally drift-free. It has no ephemeral-token mechanism, so audio bytes must be proxied through the
relay — bandwidth and latency through n8n Cloud. Defer until the loop is validated.

---

## 3. Semantic-drift prevention (exact design)

Three layers. The first is elimination, not mitigation.

### Layer 1 — Structural: nothing generative ever produces output

```jsonc
"audio": {
  "input": {
    "transcription": { "model": "gpt-live-transcribe" },
    "turn_detection": {
      "type": "semantic_vad",
      "eagerness": "low",
      "create_response": false,   // model may not answer
      "interrupt_response": false // nothing to interrupt; we never create responses
    }
  }
}
```

Client-side invariants, enforced in code and in review:

1. The client **never** sends `response.create`.
2. The client **never** sends `conversation.item.create`.
3. Central's text is **never** written into the Realtime session.
4. The Panchita session token is **never** placed in any Realtime payload.
5. The data channel is treated as **receive-only** for everything except `session.update` and
   `input_audio_buffer.clear`.

If nothing generative is asked to emit content, there is no content that can drift.

### Layer 2 — Non-generative rendering

Speech is produced by a text→audio transform (Tier A or B). Neither can reason, answer, or rephrase.

### Layer 3 — Verification, defence in depth

* The rendered string is asserted identical to `body.human_readable_response` immediately before speaking;
  a mismatch aborts speech and shows text only.
* The same string is rendered on screen, so Luis can always read what was said.
* The spoken text is retained for the echo guard (§6), which is only possible because we know it exactly.

**Residual risk: none from the provider.** The remaining risk is transcription error on the *input* side —
Realtime may mishear Luis. That is unavoidable in any voice system and is mitigated by showing the
transcript on screen before/while the answer is fetched, so a misheard turn is visible.

---

## 4. Gate 0A — credential

### 4.1 Requirement (confirmed)

Creating a Realtime client secret requires a **standard OpenAI API key used server-side only**. The
documented pattern is exactly the one designed in Phase 1: the server calls the REST API with the standard
key and returns a short-lived ephemeral key to the browser. Browsers must never hold the standard key.

Organization verification: OpenAI requires business and/or identity verification for *certain* models and
features. Nothing found states that Realtime client-secret creation specifically requires it beyond normal
API access — **but this can only be settled by Luis's own account showing the model as available.** Treat it
as an unknown to be closed during setup, not an assumption.

### 4.2 What Luis must do (no key in chat, ever)

1. Create or use an OpenAI **platform** account (separate from any ChatGPT subscription) with billing.
2. Confirm `gpt-realtime-2.1-mini` is listed as available to that org; complete any verification OpenAI
   prompts for.
3. Set a **hard monthly spend cap** on the OpenAI side — the outermost ceiling, independent of anything
   Panchita enforces.
4. Create a **project-scoped, restricted** API key for Panchita voice only.
5. Add it to n8n as a credential **himself**, in the n8n UI.
6. **Never** paste it into chat, a file, a commit, a workflow parameter, or a Set node.

**I will not create the credential, and I will not ask for the key.** Per your instruction, I have not
created it and will not until you confirm the provider step is complete.

### 4.3 Secure placement

* Lives only in the n8n credential store, referenced by an HTTP Request node in the relay workflow.
* Used by exactly one node, in exactly one workflow.
* Never echoed into a response, an audit row, or a log line.
* Relay returns only `{ client_secret, expires_at, voice_session_id, limits }`.
* Note for hygiene: the `Owner Password Rotation v2` workflow already documents that Set-node parameters
  leak into workflow version history. The same rule applies here — **credential store only, never a node
  parameter.**

### 4.4 Remaining Gate 0A unknown

The exact SDP-exchange URL for the WebRTC handshake could not be confirmed: `developers.openai.com` and
`platform.openai.com` are both blocked by this environment's egress proxy, so I worked from search
snippets. The prototype marks this as a single constant (`REALTIME_SDP_URL`) with a `CONFIRM AT GATE 0A`
comment. It must be read off the live docs before the first connection attempt. **I have not guessed
silently.**

---

## 5. Gate 0B — voice rate/budget policy

### 5.1 Principle

Not a raise. A **parallel, narrower, expiring, session-bound budget** that is strictly harder to obtain
than the thing it replaces, and that substitutes *only* a throughput ceiling — never an identity,
permission, tenant, or module check.

The global 10-per-5-minutes limit stays exactly as it is for all non-voice traffic.

### 5.2 New data table `panchita_voice_budget` (new, isolated)

| Column | Purpose |
| --- | --- |
| `voice_session_id` | opaque, relay-minted; **not** the Panchita session token |
| `session_token_hash` | binds this budget to one authenticated Panchita session |
| `tenant_id`, `identity_id` | tenant isolation, unchanged semantics |
| `issued_at`, `expires_at` | hard voice TTL |
| `turns_used` / `turns_max` | throughput ceiling |
| `spend_estimate_usd` / `spend_max_usd` | spend ceiling |
| `revoked` | instant kill switch |

### 5.3 Ceilings (initial values, tunable)

| Ceiling | Value | Rationale |
| --- | --- | --- |
| Voice session duration | **20 min** | caps provider spend and battery; forces re-auth of intent |
| Turns per voice session | **60** | ~3/min sustained — comfortably natural |
| Concurrent voice sessions per identity | **1** | minting a new one revokes the previous |
| Mints per identity per hour | **4** | bounds worst case to 240 turns/hr, not unlimited |
| Spend per voice session | **$0.75** | hard stop |
| Spend per identity per day | **$5.00** | second-order ceiling |
| Idle auto-end | **90 s** no speech | stops billing a forgotten open mic |

### 5.4 Why this cannot be abused as a bypass

* **Requires full authentication first.** A voice budget can only be minted by presenting a valid,
  unexpired, unrevoked session token that passes the existing identity and tenant checks.
* **Requires a separate least-privilege grant** (`panchita.voice.realtime`), which is *not* implied by
  `panchita.research.read`. Voice can be revoked without touching text chat.
* **Double-bound.** A turn is accepted only if `voice_session_id` **and** `session_token_hash` match the
  same row. A stolen `voice_session_id` alone is useless; a stolen session token alone cannot mint without
  passing the mint rate limit.
* **Bounded in aggregate.** Mint limit × turns_max is the true ceiling, and it expires.
* **Narrower, not wider.** The voice path grants no new permission, reaches no new module, and skips no
  authorization step. Identity, tenant, permission, audit and Central routing all run unchanged. Only the
  throughput counter differs.
* **Fails closed.** A malformed, expired, revoked, or mismatched `voice_session_id` is denied, audited, and
  revokes the budget row.
* **Instantly killable.** Deactivate the relay workflow, or set `revoked`, and voice stops. Text is
  unaffected.

### 5.5 Graceful exhaustion — never a logout

Budget exhaustion returns a distinct, non-fatal signal (`error.detail: 'voice_budget_exhausted'`). The
client ends the voice session cleanly, **keeps the Panchita session**, and tells Luis he can keep typing or
restart voice. Running out of voice minutes is not an authentication event and must never be treated as one.

---

## 6. Frontend denied-handling fix (design level, `voice-v2.html` only)

Today `index.html` treats **any** `status:"denied"` while holding a token as session expiry and forces
re-login. The Gateway already returns a discriminator (`error.detail`), so this is a client-only fix.

| `error.detail` | Meaning | Action |
| --- | --- | --- |
| `identity_session_expired` / `identity_cross_tenant` / `identity_no_session` | session genuinely invalid | **log out** |
| `identity_rate_limited` | login lockout | **log out** |
| `rate_limited` | throughput only, session valid | keep session; back off, retry, notify |
| `voice_budget_exhausted` | voice only | end voice, keep session, keep text |
| `no_permission_grant` | authorization | keep session; "not permitted" |
| missing / unrecognised | unknown | **keep session**, neutral error; log out only if the next request also fails |

This does not weaken anything: the server remains authoritative. A client that wrongly retains a token
simply gets denied again. It changes only whether Luis is *ejected from the UI* for a throughput event.

Applied in `voice-v2.html` only. **Production `index.html` is not modified in this phase** — the same latent
bug remains there and is listed as a separate, explicit decision for you (§9).

---

## 7. Semantic VAD — recommended initial setting

**`eagerness: "low"`.**

Rationale: the production incident just fixed was a *premature cut-off* (1800 → 3500 ms), and requirement 5
is that Luis can pause naturally while thinking. `low` waits longest (max ~8 s ceiling).

The ceiling is not a delay. Semantic VAD ends the turn when the model judges the thought complete, so a
clearly-finished sentence still ends fast; the 8 s only applies to genuinely ambiguous trailing silence.
`auto` (~4 s) and `high` (~2 s) are exposed as a hidden toggle for on-device tuning.

Expected end-of-turn: a few hundred ms on decisive endings, up to ~8 s on trailing-off ones — versus a flat
3.5 s today regardless of meaning.

---

## 8. Files and workflows proposed

| Item | Status | Notes |
| --- | --- | --- |
| `index.html` | **UNCHANGED** | production, `b01eb18` |
| `voice-v2.html` | **created, unpublished** | isolated prototype; on the unmerged branch only |
| `docs/voice-v2/PHASE1-ARCHITECTURE.md` | existing | §1.4 superseded by §3 here |
| `docs/voice-v2/PHASE2-GATE0.md` | this file | |
| n8n `Panchita Personal Voice Relay v0.1` | **NOT created** | needs Gate 0A; would be new + inactive |
| n8n data table `panchita_voice_budget` | **NOT created** | new, isolated |
| Permission row `panchita.voice.realtime` | **NOT created** | least privilege |

Nothing in Central, Truck Repair, GHL, ShopMonkey, payments, Guardian L1–L3, Mission Control, or any
operational write path is touched, and no n8n object has been created or modified in this phase.

---

## 9. Decisions needed from Luis

1. **Gate 0A** — complete the OpenAI provider/account/verification/billing step, then add the key to n8n
   yourself. Say the word and I will build the relay; I will not create the credential.
2. **Speech tier** — Tier A (`speechSynthesis`, free, answers never leave Panchita) to start, upgrading to
   Tier B later? This is my recommendation.
3. **Budget ceilings** — accept §5.3 or adjust.
4. **Production `index.html`** — leave the logout-on-rate-limit bug in place for now (default), or fix it in
   production as a separate small hotfix? It can eject you today on the text path too.

---

## 10. Can the prototype proceed without production changes?

**Yes — and it already has, for everything that does not require the provider.**

`voice-v2.html` exists on this branch with the full state machine, microphone lifecycle, mute, end-session,
barge-in, echo guard, reconnect, Android handling, corrected denied-handling and push-to-talk fallback.
It is not reachable by any URL: Pages serves `main`, and this branch is unmerged.

What it **cannot** do until Gate 0A closes: mint a client secret, so it cannot connect. It detects this and
fails gracefully to the push-to-talk fallback with an explicit Gate 0 message, rather than appearing broken.
The `REALTIME_SDP_URL` constant (§4.4) must also be confirmed against live docs before the first connection.
