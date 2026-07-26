---
name: Handoffs & playbooks design
description: Durable rules for automatic cross-area handoffs and playbook task templates.
---

# Handoffs & playbooks — durable rules

- Idempotency: claim a unique (kind, entity) row before side effects, and **release the claim on mid-run failure** so a later stage bounce retries. Claim-first without release permanently drops handoffs on transient errors.
  **Why:** architect review found claim-first alone is a silent data-loss path.
  **How to apply:** any new automatic trigger keyed to a state transition must use this claim/release pattern.
- Background jobs must never read-modify-write the shared hub board blob — append entities atomically in SQL so concurrent client PATCHes can't wipe them.
- Approving a video may only *suggest* a publish date (fill empty scheduledAt); publishing itself stays a human decision.
- Any endpoint that creates tasks needs the task-write gate (dirección), even if it lives under an area users can read — area access ≠ write access (RRHH reads /hub but must not create tasks).
- Santiago-local scheduled times need zone-aware fixed-point math; naive offset math breaks on Chilean DST boundaries.
