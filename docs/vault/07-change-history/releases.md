# Releases

> **Status:** sourced — complete history of this repository.
> **Lifecycle:** HISTORICAL RECORD
> **Basis:** `origin/main` @ `149d94e`
> **Last reviewed:** 2026-09-10

`main` is served by GitHub Pages. A commit on `main` is a release; a commit on a
branch is not.

## `main` — 7 commits, head `149d94e`

| Commit | Date | Change | Ships |
| --- | --- | --- | --- |
| `e1e01aa` | 2026-09-08 | Initial upload | `index.html` |
| `0cdb270` | 2026-09-09 | Stabilize Panchita Personal voice turn (push-to-talk) | `index.html` |
| `b01eb18` | 2026-09-09 | Raise voice turn silence threshold to 3500ms | `index.html` |
| `070bda9` | 2026-09-09 | Add isolated Voice v2 test page (production interface unchanged) | `voice-v2.html`, `tests/` |
| `acfd1ec` | 2026-09-09 | Voice v2: coalesce Android cumulative finals into one turn | `voice-v2.html`, `tests/` |
| `ed568e6` | 2026-09-09 | Voice v2: contain the Android loudspeaker self-echo loop | `voice-v2.html`, `tests/` |
| `149d94e` | 2026-09-09 | Voice v2: real turn-taking, and mute as a user decision only | `voice-v2.html`, `tests/` |

**Two artefacts ship from `main`, with different lifecycles.**

`b01eb18` is still the current production `index.html`: it is byte-identical at
`149d94e`, so no Voice v2 commit has ever altered production. That guarantee has
held across all four Voice v2 releases.

`voice-v2.html` has been on `main` since `070bda9` and is therefore publicly
reachable. That is deliberate — it is how Luis loads it on a real Android phone
— but it is a DEPLOYED PROTOTYPE under active development, not the production
voice experience. **Reaching `main` is not the same as being released to
production here.**

### A correction to an earlier reading

An earlier revision of this page listed only the first three commits as `main`
and called the Voice v2 commits "unreleased on a branch". That was wrong: they
are on `main`. What remains true is that they did not change `index.html`.

### `0cdb270` — push-to-talk stabilised

Voice became one tap, one turn, with a turn ending on the first of four
triggers: a final result, silence endpointing, a max-duration failsafe, or
`onend` (`index.html:628`). The failsafe matters — without it a recogniser that
never fires a final leaves the UI waiting forever.

### `b01eb18` — silence threshold to 3500 ms

The end-of-turn silence window was raised. A shorter window cuts people off
mid-thought; this is the same problem [ADR-005](architecture-decisions.md#adr-005--end-of-turn-belongs-to-the-recogniser-not-to-a-timer) later addressed properly by
deleting the timer entirely and deferring to the endpointer.

Read in sequence, `b01eb18` is the last attempt to solve end-of-turn with a
stopwatch, and `acfd1ec` is the decision to stop trying.

## The Voice v2 releases

All four are on `main`. See
[02 · Voice v2](../02-development/voice-v2.md) for their current, unsettled
state.

### `070bda9` — the isolated page

Continuous recognition, mute and end controls, dedupe and echo guard. The commit
message carries the guarantee — "production interface unchanged" — which is
[ADR-004](architecture-decisions.md#adr-004--risky-work-ships-as-a-separate-page-on-a-branch) stated as a release note.

### `acfd1ec` — cumulative finals coalesced

Fixed one sentence producing four Gateway requests. Verified against the pre-fix
page: 15 gate tests fail there, including `expected 1 submission, got 4`.

### `ed568e6` — self-echo contained

Fixed the loudspeaker feedback loop. Verified against the pre-fix page:
`fragment "Claro" reached Gateway`, `self-echo flooded Gateway with 5 extra
turns`. Full account: [INC-001](../04-security/incident-history.md).

### `149d94e` — turn taking, and mute as a user decision

+491 lines in `voice-v2.html` and a new `voice-v2-turn-taking.test.js`.
**Not finished.** Two hardware failures remain open against it, and no
architecture decision has been recorded for its design. This vault does not
document that design — see
[02 · Voice v2 · Current state](../02-development/voice-v2.md#current-state--active-development-do-not-treat-as-settled).

## Next release

There is no pending release of `index.html`. The open work is on the deployed
prototype, and it is blocked on the two unresolved hardware failures in
[06 · Physical Tests](../06-testing/physical-tests.md).

## Convention worth keeping

Each of the Voice v2 commits names the failure it fixes and, in the tests,
records what that failure looked like before the fix. That makes the history
readable a year later without archaeology, and it is the reason this page could
be written at all.
