# Recruiter

> **Status:** stub — no source in this repository.
> **Last reviewed:** 2026-09-09

## What belongs here

Hiring, most plausibly for the shop — mechanics and office staff are the roles
the businesses in this vault would need.

* Roles hired for, and how often.
* Sourcing: where candidates come from today.
* What Panchita does — screen, schedule, draft postings, all three.
* Where candidate data lives, for how long, and who may see it.

## The constraint that has to come first

Candidate data is personal data about people who are not the owner. Everything
else in this vault concerns one person's own information; this module is the
first that does not. It should not be built before
[04 · Permissions](../04-security/permissions.md) and
[04 · Audit](../04-security/audit.md) are real, and before retention is
decided.

## Open questions

* Which business is hiring, and at what volume? Low volume may not justify a
  module at all.
* Does Panchita ever contact candidates directly?
* What is the retention period for an unsuccessful applicant's data?
