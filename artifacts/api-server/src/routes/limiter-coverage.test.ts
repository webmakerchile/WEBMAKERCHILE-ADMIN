import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const appSrc = readFileSync(resolve(__dirname, "../app.ts"), "utf8");

function extractRegexLine(prefix: string): RegExp {
  const m = appSrc.match(new RegExp(`app\\.use\\((\\/\\^[^,]+\\/)\\s*,\\s*${prefix}Limiter`));
  if (!m) throw new Error(`Could not locate ${prefix}Limiter regex in app.ts`);
  // Drop the surrounding /^...$/-style — `m[1]` is already a /regex/ literal
  // string, so eval-build it via Function to avoid `eval` lint warnings.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`return ${m[1]}`)();
}

const aiRegex = extractRegexLine("ai");
const publishRegex = extractRegexLine("publish");
const uploadRegex = extractRegexLine("upload");
const claveRegex = extractRegexLine("clave");

const MUST_AI = [
  "/api/library/templates/ai-fill",
  "/api/content/videos/123/generate-descriptions",
  "/api/content/videos/123/generate-cover",
  "/api/content/videos/bulk-generate-descriptions",
  "/api/content/hashtag-suggestions",
  "/api/analytics/insights",
  "/api/gemini/conversations/abc/messages",
  "/api/gemini/generate-image",
  "/api/gemini/generate-cover",
  "/api/gemini/generate-youtube-cover",
  "/api/gemini/adjust-cover",
  "/api/gemini/improve-adjust-instruction",
  "/api/gemini/improve-cover-idea",
  "/api/studio/ideas/generate",
  "/api/studio/ideas/77/generate-cover",
  "/api/community/sorprendeme",
  "/api/community/historias/generar",
  "/api/community/historias/detectar-formato",
  "/api/community/historias/reintentar",
  "/api/community/descripciones/generar",
  "/api/community/descripciones/calcular-slides",
  "/api/community/descripciones/reintentar-slide",
  "/api/community/descripciones/redactar-idea",
  "/api/community/redactar-idea",
  "/api/community/interactivo/generar",
  "/api/community/portada-reel/generar",
  "/api/hub/contracts/extract-pdf",
  "/api/hub/contracts/extract-from-meeting",
  "/api/hub/contracts/ai-chat",
  "/api/cotizaciones/generar",
];

const MUST_PUBLISH = [
  "/api/youtube/publish/1",
  "/api/youtube/upload/1",
  "/api/youtube/upload-from-drive/1",
  "/api/tiktok/publish/1",
  "/api/instagram/publish/1",
  "/api/linkedin/publish/1",
  "/api/x/publish/1",
  "/api/facebook/publish/1",
];

const MUST_UPLOAD = [
  "/api/studio/upload-chunk",
  "/api/studio/upload-video",
  "/api/studio/temp-preview",
  "/api/studio/finalize-upload",
  "/api/content/videos/import-csv",
  "/api/content/videos/123/upload-video",
  "/api/content/videos/123/link-drive-video",
  "/api/transcriber/transcribe",
  "/api/cotizaciones/pdf",
  "/api/hub/contracts/docs/pdf",
  "/api/hub/contracts/docs/regenerar",
];

/**
 * La ruta de aceptación de propuestas es la ÚNICA sin sesión que escribe en la
 * base de datos. Sin límite, cualquiera puede probar tokens al azar todo el
 * día contra un endpoint que da por aceptado un contrato.
 */
const firmaRegex = /^\/api\/firma\//;

const MUST_FIRMA = [
  "/api/firma/AbC-123_token",
  "/api/firma/AbC-123_token/aceptar",
];

describe("Rate-limit regex coverage in app.ts", () => {
  it.each(MUST_FIRMA)("firmaLimiter covers %s", (p) => {
    expect(firmaRegex.test(p)).toBe(true);
  });

  it("el límite de firma no se aplica al resto del panel", () => {
    expect(firmaRegex.test("/api/hub/contracts/1/firma")).toBe(false);
    expect(firmaRegex.test("/api/content/videos")).toBe(false);
  });

  it("claveLimiter cubre el segundo candado del CEO y nada más de auth", () => {
    expect(claveRegex.test("/api/auth/clave")).toBe(true);
    expect(claveRegex.test("/api/auth/me")).toBe(false);
    expect(claveRegex.test("/api/auth/logout")).toBe(false);
    expect(claveRegex.test("/api/auth/google/callback")).toBe(false);
  });

  it.each(MUST_AI)("aiLimiter covers %s", (p) => {
    expect(aiRegex.test(p)).toBe(true);
  });
  it.each(MUST_PUBLISH)("publishLimiter covers %s", (p) => {
    expect(publishRegex.test(p)).toBe(true);
  });
  it.each(MUST_UPLOAD)("uploadLimiter covers %s", (p) => {
    expect(uploadRegex.test(p)).toBe(true);
  });

  it("does not over-apply aiLimiter to GET-style listing routes", () => {
    expect(aiRegex.test("/api/content/videos")).toBe(false);
    expect(aiRegex.test("/api/auth/me")).toBe(false);
    expect(aiRegex.test("/api/community/historias")).toBe(false);
    expect(aiRegex.test("/api/community/descripciones")).toBe(false);
    expect(aiRegex.test("/api/hub")).toBe(false);
    // Los PDFs de contrato son Puppeteer (uploadLimiter), no IA.
    expect(aiRegex.test("/api/hub/contracts/docs/pdf")).toBe(false);
    expect(aiRegex.test("/api/hub/contracts/docs/regenerar")).toBe(false);
  });
});
