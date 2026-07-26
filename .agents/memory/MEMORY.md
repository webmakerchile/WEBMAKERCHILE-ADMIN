# Memory Index

- [Startup data migrations](startup-data-migrations.md) — boot-time migrations run on every republish; only translate explicit legacy values, never reset to a default outside an allowlist.

- [Cotizaciones PDF pipeline](cotizaciones-pdf-pipeline.md) — LLM outputs JSON only, server does all money math; Puppeteer typing quirks; limiter-coverage test is an invariant that must be updated with app.ts.
- [DB migrations workflow](db-migrations-workflow.md) — drizzle push hangs; apply DDL via SQL + numbered drizzle file; Publish auto-diffs dev→prod schema; agent prod SQL is read-only.
- [Team attendance design](team-attendance-design.md) — team-wide self-service APIs must avoid the area-gated /hub prefix; Santiago-TZ day bucketing, Monday weeks, 16h open-session cap.
- [Activity log design](activity-log-design.md) — all bitácora writes go through recordActivity + money-sanitized labels; team feed visibility mirrors jornada oversight roles.
- [Handoffs & playbooks](handoffs-playbooks.md) — claim-then-release idempotency in handoff_log; atomic jsonb append for board writes from background jobs; DST-safe Santiago scheduling.
- [Monorepo lib builds](monorepo-lib-builds.md) — after task merges, run pnpm install + tsc -b on lib/* before assuming merged code is broken; custom user names must never be overwritten by Google profile on login.
