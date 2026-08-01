---
name: Cotizaciones PDF pipeline
description: Non-obvious constraints of the server-side cotizaciones PDF generator (LLM JSON-only, Puppeteer, limiter invariant test)
---

# Cotizaciones PDF pipeline — durable constraints

- **LLM never does math.** The spec (attached_assets/Pasted-Necesito-...1784831927472.txt) is authoritative: gpt-4.1 outputs content JSON only; all money math (IVA 19%, split pagos, CLP formatting) lives in `finance.ts` on the server. Pending prices are encoded as `neto: -1`, which intentionally makes render/PDF throw until the user fills them in via the editable JSON.
  **Why:** LLM arithmetic is unreliable; the design guarantees totals always match server rules.
  **How to apply:** never move price math into prompts or the frontend; frontend only mirrors server rounding (per-module `round(neto*0.19)`, project total `sumNetos + round(sumNetos*0.19)`).

- **Puppeteer typing quirk in this repo:** api-server tsconfig has no DOM lib, so `page.evaluate(() => document...)` fails typecheck. Use string form `page.evaluate("document.fonts.ready")` and `waitUntil: "load"` (the installed puppeteer-core types don't accept `networkidle0`).

- **Limiter coverage is an invariant test:** `routes/limiter-coverage.test.ts` parses the literal regexes in `app.ts`. Adding any expensive endpoint (AI / publish / upload / Puppeteer) requires updating BOTH the `app.ts` regex and the MUST_* list in that test, or the suite fails by design.

- **Wizard preview freshness:** editing the cotización JSON clears `cotHtml` so the PDF button stays disabled until `/preview` succeeds — this prevents PDF/preview divergence. Keep that behavior if reworking the wizard.

- **Request fields the LLM must respect are enforced in the retry loop, not just prompted.** `validarPreciosEntregados` checks exact netos, mensualidad AND esquema-de-pago percentages against the request; mismatches trigger a business-error retry (budget shared with schema errors, 3 LLM calls max).
  **Why:** prompt-only compliance drifts; the loop guarantees the user's numbers.
  **How to apply:** when adding a new "entregado" field, add its check to `validarPreciosEntregados` — and note that test fixtures mocking the LLM must return values matching the requested field or the route 502s after retries.

- **Footer huérfano en plantillas HTML→PDF:** envolver en `.no-break` SOLO bloques chicos y firmes (firmas + footer del doc cliente). Jamás envolver "última sección + pie" completos: si la sección crece, salta entera y deja páginas a medias. Para el pie del doc técnico basta `break-inside: avoid + break-before: avoid` en el propio pie.

- **Paginación Chromium print (aprendido con el doc técnico "bugeado"):** nada de `break-inside: avoid` a nivel de sección o tarjeta grande — el bloque salta entero y deja media página vacía. Receta: (1) título de sección en wrapper con `break-inside: avoid + break-after: avoid` (nunca huérfano, degrada con gracia); (2) indivisibles solo las unidades chicas (li, hitos, chips); (3) tarjetas grandes fragmentables con `box-decoration-break: clone` (+ prefijo -webkit-) para que cada fragmento cierre borde y fondo.
  **Why:** con secciones-bloque, cualquier contenido futuro más largo reproduce el bug de páginas a medias; con unidades chicas el flujo llena páginas sea cual sea el tamaño.

- **Fondo oscuro vs margen de @page:** Chromium NUNCA pinta fondos dentro del margen de `@page` (full-bleed imposible); el fondo del body termina exacto en el borde del margen. Sin `padding` lateral en el body, los glifos redondos (C, Ó, 0) al inicio de línea tocan la frontera blanco/oscuro y se ven "cortados". Receta: `body { padding: 0 10pt }`.
  **How to apply:** cualquier plantilla PDF oscura nueva necesita ese aire lateral; diagnosticar midiendo x0 de texto vs x0 del rect de fondo (PyMuPDF), no a ojo con crops.

- **Price estimation mode:** when no prices are given, the prompt's GUÍA DE PRECIOS makes the LLM estimate netos; a post-validation nudge retries on `neto: -1`, but the LAST attempt accepts -1 (pending, blocks preview) instead of failing the whole generation. Keep that asymmetry: hard-fail only on contradicting user-given numbers, soft-degrade on missing estimates.
