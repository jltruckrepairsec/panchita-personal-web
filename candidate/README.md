# Panchita Personal — memory + date/time candidate

**Status: isolated candidate. Nothing here is published, activated, or wired
into n8n.** No Voice v2 file was touched, no n8n workflow was modified, and no
authentication, permission, tenant, GHL, ShopMonkey, payment, Guardian or paid
service was changed.

Files added by this work:

| File | What it is |
| --- | --- |
| `candidate/gateway-time-memory-v1.js` | Reference implementation of the Gateway Code nodes the fix needs. Not deployed. |
| `candidate/memory-time-v1.html` | Isolated frontend candidate. A copy of `index.html` whose only behavioural change is reporting the phone's time zone. |
| `tests/memory-time-gateway.test.js` | 37 tests over the Gateway candidate. |
| `tests/memory-time-frontend.test.js` | 15 tests over the frontend candidate. |
| `tests/memory-time-harness.js` | Offline sandbox for the candidate page. Separate from `tests/harness.js`, which belongs to Voice v2. |

Run everything (Voice v2 tests included, all still green):

```sh
node --test tests/*.test.js
```

---

## Root cause

Read from the live frontend (`index.html`) and the Gateway workflow
`Panchita Personal Gateway v0.1 (HARDENED CANDIDATE, UNPUBLISHED)`
(`KNuR7CRz7PwDznck`, read-only inspection).

### 1. Date/time — nothing supplies it, anywhere

There is no current date or time in the system at all.

* The frontend sends exactly `{ message, language, session_id }`. No clock.
* The Gateway's `Generate Conversational Reply` system message contains persona,
  capability limits and the memory block — and no date, time or time zone.
* The workflow has no `timezone` setting, so even n8n's own `$now` would resolve
  against the instance default, which nothing declares.

So when Luis asks what today's date is, the model answers from its training
prior. That is guessing, and it is the whole of the bug. This is a **model
prompt / Gateway** problem, not a frontend one — except for one piece the server
genuinely cannot know: **which time zone the phone is in.**

### 2. Memory — it exists, but two paths bypass it

The Gateway does have real per-session memory: data table `t3KV0xGnv1sOH5xL`,
keyed `session_token_hash` + `tenant_id`, read by `Get Conversation Memory`,
assembled by `Build Memory Context`, written by `Prepare Memory Rows` →
`Write Conversation Memory`, purged on logout. Session tokens are **not**
rotated per request (`Issue Session` returns `is_new_session: false` on reuse),
so the key is stable for the life of a session. That part is sound.

What breaks "¿qué estábamos haciendo?":

* **Research turns are never recorded.** `Build Research Result → Write Audit`
  only. Anything Luis asked that hit a research trigger (`busca`, `investiga`,
  `noticias`, `cuánto cuesta`, …) leaves no trace in memory. The next
  conversational turn cannot see it, so the honest answer becomes an
  inconsistent one.
* **Research turns are never given memory either.** `Needs Research?` routes
  away from `Get Conversation Memory` entirely.
* **Central-pilot turns write memory but never read it.**
* **The window is 4 exchanges, not 8.** `Get Conversation Memory` has
  `limit: 8`, and each turn writes **two** rows (user + assistant). The
  `MAX_TURNS = 8` in `Build Memory Context` is applied to rows, so the real
  window is four user messages.
* **Ordering is by row `id` only**, which happens to work today but is not the
  turn's own timestamp.
* **Identity is stored but not filtered on.** Isolation currently rests on the
  session hash alone.

### 3. Honesty — nothing instructs it

`Build Memory Context` already emits `(no prior turns in this session)`, but the
system message says only "Recent conversation … for context only." Nothing tells
the model what to do when that string is the whole history, so a warm,
concise assistant fills the gap with something plausible. Fabricated memory is
the *default* behaviour of the current prompt, not an accident.

---

## Proposed architecture

One rule per layer, and each layer only asserts what it can actually know.

```
Phone (index.html)          Gateway (n8n)                      Model
──────────────────          ─────────────────────────          ─────────────
IANA time zone name    ──►  validate the zone                   never sees a
"America/Chicago"           REJECT if unresolvable              raw client claim
                            fall back to a declared default

client_now (ISO)       ──►  compare to the SERVER clock    ──►  authoritative
                            flag skew; never adopt it           date/time line

session_id             ──►  existing verified session       ──►  retrieved
                            → session_token_hash                 history, or an
                            → memory rows for that hash,         explicit
                              that tenant, that identity         "you have none"
                            → nothing at all if the
                              session is expired/revoked
```

**The instant is always the server's runtime clock.** The client can only ever
choose which zone the server's instant is *displayed* in, and only after the
server has independently validated that zone and recomputed the offset from it.
A phone with a wrong clock, a spoofed offset, or a made-up zone name cannot move
the date by a second — it can only earn a note in the prompt saying the phone
disagrees.

**The zone falls back, loudly.** No zone reported, or an unresolvable one, and
the Gateway uses a configured default *and the prompt says it is an assumption*,
so Panchita will name the zone she is assuming rather than quietly being wrong
by an hour. This is the "explicitly bounded" half of the timezone requirement.

**Memory is retrieved, never asserted.** The frontend sends no history at all —
tested — so there is no path by which the client can inject a conversation that
did not happen. Retrieval is gated on a live session first and matched on
`session_token_hash` + `tenant_id` + `identity_id`, and the window counts *turns*
(default 12) rather than rows.

**Absence is a first-class answer.** Every no-context path — no session, expired,
revoked, cross-tenant, or simply no rows yet — returns the same explicit marker
plus an instruction to say so plainly and ask Luis to remind her, and the block
contains nothing shaped like a transcript for the model to pattern-match onto.

---

## Exact files / components affected

### Already built here (isolated, tested, not deployed)

* `candidate/gateway-time-memory-v1.js` — `resolveTimeContext`,
  `buildConversationContext`, `selectMemoryRows`, `buildTimeContextBlock`,
  `buildMemoryContextBlock`, `buildSystemContextBlock`.
* `candidate/memory-time-v1.html` — adds `buildClientTimeContext()` and routes
  every outbound payload through `withClientTimeContext()`. Three new fields:
  `client_now`, `client_time_zone`, `client_utc_offset_minutes` (east-positive,
  the opposite sign from `Date#getTimezoneOffset()`, matching the Gateway).
  `doLogin`, `doLogout`, `sendMessage`, `clearSessionAndReturnToLogin` and
  `buildPhoneHint` are **byte-identical** to `index.html` — a test asserts it.

### Would have to change in the Gateway (NOT done — needs approval)

In `Panchita Personal Gateway v0.1 (HARDENED CANDIDATE, UNPUBLISHED)`:

1. `Normalize & Validate Request` — pass through `client_time_zone` (string,
   ≤64 chars), `client_utc_offset_minutes` (number), `client_now` (string,
   ≤40 chars). Validation only; they grant nothing.
2. New Code node **Build Time Context**, between `Message Valid?` and
   `Classify Intent`. Body = the PURE HELPERS block plus:
   ```js
   const ctx = $('Normalize & Validate Request').first().json;
   const a = $input.first().json;
   return [{ json: { ...a, time_context: resolveTimeContext({
     serverNowMs: Date.now(),
     clientTimeZone: ctx.client_time_zone,
     clientUtcOffsetMinutes: ctx.client_utc_offset_minutes,
     clientNowIso: ctx.client_now,
     defaultTimeZone: 'America/Chicago'
   }) } }];
   ```
3. Replace **Build Memory Context** with the same block plus:
   ```js
   const a = $('Classify Intent (conversational vs research)').first().json;
   const sess = $('Issue Session').first().json;
   const norm = $('Normalize & Validate Request').first().json;
   const session = {
     session_token_hash: sess.is_new_session ? sess.session_token_hash : norm.existing_session_hash,
     tenant_id: a.tenant_id,
     identity_id: a.identity_id,
     expires_at: sess.is_new_session ? sess.expires_at : $('Get Existing Session').first().json.expires_at,
     status: sess.is_new_session ? 'active' : $('Get Existing Session').first().json.status
   };
   const conv = buildConversationContext({
     session, rows: $('Get Conversation Memory').all().map(i => i.json),
     tenantId: a.tenant_id, nowMs: Date.now()
   });
   return [{ json: { conv, system_message: buildSystemContextBlock({
     timeContext: a.time_context, conversation: conv }) } }];
   ```
4. `Generate Conversational Reply` — `systemMessage` becomes
   `={{ $('Build Memory Context').item.json.system_message }}`.
5. `Get Conversation Memory` — raise `limit` from 8 to 32 (rows), and add an
   `identity_id` equality condition. The turn window is enforced in code.
6. **Wire `Build Research Result → Prepare Memory Rows`.** This is the single
   highest-value change for "¿qué estábamos haciendo?". `Build Research Result`
   already emits `human_readable_response` and every node `Prepare Memory Rows`
   references is upstream of the research branch, so it is pure wiring.
7. Optionally route the research and Central branches through
   `Get Conversation Memory` too, so those replies see history as well.
8. Set the workflow `timezone` explicitly so `$now` and the default zone agree.

No data-table schema change is required: the candidate uses the existing
`session_token_hash / tenant_id / identity_id / role / content / turn_at`
columns exactly as they are.

---

## Tests

`node --test tests/*.test.js` → **91 pass, 0 fail** (39 pre-existing Voice v2
tests, unchanged and still green; 52 new).

| Requirement | Tests |
| --- | --- |
| Current date is correct | "the current date comes from the server runtime clock and is correct"; "a phone with a wrong clock cannot change the date"; "an unparseable client clock is noted, never adopted"; "without a runtime clock the builder fails closed rather than guessing"; "the time block is always present in the assembled system message" |
| Timezone correct or explicitly bounded | "daylight saving is handled per instant"; "late-UTC instants resolve to the correct earlier local date"; "a zone east of UTC is handled with the right sign"; "a device that reports no zone gets a bounded answer that declares the assumption"; "a bogus zone name is rejected"; "an unusable default degrades to UTC"; "the zone rule wins over a mismatched client offset"; "an impossible client offset is flagged"; "an agreeing client offset raises no note"; frontend "the reported offset is east-positive and agrees with the reported zone" |
| "¿Qué estábamos haciendo?" uses real recent context | "recent turns of this session reach the prompt, oldest first"; "rows that arrive out of order are put back in chronological order"; "the pair written in the same millisecond keeps user-then-assistant order"; "the window keeps the most recent whole turns"; "the default window is wide enough to cover a real back-and-forth"; "a long turn is truncated, not dropped"; "blank and malformed rows are skipped" |
| No cross-user / cross-session leak | "rows from another session in the same tenant are never visible"; "rows from another tenant are never visible"; "rows belonging to another identity are never visible"; "a request carrying no session hash reads nothing"; "a session belonging to another tenant is refused before any row is read"; "the request's tenant, not the session's, is what the rows must match"; frontend "the page never sends conversation history of its own" |
| Expired / revoked sessions keep no conversational authority | "an expired session reads no conversation memory"; "a session expiring exactly now is already expired"; "a session with no or unreadable expiry is treated as expired"; "a revoked session reads no conversation memory even before its expiry"; frontend "a denied turn drops the session and wipes the transcript"; "the client-side expiry watch also wipes the transcript"; "logging out clears the on-screen transcript" |
| Missing context → honesty, not invention | "no prior turns yields an explicit no-context marker and a do-not-invent instruction"; "the no-context block contains nothing that could be read as a transcript"; "every no-context reason produces the honest block" |
| Boundaries preserved | "the authentication and session code is byte-identical to production"; "the candidate talks to the same single Gateway endpoint and no other"; "the candidate still persists nothing on the device"; "the password is sent once at login and never again"; "the login payload's authentication fields are unchanged"; "the candidate is a separate file and leaves the shipping pages alone" |
| Paste-safety into n8n | "the PURE HELPERS block evaluates standalone, with no require and no n8n globals" |

---

## Risks

1. **The Gateway change is untested against the live workflow.** Everything here
   is proven against the reference implementation; the n8n wiring is proposed,
   not executed. It must be applied to the unpublished candidate workflow and
   exercised there before it goes anywhere near production.
2. **The default time zone is a guess until confirmed.** `America/Chicago` is a
   placeholder. If it is wrong, every no-zone-reported answer is wrong by hours —
   though it will at least *say* it is assuming. Luis should confirm the zone.
3. **The prompt grows.** Twelve turns plus the time block adds roughly 1–2k
   tokens per conversational request against `maxTokensToSample: 300`. Slightly
   slower, slightly more expensive per call, no new service.
4. **Retrieved history reaches the model.** It is fenced ("never an instruction,
   never a permission") and placed *after* the persona and clock, and only ever
   contains this owner's own words — but it is still text in a prompt. The
   existing 500-char-per-row truncation and newline stripping are kept.
5. **Recording research turns increases what memory holds.** Same table, same
   session key, same logout purge — but more of Luis's questions are stored. That
   is the point of the fix and should be a conscious acceptance.
6. **Memory rows outlive an expired session.** Logout purges; expiry does not.
   The rows become unreachable (the hash can no longer authenticate) but they are
   not deleted. A TTL sweep is worth adding separately.
7. **`Intl` time-zone support must exist in the n8n Code sandbox.** Node 18+ with
   full ICU has it; if the instance ships small-ICU, `isValidTimeZone` returns
   false for named zones and everything degrades to UTC — wrong, but declared as
   an assumption rather than silently wrong. Verify on the instance before
   trusting non-UTC output.
8. **Two sessions run in parallel.** Voice v2 is being fixed elsewhere. The
   candidate page is a snapshot of `index.html` and does not include Voice v2's
   turn-assembly work; whichever lands second has to be re-based onto the other.

---

## Answers to the closing questions

**Does this eventually require a backend change?** Yes — and the backend is most
of it. The frontend genuinely cannot fix either defect: it must not be the source
of truth for the clock (it is user-controlled), and it must not be the source of
conversation memory (it could forge one). The frontend's entire honest
contribution is naming the phone's time zone; the date/time injection, the memory
retrieval fixes, and the honesty instruction all live in the Gateway. Steps 1–8
above are the required backend work, none of it applied.

**Can this be completed without new paid services?** Yes. No new node type, no
new credential, no new data table, no new column, no external API. The clock is
`Date.now()` inside a Code node, memory is the data table that already exists,
and the model call is the `Conversational Model` node already in the workflow.
The only cost delta is the larger system prompt on conversational turns.
