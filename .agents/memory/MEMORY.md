# Memory Index

- [Verificación autenticada en dev](dev-auth-verification.md) — screenshots llegan sin sesión; usar la cuenta de prueba + flip de team_role en DB dev; restaurar rol y borrar semillas al final.

- [Startup data migrations](startup-data-migrations.md) — boot-time migrations run on every republish; only translate explicit legacy values, never reset to a default outside an allowlist.

- [Cotizaciones PDF pipeline](cotizaciones-pdf-pipeline.md) — LLM outputs JSON only, server does all money math; Puppeteer typing quirks; limiter-coverage test is an invariant that must be updated with app.ts.
- [Frescura docs de contrato](contratos-docs-freshness.md) — huella solo si el PDF llegó a Drive y salió del MISMO doc; fallo parcial borra la huella dependiente; lib duplicada con test byte-idéntico.
- [DB migrations workflow](db-migrations-workflow.md) — drizzle push hangs; apply DDL via SQL + numbered drizzle file; Publish auto-diffs dev→prod schema; agent prod SQL is read-only.
- [Team attendance design](team-attendance-design.md) — team-wide self-service APIs must avoid the area-gated /hub prefix; Santiago-TZ day bucketing, Monday weeks, 16h open-session cap.
- [Activity log design](activity-log-design.md) — all bitácora writes go through recordActivity + money-sanitized labels; team feed visibility mirrors jornada oversight roles.
- [Handoffs & playbooks](handoffs-playbooks.md) — claim-then-release en handoff_log; append jsonb atómico; fallos de IA se tragan DENTRO del claim (fallback), dinero se limpia en la frontera del insert.
- [Monorepo lib builds](monorepo-lib-builds.md) — after task merges, run pnpm install + tsc -b on lib/* before assuming merged code is broken; custom user names must never be overwritten by Google profile on login.
- [Render de portadas](cover-rendering.md) — librsvg pierde espacios en bordes de tspan (unir con &#160;); fuentes nix invisibles para fontconfig → empaquetar TTFs + FONTCONFIG_FILE al boot.
- [Dirección de arte portadas](cover-art-direction.md) — familia "estudio spotlight" en vertical 9:16 y miniaturas YouTube 16:9 (persona real fotorrealista o Webi); utilería física, jamás stickers.
- [Prod build skew](prod-build-skew.md) — el usuario prueba solo en la app publicada; ante "permiso denegado" en prod, sospechar primero build viejo: publicar suele ser el fix.
- [Gates de /hub: área vs rol](hub-area-gates.md) — el gate por área corre antes que los routers montados; abrir por rol exige eximir el path en hub-gate.ts; los tests de router no ven ese middleware.
- [Edición de imágenes (ajustes)](image-edit-adjustments.md) — gpt-image-1 edit reencuadra si el aspecto ≠ lienzo: letterbox negro determinista + recorte; sharp: un solo resize por pipeline.
- [Modelo de imágenes (portadas)](image-model-choice.md) — gpt-image-1 se queda: gpt-image-2 rechaza input_fidelity y pierde la identidad en fotos de persona; A/B vía AI_IMAGE_MODEL.
- [Facebook: token de página](facebook-page-token.md) — el #200 de Meta al publicar suele ser token de usuario de sistema en vez del de página; derivarlo con /{page-id}?fields=access_token.
- [Plantillas y tipografía de portadas v2](cover-templates-typography.md) — layout por métricas calibradas (no ratios), efectos como capas de text sin tspans, plantillas rotativas por formato, multi-foto al edit para fidelidad de rostro.
- [Concurrencia del tablero Hub](hub-board-concurrency.md) — el blob se guarda condicionado a la versión leída (la fusión no cubre escrituras cruzadas); fichas no controladas pisan cambios del servidor: cerrarlas tras transiciones firmes.
- [Resend vía conector](resend-correo.md) — llave solo-envío (401 en /domains); sin dominio verificado solo entrega al dueño de la cuenta; RESEND_FROM define el remitente; el correo jamás decide la suerte del flujo.
- [Cobros y pagos](cobros-pagos.md) — ledger en tabla real (no en el blob); estadoPago siempre calculado; auto-marca "pagado" one-way con re-chequeo fresco (fechaPago = último abono, de ahí salen comisiones); anti doble-clic server-side.
- [Sprint semanal y generación única](sprint-semanal-generacion.md) — cierre foto→arrastre idempotente sin tx; generar 1×/semana = LLM fuera + advisory xact lock + re-chequeo + pares en una sola tx.
- [Estados de publicación por red](redes-publish-status.md) — éxito = published O uploaded (YouTube/TikTok); filtrar solo por published esconde redes exitosas; e2e real en dev solo Facebook.
- [Tableros horizontales](tableros-horizontales.md) — reusar el módulo board-nav (chips/flechas/fades/snap); flechas por posición (no índice: clamp con overflow chico); snap off durante drag.
- [Kit visual del Hub](hub-kit-rediseno.md) — reusar hub-kit (.hk-*, importable fuera del Hub); tras rediseños "solo presentación": auditar drift funcional + selectores CSS borrados aún referenciados.
- [Puertos huérfanos](puertos-huerfanos.md) — si un workflow no abre su puerto: proceso viejo en loop de bind lo captura al liberarse; matar por PID (no solo el socket) y un restart con timeout amplio.
- [Ciclos de variables CSS](css-vars-ciclo.md) — jamás `--card: hsl(var(--card))` en un scope: ciclo → inválida → fondos transparentes; diagnosticar con getComputedStyle, no con capturas (el blur engaña).
- [Auditoría móvil del panel](movil-auditoria.md) — auditar SIEMPRE en español (ES desborda donde EN pasa); sonda scrollW/offenders por ruta; fixed bottom-* libra la tab bar con calc(4.75rem+safe-area)+lg:; 1 tester a la vez.
