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

## Discord voice verification (July 2026)
- Verification = "connected to a VOICE channel of the team's guild", checked via bot-token REST only (`GET /guilds/{gid}/voice-states/{uid}`: 200+channel_id → in voice, 404 → not). No gateway, no presence intent.
**Why:** presence (online status) needs a persistent gateway connection + privileged intent; voice states are readable over plain REST with just "View Channels". Replit's Discord connector was evaluated and rejected (single-account OAuth proxy, no bot token) — the client owns a bot app instead.
- Pairing is admin-driven (panel user ↔ guild member dropdown), NOT per-member OAuth — the team is small and members shouldn't need to authorize anything.
- Verification NEVER blocks check-in; unverifiable (no token/guild/network) must degrade to null, and unlinked users keep the self-declared checkbox. Live "%" honesty comes from a 10-min sweep accumulating checks/hits per session (skips sessions past the 16h cap).
- Listing guild members requires the "Server Members Intent" toggle (403 → surface as reason "intent" so the UI can explain it).
- Auto check-in (July 2026): the sweep opens a jornada for linked+approved users seen in voice with no open session. Guards: never on `voiceStatus === null`, and a 30-min grace after the last checkout so a deliberate salida isn't overridden by lingering in voice. Auto-sessions are flagged (`auto_started`) for transparency; side effects (notification + channel report) only after a successful insert, and 23505 = lost race with a manual check-in (not an error). No auto check-out — voice drops are too noisy to end a session on.
- Gotcha: the Discord app's hex "Public Key" looks like a credential and users paste it as the bot token; a real bot token has 3 dot-separated segments. Detect (no dots / all-hex) and re-ask.
