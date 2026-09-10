# PHASE F — Human Escalation Matrix

**Current state: there is no escalation mechanism.** The bridge returns
`human_handoff: true` with a spoken sentence; no human is notified, no case is
recorded, and no context is packaged. Every row below is a specification.

Operational roles are referred to by role, not by name or number; the routing
table binding roles to real people belongs in the n8n registry, not in a
repository file.

| Trigger | Route to | Urgency | Must carry |
| --- | --- | --- | --- |
| LEVEL 1 — immediate danger | shop authority, live transfer | now, before any lookup | location, occupants safe, vehicle, symptoms |
| LEVEL 2 — stranded roadside | shop authority / dispatch | minutes | location, vehicle, symptoms, callback number |
| LEVEL 3 — movable failure | reception / follow-up | same day | vehicle, symptoms, customer, callback |
| Cannot identify caller | reception | same call | what was asked, what was tried |
| Multiple matching customers | reception | same call | the ambiguity, never the candidate list |
| Quote request, no authorized price | parts / shop authority | same day | vehicle, requested work, symptoms, urgency |
| Parts: new purchase or commitment | parts / procurement | same day | vendor, part, quantity, who asked |
| Complaint — safety / payment / repeat repair | owner | same day | facts as stated, severity, no liability language |
| Complaint — other | reception | 24h | facts, severity |
| Approval needed (any write) | owner | blocking | exact action, affected record, before/after |
| Data source unavailable | system owner | on failure | which source, error class, request id |
| Conflicting data across sources | system owner + reception | same day | both values, both sources |

## Handoff package

Every escalation must carry enough that the human does not restart the
conversation:

```json
{
  "case_ref":        "case-<id>",
  "conversation_ref":"<session_id>",
  "timestamp":       "<ISO-8601 UTC>",
  "customer":        "<identified customer, or 'UNIDENTIFIED'>",
  "vehicle":         "<truck/vehicle, or 'UNKNOWN'>",
  "reason":          "<why this reached a human>",
  "urgency":         "LEVEL 1|2|3|4 | routine",
  "verified":        ["facts Panchita confirmed from an authoritative source"],
  "not_verified":    ["what she could not confirm, and why"],
  "requested_action":"<what the caller actually wants>"
}
```

Deliberately excluded: full PII dumps, anything the caller did not supply, and
any field Panchita could not source. `not_verified` is the load-bearing field —
it is what stops a human from assuming Panchita already checked something.

## Two rules that must hold regardless of implementation

1. **Every supported flow needs a reachable human fallback.** A flow whose
   only failure mode is a spoken apology is not v1.0-complete.
2. **An escalation that is not recorded did not happen.** The case record must
   be written before, not after, the caller is told someone will follow up.
