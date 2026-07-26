---
name: Startup data migrations
description: Rules for the api-server runDataMigrations block that runs on every boot
---

Startup data migrations run on EVERY server boot, including every republish. They must be idempotent and only translate known legacy values — never "reset to a safe default" anything outside an allowlist.

**Why:** an old block reset users.team_role to 'ceo' for any value not in a stale 4-value list, silently wiping roles assigned in Ajustes on every republish. Users experienced it as "roles se reinician al republicar".

**How to apply:** when adding roles/areas or any enum-like column, check the runDataMigrations block in the api-server entrypoint; mappings there must mirror LEGACY_ALIASES in the roles lib and use an explicit WHERE IN of legacy values only.
