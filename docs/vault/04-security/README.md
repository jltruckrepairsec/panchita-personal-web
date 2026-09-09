# 04 — Security

| Page | Status |
| --- | --- |
| [Guardian](guardian.md) | Stub |
| [Authentication](authentication.md) | Sourced — client side fully documented |
| [Permissions](permissions.md) | Stub |
| [Audit](audit.md) | Stub |
| [Incident History](incident-history.md) | Sourced — one incident, fully reconstructed |

## Posture in one paragraph

The browser is treated as untrusted and holds as little as possible: no full
phone number, no password beyond one request, no persisted session. Everything
that matters is decided server-side, and the client's job is to fail safe when
the server says no. Where the client does enforce something — the self-echo
gate — it enforces it on lifecycle rather than on content, because a content
check can always be walked through.

What is missing is everything above the single-owner case: there is no
permissions model, no audit trail, and no definition of Guardian. Two modules
in section 03 (Financial, Recruiter) should not be built until that changes.
