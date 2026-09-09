# Panchita Personal — memory + date/time candidate (v2, post-review)

**Status: isolated candidate. Nothing is published, activated, or wired into
n8n.** No Voice v2 file was touched, no n8n workflow was created or modified,
and no authentication, permission, tenant, GHL, ShopMonkey, payment, Guardian
or paid service was changed.

| File | What it is |
| --- | --- |
| `candidate/gateway-time-memory-v1.js` | Reference implementation of the Gateway Code nodes. Not deployed. |
| `candidate/memory-time-v1.html` | Isolated frontend candidate. A copy of `index.html` whose only behavioural change is reporting the phone's time zone. |
| `tests/memory-time-gateway.test.js` | 61 tests over the Gateway candidate. |
| `tests/memory-time-frontend.test.js` | 15 tests over the frontend candidate. |
| `tests/memory-time-harness.js` | Offline sandbox for the candidate page. Separate from `tests/harness.js`, which belongs to Voice v2. |

```sh
node --test tests/*.test.js     # 115 pass, 0 fail
```

---

## 0. One finding that changes the risk picture

The workflow named **"Panchita Personal Gateway v0.1 (HARDENED CANDIDATE,
UNPUBLISHED)"** (`KNuR7CRz7PwDznck`) is **not unpublished**. It is `active: true`
and its webhook path is `panchita-personal-gateway-v01` — the exact URL
`index.html` posts to. Its name is misleading: **it is the live production
front door.** Every "do not modify production" instruction applies to it, and
nothing in this work touched it.

---

## 1. Revised architecture

```
Phone (candidate page)        Gateway (n8n)                       Model
──────────────────────        ───────────────────────────         ─────────────
IANA zone name           ──►  validate against the runtime         never sees a
"America/Chicago"             VALID   -> local presentation        raw client
                              INVALID -> UTC, local = null         claim
                                         (never a substitute zone)

client_now (ISO)         ──►  compare against the SERVER clock ──► authoritative
                              flag skew; never adopt it            date/time line

session_id               ──►  1. existing session verified
                                 (unchanged, pre-existing)
                              2. THEN session gate: revoked?
                                 expired? cross-tenant?
                              3. THEN rows matched on
                                 hash + tenant + identity
                              4. THEN grouped into turns,
                                 bounded by turns AND chars  ──►  retrieved
                                                                  history, or an
                                                                  explicit
                                                                  "you have none"
```

Four properties this shape guarantees, each with a test:

**The instant is always the server's.** A wrong phone clock, a spoofed offset or
an invented zone cannot move the date by a second — they can only earn a note
saying the phone disagrees.

**Memory authorization is server-side only.** The frontend sends no history at
all, so there is no path by which a client can assert a conversation that did
not happen. Retrieval runs *after* the session gate, and the gate returns before
a single row is examined.

**Absence is a first-class answer.** Every no-context path — no session, revoked,
expired, cross-tenant, no rows — returns the same explicit marker plus an
instruction to say "I don't have enough prior context for this session" and ask
Luis to remind her. The block contains nothing transcript-shaped to pattern-match
onto. Partial context is also declared: when the window drops older turns, the
prompt says how many are missing and that she does not have them.

**Retrieved text is fenced and de-privileged.** History sits *after* the persona
and the clock, is labelled as a record of past chat, and is explicitly never an
instruction, a permission or a fact to act on.

### Changed from v1, per review

| # | Correction | What changed |
| --- | --- | --- |
| 1 | Remove the `America/Chicago` placeholder | Gone. `defaultTimeZone` no longer exists as an input; a test asserts the string survives only in the sign-convention comment and that passing `defaultTimeZone` has no effect. |
| 2 | Preferred time design | Implemented exactly as specified — see §2. |
| 3 | Memory authorization server-side only | Unchanged and now explicitly tested from the client side too. |
| 4 | Retrieve only after session/auth checks | The session gate returns before `selectMemoryRows` is reached, for all five refusal reasons. |
| 5 | Scope by hash + tenant + identity | Unchanged from v1. |
| 6 | Turn-aware window | `groupIntoTurns()` makes a turn = one user message plus every assistant row before the next user message. Window = 6 turns **and** an 1,800-char budget that drops whole oldest turns. |
| 7 | Research turns in memory, without trust | See §4. |
| 8 | Central context consistency | See §5. |
| 9 | Honest absence | Strengthened to the reviewer's wording, and extended to *partial* context. |
| 10 | TTL design, no destructive cleanup | See §3. Classification only; a test asserts the module exports nothing destructive. |

The frontend candidate needed **no change** for v2: it already omits
`client_time_zone` entirely when the device cannot resolve one, which is exactly
the signal the new policy needs.

---

## 2. Exact timezone fallback policy

Stated as it is implemented in `resolveTimeContext()`.

**Inputs.** `serverNowMs` (required, the runtime clock). Optionally
`clientTimeZone` (IANA name), `clientUtcOffsetMinutes` (east-positive) and
`clientNowIso` — all three advisory.

**The instant.** Always `serverNowMs`. There is no branch in which a client value
becomes the instant. Missing or non-numeric `serverNowMs` **throws**; it does not
fall back to a guess.

**Rule A — device reports a zone this runtime can resolve.**
`local_time_known = true`, `time_zone_source = "client_device"`. Local date, time
and ISO string are computed from that zone. The UTC offset is **recomputed
server-side from the zone**, never taken from the client's claimed offset — the
claim is only compared, and a disagreement adds `client_utc_offset_mismatch`.

**Rule B — device reports nothing, or a zone this runtime cannot resolve.**
`local_time_known = false`, `time_zone = "UTC"`,
`time_zone_source = "safe_fallback"`, and

```
local_date = null   local_time = null   local_iso = null
weekday_* = null    long_date_* = null
```

There is no code path that fills those with a substitute, so **no caller can
accidentally present an incorrect local time.** The prompt then states the
instant in UTC, says the zone is unknown, tells Panchita to answer in UTC and say
so or ask which zone Luis is in, and warns that the local date can differ from
the UTC date near midnight.

**There is deliberately no operator-configured "probable" zone.** A configured
zone would be indistinguishable, inside the prompt, from a device-reported one
while being just as capable of being wrong. UTC is the fallback because it is the
one zone in which the server's own instant is unambiguously true — it is not a
guess about where Luis is, and the prompt never presents it as one.

**Clock skew.** `clientNowIso` is read only to detect disagreement. Beyond 5
minutes it adds `client_clock_skewed`; unparseable adds
`client_now_unparseable`. Neither changes any value — they add one line telling
the model the server's numbers are the ones to use.

**Practical effect.** Android Chrome reports a zone, so Rule A is the normal
path and local time works. Rule B bites only when `Intl` is unavailable, and
there it degrades to *declared* UTC rather than to silent error.

---

## 3. Memory retention / TTL proposal

**Designed and classified. Nothing is deleted.** `classifyMemoryRetention()` is
pure, returns four lists for review, and a test asserts the module contains no
`deleteRows`/`dataTable`/`insert` and exports no name matching
`delete|purge|sweep|drop|remove`.

```js
MEMORY_RETENTION_POLICY = {
  session_ttl_minutes: 360,   // matches SESSION_MINUTES in Issue Session
  grace_minutes:        60,   // clock skew + one in-flight final turn
  hard_retention_hours: 24    // horizon after which an expired row is purgeable
}
```

| Class | Definition | What a future sweep would do |
| --- | --- | --- |
| `live` | age < 420 min | nothing |
| `expired` | age ≥ 420 min | nothing — already unreachable, see below |
| `purgeable` | age ≥ 420 min + 24 h | the **only** set it would delete |
| `undated` | `turn_at` unparseable | nothing, ever — surfaced for human review |

**Two-stage on purpose.** A row becomes *unreadable* long before it becomes
*deletable*. Once its session passes `expires_at`, the session hash can no longer
authenticate, so the read path refuses it — proven by the test that pairs an
expired classification with a `session_expired` context refusal. The 24-hour
horizon after that exists so an incident can still be investigated before
evidence disappears.

**Already covered today:** logout purges that session's rows immediately
(`Purge Conversation Memory (Logout)`, already in the live Gateway). The gap this
policy fills is **expiry without logout** — the common case on a phone.

**Not proposed here:** the sweep itself. It needs its own approval, its own
dry-run showing counts before any delete, and a decision on whether it runs as a
schedule or on demand.

---

## 4. Research-memory trust boundary

The rule: **no externally-sourced text ever enters conversation memory.** Not a
snippet, not a title, not a source name, not a URL, not a finding string.

A research turn is recorded as two rows:

* the **owner's own question**, as a normal `user` row. This is what continuity
  actually needs — "you asked me to look up the air-filter price" is the useful
  memory, and it is Luis's own words, not the web's.
* a **Gateway-generated digest**, role `assistant_research`. It is built from
  counts and a fixed vocabulary only:

  ```
  hice una busqueda web: 3 hallazgo(s), 4 fuente(s), confianza media.
  (Los resultados no se guardan en el historial.)
  ```

  Every number is one the Gateway computed. Every word is defined in
  `RESEARCH_CONFIDENCE_WORDS`, so even a forged `confidence` field cannot inject
  text — an unknown value maps to `none`.

The research payload itself continues to flow to the user in the response and to
the audit log, where it is already handled. It simply never becomes prompt
history.

**Tested with a hostile result** whose every external field carries a `LEAKMARK`
marker and a prompt-injection payload: the digest contains no marker, no URL, no
markup. Newlines in a hand-forged row cannot forge extra transcript lines
(control characters are stripped before rendering). Unknown roles are dropped
rather than rendered with a guessed label.

**And it is de-privileged in the prompt.** The memory block names the
`Panchita (research summary)` label explicitly and says it carries no results, no
quotes, no sources and no external text, grants nothing, and is not a source of
facts about the world.

---

## 5. Central-pilot context behaviour

**Central's contract is not touched.** The adapter
(`N7k0o05HEvV0SqyF`) takes exactly `{ session_id, message, language, request_id }`
today, and this candidate adds nothing to it — no conversation context, no
memory, no trusted-context field. A test asserts the candidate contains no
`trusted_authorization_context`, `conversation_context` or `workflowInputs`.
Central keeps doing its own session verification, keeps
`trusted_authorization_context` hardcoded null, and gains no new authority and no
new input surface.

Consistency is achieved **on the Gateway side instead**: a Central-pilot reply is
recorded to memory with role `assistant_central`, so the *next* conversational
turn has continuity across it. In the prompt it renders as an ordinary
`Panchita:` line — Central turns are not labelled, not elevated, and not framed
as coming from a more privileged component, because to the conversation they are
simply things Panchita said. Central and research rows are subject to exactly the
same session/tenant/identity isolation as any other row, which is tested.

This deliberately leaves Central *reading* memory out of scope. Feeding history
into Central would mean widening its input contract, and that is a Central
decision, not a Gateway one.

---

## 6. Isolated test evidence

```
node --test tests/*.test.js
# tests 115   # pass 115   # fail 0
```

| File | Tests |
| --- | --- |
| `tests/voice-v2-helpers.test.js` | 14 — pre-existing, untouched, still green |
| `tests/voice-v2-turn-assembly.test.js` | 25 — pre-existing, untouched, still green |
| `tests/memory-time-gateway.test.js` | 61 |
| `tests/memory-time-frontend.test.js` | 15 |

| Requirement | Representative tests |
| --- | --- |
| Current date correct, from the runtime clock | "the current date comes from the server runtime clock and is correct"; "a phone with a wrong clock cannot change the date"; "without a runtime clock the builder fails closed rather than guessing" |
| Timezone policy (§2) | "a validated device zone is what determines local presentation"; "a device that reports no zone yields UTC, never a guessed local time"; "the unknown-zone prompt states UTC and forbids claiming a local time"; "a bogus zone name is rejected and takes the same UTC path"; **"no arbitrary placeholder zone survives anywhere in the candidate"**; "daylight saving is handled per instant"; "late-UTC instants resolve to the correct earlier local date"; "a zone east of UTC is handled with the right sign"; "the zone rule wins over a mismatched client offset" |
| Turn-aware window (§1.6) | **"the default window counts turns, not rows"**; "a turn keeps its follow-up assistant rows together"; "the character budget drops whole oldest turns and declares what is missing"; "one enormous turn cannot swallow the window" |
| "¿Qué estábamos haciendo?" uses real context | "recent turns of this session reach the prompt, oldest first"; "rows that arrive out of order are put back in chronological order"; "the pair written in the same millisecond keeps user-then-assistant order" |
| No cross-user/session/tenant leak | "rows from another session in the same tenant are never visible"; "rows from another tenant are never visible"; "rows belonging to another identity are never visible"; "a request carrying no session hash reads nothing"; "Central and research turns are subject to the same isolation rules"; frontend "the page never sends conversation history of its own" |
| Expired/revoked sessions | "an expired session reads no conversation memory"; "a session expiring exactly now is already expired"; "a session with no or unreadable expiry is treated as expired"; "a revoked session reads no conversation memory even before its expiry"; frontend "a denied turn drops the session and wipes the transcript" |
| Honest absence | "no prior turns yields an explicit no-context marker and a do-not-invent instruction"; "the no-context block contains nothing that could be read as a transcript"; "every no-context reason produces the honest block" |
| Research trust boundary (§4) | "a research digest carries counts only — no external text of any kind"; "the digest is built from a fixed vocabulary, so a forged confidence cannot inject text"; "even a hand-forged research row cannot smuggle instructions past sanitisation"; "an unknown role is dropped rather than rendered with a guessed label" |
| Central boundary (§5) | "a Central-pilot reply is recorded and reads as Panchita, not as a privileged source"; **"the candidate adds nothing to Central's input contract"** |
| Retention (§3) | "retention classifies rows into live, expired and purgeable without touching them"; "the retention horizon lines up with the Gateway's own session TTL"; "an expired row is unreadable long before it is purgeable"; **"the candidate exports nothing that can delete or write a row"** |
| Measured cost (§7) | "the six-turn window stays inside its measured cost ceiling"; "the measured cost delta over today's prompt matches what is documented"; "widening the window past six turns buys nothing on real traffic" |
| Boundaries preserved | "the authentication and session code is byte-identical to production"; "the candidate talks to the same single Gateway endpoint and no other"; "the candidate still persists nothing on the device"; "the password is sent once at login and never again"; "the candidate is a separate file and leaves the shipping pages alone" |
| Paste-safety into n8n | "the PURE HELPERS block evaluates standalone, with no require and no n8n globals" |

### What is NOT tested — and why

**The n8n candidate workflow was not built.** See the BLOCKED note at the end.
Everything above is proven against the reference implementation in plain Node.
Nothing here proves the n8n Code sandbox behaves identically — in particular
whether its Node build ships full ICU (see risk 5).

---

## 7. Estimated token / cost impact — measured, not guessed

Measured with `estimateContextCost()` over the real assembled system message.
Character-based with the ratio stated: **3.0 chars/token** (pessimistic, accented
Spanish) to **4.0** (optimistic, plain English). No tokenizer was run, so these
are bounds, not a single number. All figures are asserted by tests, so this table
cannot drift from the code.

| System message | Chars | Est. tokens |
| --- | ---: | ---: |
| **Today (production): persona only** | 960 | **240 – 320** |
| Candidate, no history, zone known | 1,766 | 442 – 589 |
| Candidate, no history, zone unknown | 2,036 | 509 – 679 |
| **Candidate, typical: 6 real turns** | 2,876 | **719 – 959** |
| Candidate, worst case (budget saturated) | 3,695 | 924 – 1,232 |

**Delta per conversational turn: +480 to +640 tokens typical; +910 hard ceiling.**
My earlier "1–2k tokens" estimate was too high and is withdrawn.

### The smallest reliable window: 6 turns

The measurement changes the recommendation's basis. On real traffic the *window*
is not where the tokens go:

| Window | Est. tokens (same conversation) |
| --- | ---: |
| 3 turns | 869 |
| 4 turns | 918 |
| **6 turns** | **959** |
| 8 turns | 959 (identical — the conversation is only 6 turns) |
| 12 turns | 959 (identical) |

Luis's messages are short, so six turns costs **under 100 tokens more than
three** while covering roughly twice the conversation. The cost lives in the
fixed instruction scaffolding (~1,100 chars of time rules + memory fencing +
honesty rules), not in the history. Shrinking the window to save tokens would
trade most of the continuity for almost none of the cost — so **6 turns, with an
1,800-char budget as the real ceiling**, is the recommendation. Going past 6 buys
nothing measurable; a test asserts that.

**Cost in money:** the conversational path already calls Claude Sonnet 5 per
turn. This adds roughly half a thousand input tokens to a call that already
happens. **No new service, no new credential, no new data table, no new column,
no external API.** The only other effect is a marginally longer round trip.

---

## 8. Exact production changes that would eventually be required

**None of these has been applied.** In the live Gateway `KNuR7CRz7PwDznck`:

1. **`Normalize & Validate Request`** — pass through `client_time_zone` (string,
   ≤64 chars), `client_utc_offset_minutes` (number), `client_now` (string, ≤40
   chars). Validation only; they grant nothing.
2. **New Code node "Build Time Context"**, between `Message Valid?` and
   `Classify Intent`. Body = the PURE HELPERS block plus:
   ```js
   const ctx = $('Normalize & Validate Request').first().json;
   const a = $input.first().json;
   return [{ json: { ...a, time_context: resolveTimeContext({
     serverNowMs: Date.now(),
     clientTimeZone: ctx.client_time_zone,
     clientUtcOffsetMinutes: ctx.client_utc_offset_minutes,
     clientNowIso: ctx.client_now
   }) } }];
   ```
3. **Replace `Build Memory Context`** with the same block plus:
   ```js
   const a = $('Classify Intent (conversational vs research)').first().json;
   const sess = $('Issue Session').first().json;
   const norm = $('Normalize & Validate Request').first().json;
   const existing = sess.is_new_session ? null : $('Get Existing Session').first().json;
   const session = {
     session_token_hash: sess.is_new_session ? sess.session_token_hash : norm.existing_session_hash,
     tenant_id:  a.tenant_id,
     identity_id: a.identity_id,
     expires_at: sess.is_new_session ? sess.expires_at : (existing && existing.expires_at),
     revoked:    sess.is_new_session ? false : (existing && existing.revoked),
     revoked_at: sess.is_new_session ? null  : (existing && existing.revoked_at)
   };
   const conv = buildConversationContext({
     session, rows: $('Get Conversation Memory').all().map(i => i.json),
     tenantId: a.tenant_id, nowMs: Date.now()
   });
   return [{ json: { conv, system_message: buildSystemContextBlock({
     timeContext: a.time_context, conversation: conv }) } }];
   ```
4. **`Generate Conversational Reply`** — `systemMessage` becomes
   `={{ $('Build Memory Context').item.json.system_message }}`.
5. **`Get Conversation Memory`** — raise `limit` 8 → 32 rows, add an
   `identity_id` equality condition. The turn window is enforced in code.
6. **Wire `Build Research Result → Prepare Memory Rows`.** The single
   highest-value change for "¿qué estábamos haciendo?". Every node
   `Prepare Memory Rows` references is already upstream of the research branch,
   so it is pure wiring.
7. **`Prepare Memory Rows`** — emit the role vocabulary and the research digest:
   user rows stay `role: 'user'`; a conversational reply stays `'assistant'`; a
   research reply becomes `role: 'assistant_research'` with
   `content: buildResearchMemoryDigest(resp, a.language)`; a Central reply becomes
   `role: 'assistant_central'`.
8. **Workflow settings** — set `timezone` explicitly so `$now` elsewhere in the
   workflow and this candidate agree.

**Not required:** any data-table schema change. The extended role vocabulary uses
the existing `role` string column, and pre-existing `user`/`assistant` rows keep
working unchanged.

**Explicitly out of scope:** any change to Central's contract, to the retention
sweep, to authentication, to permissions, or to tenant isolation.

---

## 9. Rollback plan

**Frontend.** The candidate is a separate file; production `index.html` is
byte-unchanged. Rollback = stop serving `memory-time-v1.html`, or delete it.
Nothing to undo. Should the change ever be folded into `index.html`, the diff is
three added fields in one function plus one call site, and reverting that commit
restores the current payload exactly. Old and new payloads are both accepted by
the Gateway either way — the three fields are additive and optional, so a rolled
-back phone and an updated Gateway interoperate, and vice versa.

**Gateway.** n8n keeps workflow version history (this workflow's current
`versionId` is `cc08e356-ea76-4458-92fd-cba48e462d3f`). Before any change:
record the active version id; apply changes; if anything regresses, restore that
version. Rollback is one restore, and it is complete — nodes 1–8 are additive or
in-place edits, with no destructive step and no migration.

**Data.** Nothing to roll back. No schema change, no backfill, no delete. Rows
written with the new roles (`assistant_research`, `assistant_central`) stay
readable by the *old* `Build Memory Context`: it keeps any row with a truthy
`role` and labels everything that is not `'user'` as `Panchita`, so after a
rollback those rows simply render as ordinary assistant lines. Nothing breaks and
no row needs rewriting.

**Staged order, if approved.** Each step is independently revertable and each is
observable before the next:

1. Node 1 alone (pass-through fields). No behaviour change. Confirm the fields
   arrive.
2. Nodes 2 + 4 (time context into the prompt). Ask "¿qué día es hoy?" and check.
3. Nodes 3 + 5 (memory retrieval fixes). Ask "¿qué estábamos haciendo?".
4. Nodes 6 + 7 (research turns in memory). Do a search, then ask again.
5. Node 8 (workflow timezone).

**Kill switch.** Step 2 is the only step that can make Panchita *state* something
new about the world. If the time line is ever wrong, reverting node 4's
`systemMessage` expression alone — one field — returns her to the current
behaviour while leaving everything else in place.

---

## 10. Risks

1. **The n8n candidate was not built or executed.** See BLOCKED below. Everything
   is proven in Node, nothing in n8n.
2. **The revoked check in the candidate is defence in depth, not the primary
   gate.** Revocation is already enforced *upstream*: `Get Existing Session`
   filters `revoked = false`, so a logged-out token returns no row and
   `Decide Identity` refuses it as `no_session` before memory is ever reached.
   The candidate reads the sessions table's real columns (`revoked` boolean plus
   `revoked_at`, confirmed against `Record Session` and `Revoke Session Row`) and
   accepts a string `"true"` in case the data table hands the boolean back that
   way. If both layers were somehow bypassed the candidate still fails closed.
3. **`Intl` time-zone support in the n8n Code sandbox.** Node 18+ with full ICU
   has it. With small-ICU, named zones fail validation and every answer takes the
   declared-UTC path — wrong for Luis, but *declared* wrong rather than silently
   wrong. Verify on the instance before trusting non-UTC output.
4. **Recording research turns stores more of Luis's questions.** Same table, same
   session key, same logout purge, and now a stated retention horizon. That is
   the point of the fix and should be a conscious acceptance.
5. **Retrieved history reaches the model.** Fenced, de-privileged, sanitised,
   placed after the persona and clock, and containing only this owner's own words
   plus Gateway-generated digests. It is still text in a prompt.
6. **Memory rows outlive an expired session** until a sweep exists. They are
   unreachable through the read path, but stored. §3 is the design; the sweep is
   not built.
7. **Two sessions run in parallel.** Voice v2 is being fixed elsewhere and also
   edits `index.html`. The candidate page is a snapshot; whichever lands second
   must be rebased onto the other.
8. **The measured token figures are character-based bounds**, not tokenizer
   output. Treat ±15% as the honest error bar.
