# Truck Repair offline tests

Offline tests for the **Panchita Truck Repair** authorization and intent logic
that runs in n8n. Completely separate from the Voice V2 suite in `tests/` —
these import nothing from `voice-v2.html` or `index.html`, and Voice V2 imports
nothing from here.

## Run

```sh
node --test tests/truck-repair/*.test.js
```

No dependencies, no network, no credentials. The n8n instance is not contacted.

## What is here

| File | Purpose |
| --- | --- |
| `core-logic-snapshot.js` | The pure decision logic copied verbatim out of the deployed Core Pipeline node, plus the live registry rows as audited. |
| `authorization.test.js` | **Guard tests.** Invariants that must never break. |
| `known-defects.test.js` | **Characterisation tests.** They assert the current, *wrong* behaviour on purpose. |

## Read this before trusting a green run

`known-defects.test.js` passing means "still broken, exactly as documented" —
not "healthy". Each test names a defect ID from
`docs/truck-repair/GO-LIVE-READINESS.md` and states what the behaviour must
become. **When a defect is fixed, its test should fail.** That is the signal to
delete the characterisation test and write the real assertion in
`authorization.test.js`.

`authorization.test.js` is the opposite: those 11 tests must stay green.

## What these tests do NOT prove

They model Core's decision logic, not the running system. They cannot prove:

* that a real phone call reaches the bridge (no call ever has),
* that Google Sheets is reachable or that its data is correct,
* that a human actually receives an escalation,
* anything about GoHighLevel or ShopMonkey, neither of which is connected.

Per the v1.0 brief: **offline tests alone do not prove production readiness.**
The physical acceptance checklist in `docs/truck-repair/ACCEPTANCE-TESTS.md` is
what counts, and 0 of its 15 tests have been performed over a real call.

## Keeping the snapshot honest

`core-logic-snapshot.js` was captured on 2026-09-10 from workflow
`nMSfr0OE42rpPYgE`, node `Core Pipeline`, version
`699407ef-4a67-4ebe-9295-50d987fb1867`. A snapshot that has silently drifted
from the deployed node is worse than no snapshot, because it produces
confident green results about code that is no longer running. Re-capture it
whenever Core Pipeline changes, and re-check the registry rows in
`LIVE_REGISTRY` against data table `mTEaG68qHmalnOiE`.
