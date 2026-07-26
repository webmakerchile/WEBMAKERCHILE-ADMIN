# Memory Index

- [Cotizaciones PDF pipeline](cotizaciones-pdf-pipeline.md) — LLM outputs JSON only, server does all money math; Puppeteer typing quirks; limiter-coverage test is an invariant that must be updated with app.ts.
- [DB migrations workflow](db-migrations-workflow.md) — drizzle push hangs; apply DDL via SQL + numbered drizzle file; Publish auto-diffs dev→prod schema; agent prod SQL is read-only.
- [Team attendance design](team-attendance-design.md) — team-wide self-service APIs must avoid the area-gated /hub prefix; Santiago-TZ day bucketing, Monday weeks, 16h open-session cap.
- [Monorepo lib builds](monorepo-lib-builds.md) — after task merges, run pnpm install + tsc -b on lib/* before assuming merged code is broken; custom user names must never be overwritten by Google profile on login.
