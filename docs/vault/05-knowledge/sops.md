# SOPs

> **Status:** stub — no standard operating procedure is written down in this
> repository.
> **Last reviewed:** 2026-09-09

## The one procedure that is effectively documented

Running the voice tests, from `tests/README.md`:

```sh
node --test tests/*.test.js
```

No dependencies, no install step, no network. That is the whole procedure, and
it is short because the suite was built to have no setup.

## Procedures that are followed but not written

Each of these is observable in the repository's history and habits, and none of
them exists as a document. That makes them fragile — they survive only as long
as whoever holds them keeps holding them.

* **Shipping a risky change.** Build it as a separate page on a branch, keep
  production untouched, reproduce the failure in a test, fix, verify the test
  fails against the pre-fix page, then merge. This is the actual process behind
  `070bda9` → `acfd1ec` → `ed568e6` and it is the most valuable unwritten SOP
  here.
* **Verifying a bug fix.** Run the new test against the *old* code and confirm
  it fails. `tests/README.md` records the pre-fix numbers for exactly this
  reason — "15 of these fail, including `expected 1 submission, got 4`".
* **Hardware testing voice.** Done on Luis's Android phone; no protocol exists.
  See [06 · Physical Tests](../06-testing/physical-tests.md), which is the
  attempt at writing it.

## What else belongs here

Business procedures, which are entirely absent: shop intake and quoting,
Shopmonkey reporting cadence, wholesaling daily routine. Those live today inside
assistant skills outside this repository — see the note in
[03 — Modules](../03-modules/README.md) about why that is a pointer, not a
record.

## Why this page matters more than it looks

[03 · University](../03-modules/university.md) most plausibly teaches from
SOPs. If so, this page is that module's input, and its emptiness is why that
module has no shape yet.
