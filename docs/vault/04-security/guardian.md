# Guardian

> **Status:** stub — nothing in this repository defines or references Guardian.
> **Last reviewed:** 2026-09-09

## What belongs here

The name sits at the head of the security section, which suggests something
that watches Panchita's behaviour and intervenes — as distinct from
[Authentication](authentication.md), which controls who gets in, and
[Permissions](permissions.md), which controls what they may do.

If that reading is right, Guardian would answer: what does Panchita refuse to
do, and what notices when she does something she should not?

Candidate scope, none confirmed:

* Actions requiring confirmation before execution — anything that moves money,
  contacts a third party, or writes to a system of record.
* Rate and anomaly limits on Panchita's own behaviour, server-side.
* Content boundaries: what she will not say or send on the owner's behalf.
* Kill switch.

## The argument for building it

[INC-001](incident-history.md) is the case study. A feedback loop drove
unbounded Gateway traffic and **nothing in the system noticed**. It was stopped
by a rate limiter that belongs to another component and was never designed as a
safety mechanism. A loop that stayed under that threshold would still be running.

The client-side turn breaker added in the fix (`TURN_BREAKER_MAX = 25` per
20 s) protects the client only. Anything that talks to the Gateway from
somewhere else has no such limit.

That is the concrete, already-realised need this page exists to meet.

## Open questions

* Is Guardian a component, or a policy set enforced inside the Gateway?
* Does it sit in front of Panchita's actions, or observe them and alert?
* Who does it alert, and how, given the owner's interface is a phone browser?
