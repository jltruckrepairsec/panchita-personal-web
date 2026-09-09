# Releases

> **Status:** sourced — complete history of this repository.
> **Last reviewed:** 2026-09-09

`main` is served by GitHub Pages. A commit on `main` is a release; a commit on a
branch is not.

## `main`

| Commit | Date | Change |
| --- | --- | --- |
| `e1e01aa` | 2026-09-08 | Initial upload |
| `0cdb270` | 2026-09-09 | Stabilize Panchita Personal voice turn (push-to-talk) |
| `b01eb18` | 2026-09-09 | Raise voice turn silence threshold to 3500ms |

`b01eb18` is the current production `index.html`, and `voice-v2.html` names it
explicitly as the version it must not disturb.

### `0cdb270` — push-to-talk stabilised

Voice became one tap, one turn, with a turn ending on the first of four
triggers: a final result, silence endpointing, a max-duration failsafe, or
`onend` (`index.html:628`). The failsafe matters — without it a recogniser that
never fires a final leaves the UI waiting forever.

### `b01eb18` — silence threshold to 3500 ms

The end-of-turn silence window was raised. A shorter window cuts people off
mid-thought; this is the same problem ADR-005 later addressed properly by
deleting the timer entirely and deferring to the endpointer.

Read in sequence, `b01eb18` is the last attempt to solve end-of-turn with a
stopwatch, and `acfd1ec` is the decision to stop trying.

## Branch `claude/optimistic-edison-3zv7wq` — unreleased

| Commit | Date | Change |
| --- | --- | --- |
| `070bda9` | 2026-09-09 | Add isolated Voice v2 test page (production interface unchanged) |
| `acfd1ec` | 2026-09-09 | Voice v2: coalesce Android cumulative finals into one turn |
| `ed568e6` | 2026-09-09 | Voice v2: contain the Android loudspeaker self-echo loop |

Not served. See [02 · Voice v2](../02-development/voice-v2.md).

### `070bda9` — the isolated page

Continuous recognition, mute and end controls, dedupe and echo guard. The commit
message carries the guarantee — "production interface unchanged" — which is
ADR-004 stated as a release note.

### `acfd1ec` — cumulative finals coalesced

Fixed one sentence producing four Gateway requests. Verified against the pre-fix
page: 15 gate tests fail there, including `expected 1 submission, got 4`.

### `ed568e6` — self-echo contained

Fixed the loudspeaker feedback loop. Verified against the pre-fix page:
`fragment "Claro" reached Gateway`, `self-echo flooded Gateway with 5 extra
turns`. Full account: [INC-001](../04-security/incident-history.md).

## Next release

Voice v2 merging to `main`, blocked on hardware validation —
[06 · Physical Tests](../06-testing/physical-tests.md).

## Convention worth keeping

Each of the three branch commits names the failure it fixes and, in the tests,
records what that failure looked like before the fix. That makes the history
readable a year later without archaeology, and it is the reason this page could
be written at all.
