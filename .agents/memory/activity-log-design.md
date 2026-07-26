---
name: Activity log design
description: Invariants of the cross-cutting activity_log / day-summary feature
---

# Activity log design

- **Rule:** Everything persisted to the activity log goes through `sanitizeLabel` (money stripped server-side) because the team feed is visible to roles that must never see amounts. Team-wide visibility mirrors jornada oversight (normalized role ceo/ventas/rrhh), and the router mounts OUTSIDE the /hub area gate so every approved user can see their own feed.
- **Why:** The hub board stores contracts with amounts in free-text titles; a raw label leak would bypass the server-side money censorship invariant.
- **How to apply:** New instrumentation must call `recordActivity` (fire-and-forget, never throws into the request) and never insert into activity_log directly. Day summaries are recomputed on every check-out with TOTAL day minutes (all closed sessions of the workDate), upserted on (user, date).
