# Memory Index

- [Startup data migrations](startup-data-migrations.md) — boot-time migrations run on every republish; only translate explicit legacy values, never reset to a default outside an allowlist.

- [Cotizaciones PDF pipeline](cotizaciones-pdf-pipeline.md) — LLM outputs JSON only, server does all money math; Puppeteer typing quirks; limiter-coverage test is an invariant that must be updated with app.ts.
- [DB migrations workflow](db-migrations-workflow.md) — drizzle push hangs; apply DDL via SQL + numbered drizzle file; Publish auto-diffs dev→prod schema; agent prod SQL is read-only.
- [Team attendance design](team-attendance-design.md) — team-wide self-service APIs must avoid the area-gated /hub prefix; Santiago-TZ day bucketing, Monday weeks, 16h open-session cap.
- [Activity log design](activity-log-design.md) — all bitácora writes go through recordActivity + money-sanitized labels; team feed visibility mirrors jornada oversight roles.
- [Handoffs & playbooks](handoffs-playbooks.md) — claim-then-release idempotency in handoff_log; atomic jsonb append for board writes from background jobs; DST-safe Santiago scheduling.
- [Monorepo lib builds](monorepo-lib-builds.md) — after task merges, run pnpm install + tsc -b on lib/* before assuming merged code is broken; custom user names must never be overwritten by Google profile on login.
- [Render de portadas](cover-rendering.md) — librsvg pierde espacios en bordes de tspan (unir con &#160;); fuentes nix invisibles para fontconfig → empaquetar TTFs + FONTCONFIG_FILE al boot.
- [Dirección de arte portadas](cover-art-direction.md) — familia "estudio spotlight" en vertical 9:16 y miniaturas YouTube 16:9 (persona real fotorrealista o Webi); utilería física, jamás stickers.
- [Prod build skew](prod-build-skew.md) — el usuario prueba solo en la app publicada; ante "permiso denegado" en prod, sospechar primero build viejo: publicar suele ser el fix.
- [Gates de /hub: área vs rol](hub-area-gates.md) — el gate por área corre antes que los routers montados; abrir por rol exige eximir el path en hub-gate.ts; los tests de router no ven ese middleware.
- [Edición de imágenes (ajustes)](image-edit-adjustments.md) — gpt-image-1 edit reencuadra si el aspecto ≠ lienzo: letterbox negro determinista + recorte; sharp: un solo resize por pipeline.
- [Modelo de imágenes (portadas)](image-model-choice.md) — gpt-image-1 se queda: gpt-image-2 rechaza input_fidelity y pierde la identidad en fotos de persona; A/B vía AI_IMAGE_MODEL.
- [Facebook: token de página](facebook-page-token.md) — el #200 de Meta al publicar suele ser token de usuario de sistema en vez del de página; derivarlo con /{page-id}?fields=access_token.
- [Plantillas y tipografía de portadas v2](cover-templates-typography.md) — layout por métricas calibradas (no ratios), efectos como capas de text sin tspans, plantillas rotativas por formato, multi-foto al edit para fidelidad de rostro.
