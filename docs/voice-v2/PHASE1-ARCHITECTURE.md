# Panchita Voice v2 — Phase 1 Architecture (Design Only)

**Status:** DESIGN ONLY. Nothing in this document is deployed.
**Production voice mode is unchanged** and remains the push-to-talk implementation at commit `b01eb18`.
**Branch:** `claude/happy-mayer-f3mqol` (not merged, not published — GitHub Pages serves `main` only).

---

## 0. What was inspected (facts, not assumptions)

### 0.1 Frontend — `index.html` @ `b01eb18`

Single static file, 914 lines, no build system, no dependencies, served by GitHub Pages at
`https://jltruckrepairsec.github.io/panchita-personal-web/`.

| Property | Value |
| --- | --- |
| Only server contact point | `https://panchita.app.n8n.cloud/webhook/panchita-personal-gateway-v01` |
| Auth request | `{message, language, phone_hint, factor_provided}` |
| Authed request | `{message, language, session_id}` |
| Logout request | `{action:"logout", language, session_id}` |
| Response contract | `{status, human_readable_response, sources[], session_token, session_expires_at, error:{type,detail}}` |
| Token storage | **In memory only.** Never localStorage / sessionStorage / IndexedDB / cookies. |
| Voice input | Web Speech `SpeechRecognition`, push-to-talk, `continuous=false` |
| End-of-turn | App-level `SILENCE_MS = 3500` timer + `MAX_TURN_MS = 15000` failsafe |
| Voice output | `speechSynthesis` with locale-prefix voice fallback |
| Echo prevention | `speak()` calls `stopRecognition()` — **the mic is hard-closed while Panchita talks** |
| Barge-in | Manual only — tapping the mic cancels TTS |

The current design *cannot* support continuous conversation: the microphone is structurally
closed during playback, and end-of-turn is a fixed timer — exactly the two things Voice v2 must remove.

### 0.2 Backend — n8n workflow `KNuR7CRz7PwDznck`

"Panchita Personal Gateway v0.1 (HARDENED CANDIDATE)" — **active**, 47 nodes, serving the exact
production webhook URL above.

Verified request path:

```
Webhook (CORS locked to https://jltruckrepairsec.github.io)
  → Normalize & Validate Request      message capped at 500 chars; session_id → SHA-256
  → Is Logout?
  → Get Existing Session              data table IiHVYz6sNSC0vLNa, match on hash+tenant+revoked=false
  → Decide Identity                   session reuse OR scrypt factor verify; lockout 3 fails / 15 min
  → Issue Session                     32 random bytes hex; SESSION_MINUTES = 360 (6 h)
  → Get Owner Permissions             data table hMe9JFNmOJZTvM0O, requires panchita.research.read
  → Decide Authorization & Rate Limit RATE_WINDOW_MINUTES = 5, RATE_LIMIT_MAX = 10
  → Classify Intent                   conversational / research / prompt-engineer
  → Conversational agent (Claude Sonnet 5, maxTokens 300)
       or Brave Search → evidence → corroboration
       or Call Adapter (Central Pilot) → workflow N7k0o05HEvV0SqyF
  → Write Audit (WC4DbfS3oUaelDKB) → Respond
```

Data tables in use:

| Purpose | ID | Key columns |
| --- | --- | --- |
| Sessions | `IiHVYz6sNSC0vLNa` | `session_token_hash`, `tenant_id`, `identity_id`, `expires_at`, `revoked` |
| Credentials | `mQTQQwEpI20gwI3X` | scrypt `verifier_hash`, `salt`, `kdf_parameters` |
| Verification state | `HvmupltAc8MUes8O` | `failed_attempts`, `locked_until` |
| Permissions | `hMe9JFNmOJZTvM0O` | `tenant_id`, `identity_id`, `permission` |
| Rate limit | `NtavtO3F8rLkVU9I` | `identity_id`, `window_start`, `request_count` |
| Conversation memory | `t3KV0xGnv1sOH5xL` | `session_token_hash`, `role`, `content` (last 8 turns) |
| Audit | `WC4DbfS3oUaelDKB` | `request_id`, `identity_id`, `outcome`, `reason` |

Tenant is hard-coded server-side (`jl-truck-repair-test`) and is never client-supplied. Authorization
is a **separate** check from identity. Both properties must be preserved exactly.

### 0.3 Credentials available in n8n

`list_credentials` returns **exactly one** real credential: a Google Sheets OAuth account.
All AI nodes (Claude Sonnet 5, Brave Search) run on **n8n Gateway Credits** — managed credentials that
bind only to specific LangChain/vendor nodes. **They cannot authorize an arbitrary HTTP Request node.**

This is the single hard blocker for Voice v2 and is covered in §3.

---

## 1. Proposed architecture

### 1.1 The governing principle

> **The realtime voice system is ears and a mouth. It is never the brain, and never an authority.**

Every business answer continues to come from Gateway → Central, over the **unchanged** request contract.
The realtime layer holds no session token, has no tools, and cannot make an authorization decision.

### 1.2 Transport and provider

**OpenAI Realtime API over WebRTC**, model `gpt-realtime-2.1` (or `-mini`, §5).

WebRTC over WebSocket because, on Android Chrome specifically, it gives us:

* **Browser acoustic echo cancellation** wired to the actual render stream — the correct fix for
  self-transcription, replacing today's "close the mic while speaking" hack.
* Opus, adaptive jitter buffer, packet-loss concealment, and congestion control on mobile data.
* No manual PCM chunking/resampling in JS — less battery, fewer Android audio-path bugs.

### 1.3 The turn loop

The key configuration decision. The session is a **conversation** session (`type: "realtime"`), *not* a
transcription-only session — semantic VAD turn detection is only available in conversation sessions.
Autonomous answering is then switched off:

```jsonc
{
  "type": "realtime",
  "model": "gpt-realtime-2.1",
  "audio": {
    "input": {
      "transcription": { "model": "gpt-live-transcribe" },
      "turn_detection": {
        "type": "semantic_vad",
        "eagerness": "low",          // waits longer; Luis pauses to think. max ~8 s
        "create_response": false,    // ← THE SAFETY PIN: the model never answers on its own
        "interrupt_response": true   // ← barge-in cancels in-flight speech server-side
      }
    },
    "output": { "voice": "marin" }
  },
  "instructions": "You are a text-to-speech renderer. Read the most recent assistant message aloud, verbatim, in its original language. Never add, omit, translate, summarise, answer, or comment. You have no tools and no knowledge."
}
```

`create_response: false` is what makes this design safe: semantic VAD still detects end-of-turn, but the
model is structurally incapable of replying until the **client** explicitly issues `response.create`.
Panchita's words can therefore only ever originate from the Gateway.

Per turn:

```
Luis speaks
  → semantic VAD decides he has finished (semantic, not a fixed timer)
  → conversation.item.input_audio_transcription.completed   → transcript
  → client POSTs {message: transcript, language, session_id} to the EXISTING Gateway
  → Gateway → identity → authz → rate limit → Central/agent → human_readable_response
  → client injects that exact text as an assistant conversation item
  → client sends response.create (audio only, verbatim instructions)
  → Panchita speaks; mic stays open the whole time
  → listening continues automatically
```

Requirements 1–11 and 15 are met by this loop. Mute (12–13) and End Session (14) are §2.3 / §2.4.

### 1.4 Verbatim-speech integrity

Injecting text and asking a generative model to read it is not a hard guarantee. Three tiers:

| Tier | Mechanism | Determinism | Latency | Echo cancellation |
| --- | --- | --- | --- | --- |
| **B1 (primary)** | Inject assistant item + constrained `response.create` | High, not absolute | ~300 ms | ✅ full (WebRTC render stream) |
| **B2 (fallback)** | Separate `/v1/audio/speech` TTS, proxied | Absolute | +300–600 ms | ⚠️ degraded |
| **B3 (last resort)** | Existing `speechSynthesis` | Absolute | ~0 | ❌ none |

**Recommendation: B1, with an automated integrity guard.** The realtime output transcript is compared
against the Gateway text; on divergence beyond a similarity threshold the turn is logged and the client
drops to B3 for that turn. This is measurable and must be a Phase 2 acceptance test.

Note that echo cancellation is a second, independent reason to prefer B1: browser AEC reliably subtracts
audio it rendered through the WebRTC pipeline. B2/B3 play through a path the AEC does not model, so
self-transcription risk returns — which is precisely why today's code has to close the mic.

---

## 2. Lifecycle definitions

### 2.1 Realtime session lifecycle

| State | Enter | Exit |
| --- | --- | --- |
| `IDLE` | page load, voice off | user taps **Start voice** |
| `MINTING` | POST to voice-mint relay | client secret received / error |
| `CONNECTING` | SDP offer → answer, data channel open | `session.updated` / timeout 10 s |
| `LISTENING` | session configured, mic live | speech detected / mute / end |
| `CAPTURING` | `input_audio_buffer.speech_started` | semantic VAD end-of-turn |
| `THINKING` | transcript sent to Gateway | Gateway response / error / barge-in |
| `SPEAKING` | `response.create` issued | `response.done` / barge-in / cancel |
| `MUTED` | user taps mute | user unmutes |
| `RECONNECTING` | ICE failed / disconnected | recovered / gave up → fallback |
| `ENDED` | user ends, expiry, or fatal error | — |

`THINKING` must never be silent. Because Panchita's brain is an n8n workflow rather than the realtime
model, the gap is seconds, not milliseconds (§5.2). On entering `THINKING` the client immediately plays a
short spoken acknowledgement ("déjame ver…" / "let me check…") — the same technique ChatGPT Voice uses to
cover tool calls. Without it the experience will feel broken.

### 2.2 Microphone lifecycle

Acquired **once** per voice session, inside the user-gesture task:

```js
navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true,
           channelCount: 1 }
})
```

Held open across turns — never re-acquired per turn (today's per-turn `SpeechRecognition.start()` is the
source of the Android lifecycle failures the diagnostic panel was built to chase). Released only on
End Session, hard-mute, or fatal error. `track.onended` (Bluetooth switch, device revoked) triggers
re-acquisition once, then falls back.

### 2.3 Mute / unmute

Requirement 13 is "stop microphone transmission/listening until unmuted". Two levels:

* **Soft mute (default):** `sender.replaceTrack(null)` + `track.enabled = false`, plus
  `input_audio_buffer.clear` so no partial audio is committed. Nothing is transmitted. Unmute is instant.
  The OS mic indicator stays lit — the device is still open. This must be stated honestly in the UI.
* **Hard mute (opt-in):** `track.stop()`. The OS indicator goes out. Unmute costs 200–500 ms and on some
  Android builds re-prompts for permission.

Mute must also suppress `THINKING`/`SPEAKING` transitions triggered by anything already in flight.

### 2.4 End voice session

Ordered teardown, idempotent:

1. `response.cancel` + `output_audio_buffer.clear`
2. stop and detach the remote `<audio>` element
3. close the data channel, `pc.close()`
4. `track.stop()` on every local track
5. discard the client secret from memory
6. release the screen wake lock
7. return the UI to text chat

**End voice session ≠ logout.** The Panchita session token survives; text chat continues in the same
interface (requirement 15). Logout remains a separate control that also tears down voice.

### 2.5 Semantic end-of-turn

`semantic_vad` with `eagerness: "low"` (waits up to ~8 s). `low` is chosen deliberately: the production
incident this project just fixed was a *premature cut-off*. Server VAD with a fixed silence duration is
explicitly rejected per requirement 6. Eagerness should be exposed as a hidden tuning control for Luis's
phone testing (`low` / `auto` / `high`).

`MAX_TURN_MS`-style protection is retained as a client-side absolute ceiling (~30 s) purely as a failsafe.

### 2.6 Barge-in

Two layers:

* **Server:** `interrupt_response: true` — the in-flight response is cancelled when speech is detected.
* **Client:** on `input_audio_buffer.speech_started` while `SPEAKING`: send `response.cancel`, send
  `output_audio_buffer.clear` (required on WebRTC to flush already-buffered audio), and stop playback.

**Stale-response rule:** if barge-in happens while a Gateway request is in flight, that request is tagged
stale and its answer is discarded — Panchita must never speak an answer to a superseded question.

### 2.7 Echo / self-transcription prevention

Layered, in order of strength:

1. Browser AEC via `echoCancellation: true` with output on the WebRTC render path (§1.4).
2. `interrupt_response` + client gating: a transcript arriving while `SPEAKING` is checked for
   high similarity against the text currently being spoken; a match is dropped as echo.
3. Turn-token guard: exactly one Gateway submission per detected turn (carry over the existing
   `turnSubmitted` discipline, which already works).

The current implementation's approach — closing the microphone — is explicitly abandoned, since it makes
requirement 10 (interrupt while she speaks) impossible.

### 2.8 Bilingual Spanish / English

* Transcription is *hinted*, never hard-locked, so Luis can code-switch mid-sentence.
* `language` continues to be passed to the Gateway unchanged; Central already honours it.
* The spoken text's language is whatever the Gateway returned — B1 reads it verbatim, so language
  selection stays a backend concern and cannot drift.
* Voice choice must be a voice that renders both languages acceptably; verify on-device in Phase 2.

### 2.9 Reconnect

| Event | Action |
| --- | --- |
| `iceConnectionState = disconnected` | wait 3 s for self-recovery |
| still disconnected | ICE restart on the existing peer connection |
| ICE restart fails | full teardown → re-mint client secret → reconnect (attempt 2 of 2) |
| second failure | end voice, surface message, offer push-to-talk fallback |

The Panchita session token is **never** re-minted by a voice reconnect. Server-side conversation memory
is keyed on the session hash, so context survives a reconnect intact.

### 2.10 Network loss

`navigator.onLine` + ICE state are both watched. On loss: enter `RECONNECTING`, soft-mute to stop
capturing audio that cannot be sent, show explicit state. Any Gateway request in flight is treated as
stale on recovery. Voice never silently appears to be listening while offline.

### 2.11 Session expiration

Two independent clocks:

* **Panchita session** — 6 h, server authoritative. The existing 15 s client watchdog is retained.
* **Realtime session** — the client secret is short-lived (~120 s, used only to connect); the connection
  itself has a provider maximum and must be treated as finite.

If the Gateway returns expiry/revocation mid-voice, teardown (§2.4) runs **before** the UI returns to
login. A hot microphone must never be left running on the login screen.

### 2.12 Android Chrome behaviour

| Concern | Handling |
| --- | --- |
| Secure context | GitHub Pages is HTTPS ✅ |
| Autoplay policy | remote `<audio>` attached and `.play()`d inside the start-button gesture |
| In-app webviews (WhatsApp, Gmail) | WebRTC support is inconsistent — detect and instruct "open in Chrome", reusing the existing message |
| Screen lock / backgrounding | request Screen Wake Lock while voice is active; on `visibilitychange` to hidden, soft-mute and show state rather than pretending to listen |
| Bluetooth device switch | `track.onended` → re-acquire once → else fallback |
| Battery / thermal | continuous WebRTC is heavy: enforce a max session duration and an idle auto-end (~90 s of no speech) |
| Permission model | one `getUserMedia` prompt per session; no per-turn re-prompting |

### 2.13 Privacy and microphone indicators

* A persistent, unambiguous in-app state chip: **LISTENING / MUTED / THINKING / PANCHITA SPEAKING**,
  plus a live input-level meter so an open mic is *visible*, not inferred.
* No audio is recorded or stored by Panchita.
* **New disclosure required:** Voice v2 streams Luis's microphone audio to OpenAI, a processor the current
  system does not use at all. Transcripts continue into the existing conversation-memory table exactly as
  text chat does today. Luis must consent to this before Phase 2 deployment.

### 2.14 Fallback to push-to-talk

Voice v2 ships as a **separate page** (`voice-v2.html`). `index.html` stays byte-identical to `b01eb18`.
Automatic fallback triggers: mint failure, no WebRTC, permission denied, two failed reconnects, or
integrity-guard failures. Fallback is always one tap away and never loses the session.

---

## 3. Backend / relay requirements

### 3.1 The blocker

Minting an ephemeral client secret requires a server-side call:

```
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer <OPENAI_API_KEY>
{ "expires_after": { "anchor": "created_at", "seconds": 120 },
  "session": { "type": "realtime", "model": "gpt-realtime-2.1", ... } }
```

n8n holds **no OpenAI API key**. Its OpenAI access is Gateway Credits, which attach only to designated
LangChain nodes and **cannot authenticate an arbitrary HTTP Request node**.

> **Phase 2 cannot start until Luis adds a real OpenAI API key, funded by his own OpenAI account, as an
> n8n credential.** It must never appear in the GitHub Pages frontend.

### 3.2 Proposed relay — new, isolated, reversible

A **new** workflow, `Panchita Personal Voice Relay v0.1`, webhook `panchita-personal-voice-mint-v01`.
Deliberately *not* an edit to the live Gateway: additive, and deactivating it kills Voice v2 instantly
without touching production.

```
Webhook (CORS: https://jltruckrepairsec.github.io only)
  → Normalize            accept ONLY {session_id, language, request_id}; SHA-256 the token
  → Get Session          IiHVYz6sNSC0vLNa: hash + tenant + revoked=false + not expired
  → Get Voice Permission hMe9JFNmOJZTvM0O: NEW permission `panchita.voice.realtime`
  → Mint Rate Limit      separate budget (e.g. 6 mints / 10 min per identity)
  → HTTP Request         POST api.openai.com/v1/realtime/client_secrets  (API key credential)
  → Write Audit          WC4DbfS3oUaelDKB
  → Respond              { value, expires_at }   ← nothing else, ever
```

Non-negotiable properties:

* Identity, tenant isolation, and authorization are re-checked here — the relay **reuses** the Gateway's
  rules and grants nothing on its own.
* Least privilege: a **new, separate** permission `panchita.voice.realtime`. Voice access is not implied
  by `panchita.research.read`.
* The entire realtime session config is pinned **server-side**. The client cannot choose the model,
  the voice, the instructions, or the turn-detection mode.
* The response contains the ephemeral secret and nothing else. The API key never leaves n8n.
* Failure is closed and neutral, matching the Gateway's existing behaviour.

### 3.3 Required backend changes, in full

1. New OpenAI API key credential in n8n. **(blocker, Luis)**
2. New workflow above. **(additive)**
3. One new permission row: `panchita.voice.realtime` for Luis's `identity_id`. **(additive)**
4. **Rate limit — see §6.2. A real change to voice budget is required, or continuous conversation will
   trip the existing 10-per-5-minute limit within about two minutes.**
5. Optional: raise the 500-character message cap, which spoken turns can exceed.

Nothing in Truck Repair workflows, GHL, ShopMonkey, payments, operational writes, Guardian, or Mission
Control is touched, read, or referenced.

---

## 4. Files and components

| Path | Status | Purpose |
| --- | --- | --- |
| `index.html` | **UNCHANGED** | production push-to-talk, `b01eb18` |
| `voice-v2.html` | new, isolated | Voice v2 page; own login reuse, WebRTC engine, state machine |
| `docs/voice-v2/PHASE1-ARCHITECTURE.md` | this file | design record |
| n8n `Panchita Personal Voice Relay v0.1` | new | ephemeral-secret minting (§3.2) |
| n8n permission row `panchita.voice.realtime` | new | least-privilege grant |

`voice-v2.html` internal components: `SessionMinter`, `RealtimeTransport` (WebRTC + data channel),
`TurnController` (state machine §2.1), `GatewayClient` (unchanged contract), `SpeechRenderer` (B1/B2/B3
with integrity guard), `MicController` (§2.2–2.3), `PresenceUI` (§2.13), `FallbackController` (§2.14).

Deliberately **not** shared with `index.html`: no refactor of production code, so Voice v2 cannot
destabilise the deployed interface. Duplication here is the safety property, not a defect.

---

## 5. Cost and latency

### 5.1 Cost (published rates, Sept 2026)

| | `gpt-realtime-2.1` | `gpt-realtime-2.1-mini` |
| --- | --- | --- |
| Audio input | $32 / M tokens | $10 / M |
| Cached audio input | $0.40 / M | $0.30 / M |
| Audio output | $64 / M tokens | $20 / M |

Using the documented approximation (~600 tokens per minute of input audio, ~1,200 per minute of
generated speech), a 10-minute session with ~3 minutes of Panchita speaking:

* input 10 min → ~6,000 tok → **$0.19** (full) / **$0.06** (mini)
* output 3 min → ~3,600 tok → **$0.23** (full) / **$0.07** (mini)
* **≈ $0.42 per 10 min (~$2.50/hr) full, ≈ $0.13 per 10 min (~$0.80/hr) mini**

Caveats: input audio is billed for the whole time the mic streams, including silence — so `MUTED` is a
real cost control, not just privacy. Conversation context is re-billed as it grows; prompt caching at
$0.40/M is what keeps that bounded. Treat these as order-of-magnitude until measured.

Because this design uses the realtime model only as ears and mouth (no reasoning, no tools), **mini is
likely sufficient** and should be the Phase 2 default, with the full model as an A/B option.

### 5.2 Latency — the honest constraint

| Segment | Estimate |
| --- | --- |
| Semantic VAD end-of-turn | 200–800 ms (`low` can wait up to ~8 s by design) |
| Transcription completion | 100–300 ms |
| **Gateway round trip** | **1.5–5 s — n8n Cloud, 6+ data-table reads, Claude Sonnet 5 agent; longer on the research/Central path** |
| Speech start | ~300 ms |
| **Total to first word** | **~2.5–7 s** |

> **This will not match ChatGPT Voice latency, and no amount of frontend work will change that.**
> ChatGPT is fast because the realtime model *is* the brain. Panchita's brain is deliberately an n8n
> workflow behind a Gateway — which is exactly the security property Luis asked to preserve. The
> trade-off is real and structural.

Mitigations: the immediate spoken acknowledgement (§2.1), `eagerness` tuning, and mini for faster TTS
start. The Gateway round trip **has not been measured** — it requires a real authenticated session, and
probing it would write to production verification/audit tables. **Measuring it is Phase 2, task 1.**

---

## 6. Security analysis

### 6.1 Threat model

| Threat | Assessment |
| --- | --- |
| Ephemeral secret stolen from the browser | **Contained.** Grants a metered OpenAI session with no tools, no Gateway access, no Panchita data. Blast radius is OpenAI spend. Mitigated by 120 s expiry, mint rate limit, per-session binding, audit. |
| Realtime model becomes an authorization authority | **Structurally impossible.** It holds no credentials, has no tools, and `create_response:false` means it cannot even speak unprompted. |
| Voice bypasses Gateway / auth / permissions / tenant isolation | **Prevented by construction.** Every turn is an ordinary Gateway request over the unchanged contract. The relay re-validates identity, tenant, and a separate voice permission. |
| Prompt injection via spoken audio | **Low.** The model has no tools and cannot act. Worst case is mis-rendered speech, caught by the integrity guard (§1.4). |
| Session token leaked to OpenAI | **Prohibited by rule:** the session token must never appear in session instructions, conversation items, or any realtime payload. Enforce in code review. |
| API key exposure in the frontend | **Prevented.** Key lives only in the n8n credential store; the browser only ever sees a 120 s client secret. |
| Hot mic after session expiry | Teardown ordered before the login transition (§2.11). |
| New processor for audio | Genuine new exposure. Requires Luis's explicit consent (§2.13). |
| CORS | Relay must be locked to `https://jltruckrepairsec.github.io`, matching the Gateway. |

### 6.2 Two defects found in the **existing** system

Both are pre-existing and are **not** changed by this phase, but Voice v2 cannot ship without addressing them.

**(a) A rate-limit trip logs Luis out.** `Build Denied Response` returns
`error.detail = 'rate_limited'`, but `index.html` treats *any* `status:"denied"` while holding a token as
session expiry and forces re-login. With `RATE_LIMIT_MAX = 10` per 5 minutes, a continuous voice
conversation trips this in roughly two minutes and would eject Luis mid-sentence.

*Fix:* frontend must branch on `error.detail` (a client-only change — the Gateway already returns it),
**and** voice needs a higher, separate turn budget. Both are Phase 2 prerequisites.

**(b) Minor information disclosure.** `error.detail` exposes internal reasons such as
`identity_factor_mismatch` and `identity_session_expired` to unauthenticated callers, while
`human_readable_response` stays correctly neutral. Low severity, worth a separate decision — a coarse
`reason_code` would serve the frontend without leaking the internal enum. **Not in Voice v2's scope.**

---

## 7. Android limitations (summary)

1. In-app webviews may not support WebRTC — detect and redirect to Chrome.
2. Screen lock / backgrounding can suspend capture — wake lock plus honest UI state; do not claim to be
   listening when suspended.
3. Continuous WebRTC is battery- and thermally-expensive — max duration and idle auto-end are required.
4. Bluetooth/route changes can kill the track — re-acquire once, then fall back.
5. AEC quality varies by device; loudspeaker use is the worst case and the primary echo test scenario.
6. `getUserMedia` and `SpeechRecognition` are *separate* permission gates (the current diagnostic panel
   exists because of this) — Voice v2 depends only on `getUserMedia`, which is the better-behaved one.

---

## 8. Phase 2 implementation plan

Gate 0 is a hard blocker; nothing after it can start.

| # | Task | Owner | Exit criterion |
| --- | --- | --- | --- |
| **0** | **Add a real OpenAI API key to n8n; Luis consents to audio processing by OpenAI** | **Luis** | credential exists; consent recorded |
| 1 | Measure real Gateway round-trip latency with a live session | Claude | p50/p95 recorded; §5.2 confirmed or revised |
| 2 | Build the Voice Relay workflow (§3.2), inactive | Claude | mints a secret for a valid session; fails closed for invalid/expired/cross-tenant |
| 3 | Add `panchita.voice.realtime` permission row | Claude | present for Luis's identity only |
| 4 | Decide and apply the voice turn budget (§6.2a) | Luis + Claude | continuous conversation does not trip the limit |
| 5 | Fix `denied` handling to branch on `error.detail` — **in `voice-v2.html` only** | Claude | rate-limit trip no longer logs out |
| 6 | Build `voice-v2.html`: transport, state machine, mute, end-session, fallback | Claude | full loop works on desktop Chrome |
| 7 | Verbatim integrity guard + measurement (§1.4) | Claude | divergence rate measured over ≥50 turns |
| 8 | Echo/barge-in testing on loudspeaker | Claude | no self-transcription; barge-in cuts speech <300 ms |
| 9 | Reconnect / network-loss / expiry drills | Claude | every path ends in a defined state; never a hot mic |
| 10 | **Luis tests independently on his actual phone** | **Luis** | explicit approval |
| 11 | Cost review against measured usage | Both | mini vs full decided |
| 12 | Staged release behind opt-in; `index.html` untouched | Claude | production still `b01eb18` behaviour |

Phase 2 does **not** replace the production voice mode. Promotion to default is a separate, explicit
decision after step 10.

---

## 9. Rollback and fallback

| Layer | Mechanism | Blast radius |
| --- | --- | --- |
| Production voice | `index.html` is untouched at `b01eb18` | none — Voice v2 is a different page |
| Voice v2 page | delete the file / revert the commit | none |
| Relay workflow | **deactivate** — Voice v2 dies instantly, Gateway unaffected | none |
| Permission grant | delete the row — voice denied, text chat unaffected | none |
| OpenAI spend | revoke the key; relay fails closed | none |
| Runtime | automatic fallback to push-to-talk (§2.14) | none |
| This branch | never merged to `main`; Pages serves `main` only | none |

Production rollback point remains **`0cdb270`** (pre-hotfix); current production is **`b01eb18`**.

---

## 10. Open decisions for Luis

1. **OpenAI account and key** — Gate 0. Voice v2 cannot proceed without it.
2. **Consent** to streaming microphone audio to OpenAI.
3. **Voice turn budget** — the current 10-per-5-minutes makes continuous conversation impossible.
4. **Latency expectation** — ~2.5–7 s to first word is structural (§5.2). Accept, or revisit whether some
   turns may be answered by the realtime model directly (which would weaken the Central-only guarantee
   and is *not* recommended).
5. **Model** — `mini` (recommended, ~$0.80/hr) vs full (~$2.50/hr).
6. **Verbatim tier** — B1 with guard (recommended) vs deterministic B2.
