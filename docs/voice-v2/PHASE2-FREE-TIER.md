# Panchita Voice v2 — Free-Tier Milestone and Cost Report

**Status:** BUILT, UNPUBLISHED, COSTS $0 TO RUN.
**Production:** `index.html` byte-identical to `b01eb18`. Branch unmerged; Pages serves `main` only.

---

## 1. Headline

**Voice v2's core requirements can be met, and tested on Luis's phone, without spending anything.**

The paid Realtime API is **not** technically necessary for this milestone. It buys exactly one thing —
better end-of-turn detection — and the free Web Speech API already provides non-timer endpointing that is
good enough to answer the question this milestone exists to answer: *does continuous, hands-free voice
feel right on Luis's actual device?*

Spend nothing until that is known.

---

## 2. What made push-to-talk mandatory, and the one-line reason it wasn't

Production `index.html` line 727:

```js
r.continuous = false;   // <- this is the entire reason every turn needs a tap
```

With `continuous = true`, the recogniser stays open across turns and keeps delivering results. That single
change removes push-to-talk at zero cost.

Equally important, the **fixed 3500 ms silence timer is deleted**. End-of-turn now comes from the
recogniser's own endpointer (`result.isFinal`) — an acoustic + language-model decision, not a clock. That
satisfies requirement 6 ("do not use a fixed silence timer as the primary end-of-turn mechanism") on the
free tier. The only timers left are an idle auto-end, a session ceiling, a 350 ms restart gap, and a 45 s
absolute failsafe — none of which decide when Luis has finished talking.

Requirement 7 says use semantic end-of-turn **"where technically available"**. On the free tier it is not
available; the engine's own endpointer is the best free option, and the paid upgrade is a one-constant swap.

---

## 3. Requirement coverage: free vs paid

| # | Requirement | Free (Web Speech) | Paid (Realtime) |
| --- | --- | --- | --- |
| 1–3 | Enter voice, start once, mic stays active | ✅ | ✅ |
| 4 | No press-per-turn | ✅ | ✅ |
| 5 | Pause naturally while thinking | ⚠️ engine endpointer — **the thing to test** | ✅ semantic, tunable |
| 6 | No fixed silence timer as primary | ✅ removed | ✅ |
| 7 | Semantic end-of-turn | ❌ not available free | ✅ |
| 8 | Responds by voice | ✅ `speechSynthesis` | ✅ same |
| 9 | Listening continues automatically | ✅ restart loop | ✅ |
| 10–11 | Barge-in stops speech | ⚠️ on verified transcript (~1 ASR cycle) | ✅ immediate |
| 12–13 | Explicit mute | ✅ **stronger** — recogniser aborted, OS indicator off | ✅ soft mute |
| 14 | End voice session | ✅ | ✅ |
| 15 | Text preserved in same UI | ✅ | ✅ |

Two honest gaps: **semantic end-of-turn (7)** and **barge-in latency (10)**. Everything else is equal or
better on the free tier — mute is genuinely stronger free, because aborting the recogniser releases the
microphone rather than just muting the transmitted track.

---

## 4. Security and privacy: free is *better* here

| | Free (Web Speech) | Paid (Realtime) |
| --- | --- | --- |
| New data processor | **None** — already used in production today | **New**: OpenAI receives Luis's audio |
| New consent needed | No | **Yes** |
| API key to protect | None | Yes, plus a relay to protect it |
| New relay workflow | Not needed | Required |
| New permission/budget tables | Not needed | Required |
| Gateway / auth / tenant isolation | Unchanged | Unchanged |
| Attack surface added | **Zero** | Relay + ephemeral secrets + spend |

Nothing is traded away for cost here. The free path is the **smaller** attack surface and introduces **no
new processor**, so it is the safer option as well as the cheaper one. Under Gate 0B, the voice-budget and
mint-rate machinery exists to contain paid spend — with no paid spend, that machinery isn't needed yet.

The one boundary that is *unchanged either way*: every turn still goes through the existing Gateway →
Central path, with identity, authorization, tenant isolation, rate limiting and audit intact. Central
remains the only source of Panchita's answers, and speech-out remains a non-generative text→audio transform,
so drift is still structurally impossible.

**Remaining shared risk:** the existing global limit of 10 requests / 5 minutes still applies. Continuous
voice will trip it in roughly two minutes, and today's frontend would eject Luis on that. The prototype
already fixes the ejection client-side (denials are classified on `error.detail`). Raising throughput safely
still needs the Gate 0B budget design — but that is an n8n change, **not** a purchase.

---

## 5. Cost report (as required)

### 5.1 Why paid access would be necessary

Only for requirement 7 (semantic end-of-turn) and faster barge-in. Both are **quality improvements to the
input side**, not enablers of the milestone. If free-tier testing shows the engine endpointer cuts Luis off
mid-thought — the exact failure this project has already fought once — then it becomes necessary. Not before.

### 5.2 Lowest-cost safe alternative

The one now built: **Web Speech `continuous = true` + `speechSynthesis`.** $0, no new vendor, no new
processor, no key, no relay. Already validated as syntactically sound and structurally isolated.

### 5.3 Estimated test cost

**$0 for the free milestone.**

If the paid engine is later needed: it is ears-only, so **no audio output tokens are ever billed** (the
client never creates a response). Input audio on `gpt-realtime-2.1-mini` is $10/M tokens at ~600 tokens per
minute ≈ **$0.006/min ≈ $0.36/hr**. Two hours of real testing ≈ **$0.72**.

**The practical floor is OpenAI's minimum credit purchase, typically $5** — that, not the usage, is the real
minimum ticket.

### 5.4 Estimated production cost

**$0** on the free tier, indefinitely.

Paid, at 30 min of voice per day: ~$0.18/day ≈ **$5.40/month**, bounded by the Gate 0B ceilings ($0.75 per
session, $5/day) and the 20-minute session cap and 90-second idle auto-end. Note that input audio bills
during silence, so mute and idle-end are cost controls, not just privacy controls.

### 5.5 Can development continue without paying?

**Yes — and it has.** The complete prototype is built and validated. The remaining work that needs no money:

* Luis tests hands-free conversation on his phone (**the decisive test**)
* echo behaviour with an open mic during playback
* barge-in feel on the free engine
* mute / end-session / expiry / backgrounding drills
* the Gate 0B voice budget in n8n (an n8n change, not a purchase)
* measuring real Gateway latency

---

## 6. The first step that actually requires payment

> **Nothing before Luis's phone test requires a cent.**

The first genuinely paid step is **swapping `EARS_ENGINE` to `"realtime"`**, and it should only be taken if
the phone test shows the free endpointer cutting him off mid-thought or barge-in feeling too slow.

**Minimum to proceed at that point: $5** (OpenAI minimum credit). Expected real usage in testing: **under
$1**. Everything else in the paid design — relay workflow, budget table, permission row — costs nothing to
build and can be built in advance if desired.

---

## 7. Two switches to try before spending anything

Both are in the prototype's config block, both free:

* **`DUCK_MIC_WHILE_SPEAKING`** (default `false`) — if Panchita's own voice leaks into the mic and confuses
  the recogniser, set `true` to pause listening while she speaks. Costs barge-in, keeps hands-free
  turn-taking. Try this before concluding the free engine is unusable.
* **`BARGE_IN_MODE`** (default `"on-transcript"` free) — waits for a verified non-echo transcript before
  cutting her off, so her own voice can't make her interrupt herself. `"on-speech"` is faster but needs the
  verified AEC of the WebRTC paid path.

---

## 8. Recommendation

1. Luis tests the free prototype on his phone.
2. If turn-taking feels right → **ship free, spend nothing.**
3. If he gets cut off mid-thought → try `DUCK_MIC_WHILE_SPEAKING` / `BARGE_IN_MODE`, still free.
4. Only if those fail → **$5 minimum** for the paid ears, as a one-constant swap.

The paid design stays fully specified and ready in `PHASE2-GATE0.md`, so nothing is lost by waiting.
