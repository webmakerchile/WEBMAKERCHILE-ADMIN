---
name: Team attendance (jornada) design
description: Why attendance self-service lives at /api/jornada (not under /hub) and its date/session conventions
---

## Rule: team-wide self-service APIs must NOT live under /api/hub/*
The routes index applies `requireArea("ceo","ejecutivo","rrhh")` to the whole `/hub` prefix (regardless of mount order), so edicion/marketing users get 403 on anything under it.
**Why:** discovered while building the attendance module (July 2026) — check-in must work for ALL approved areas.
**How to apply:** mount team-wide routers at their own prefix (e.g. `/jornada`) before the /hub gate; gate supervision endpoints by role INSIDE the router (ceo/ejecutivo/rrhh/superadmin `canOversee`).

## Conventions chosen (be consistent)
- Day bucketing: America/Santiago via `toLocaleDateString("en-CA")` → YYYY-MM-DD text columns; a session belongs to its check-in date (overnight counts for the day it started).
- Weeks start Monday; date math at noon UTC to dodge DST.
- Open sessions capped at 16h (`MAX_SESSION_MIN`) so forgotten checkouts don't inflate hours; UI flags stale open sessions instead.
- DB: partial unique index (`user_id WHERE check_out IS NULL`) = at most one open session per user; insert races surface as 23505 → 409.

## Pre-existing asymmetry (intentional until told otherwise)
Mi Día's tasks API lives under the area-gated /hub prefix while the page itself is visible to all areas. This predates the attendance module — do not "fix" either side silently as part of unrelated work.

## Date param validation
Format regex alone is not enough for YYYY-MM-DD params: well-formed but impossible dates (month 13, Feb 30) survive the regex and make date math throw (500). Always roundtrip-validate (`new Date(s+"T12:00:00Z")` → back to string) before any date arithmetic.
