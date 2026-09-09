# Provider Costs

> **Status:** partial — what is free is known precisely; what is paid is
> entirely unknown.
> **Last reviewed:** 2026-09-09

## Free, and known to be free

| Provider | Used for | Cost |
| --- | --- | --- |
| GitHub Pages | Hosting `index.html` on `main` | Free |
| Web Speech `SpeechRecognition` | All speech-to-text | Free, on device |
| Web Speech `speechSynthesis` | All text-to-speech | Free, on device |

The entire voice path — production and Voice v2 — costs nothing per turn. No
audio is uploaded anywhere; recognised text travels as an ordinary Gateway
message. That is not incidental: it is the whole reason Voice v2 does so much
work locally.

Also free by consequence: the test suite. No dependencies, no install, no
network, so CI for it would cost nothing but runner minutes.

## Paid, and unknown

| Provider | Used for | Cost |
| --- | --- | --- |
| n8n Cloud | The Gateway | Unknown — plan and tier not recorded |
| LLM behind the Gateway | Every reply | Unknown — model and per-turn cost not recorded |
| Shopmonkey | Truck repair data | Unknown — existing business cost, presumably |
| Anything the modules call | Unknown | Unknown |

Every conversational turn incurs at least the n8n execution and one LLM call.
Nobody has written down what that pair costs, which is why
[Budgets](budgets.md) cannot be set.

## Deliberately unpriced

`PAID_REALTIME_ENABLED = false`. Realtime voice is a known paid alternative to
the free Web Speech path, and it has never been priced. That is the one number
that would settle whether the engineering invested in the free path was the
right trade — see
[02 · Voice v2](../02-development/voice-v2.md).

## Filling this in

The n8n plan and the LLM model are both one lookup each and would move this page
from mostly-unknown to mostly-known in an afternoon. Everything downstream —
budgets, alerts, the free-versus-paid voice question — is blocked on that
afternoon.
