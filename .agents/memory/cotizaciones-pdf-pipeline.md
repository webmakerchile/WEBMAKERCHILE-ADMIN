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
