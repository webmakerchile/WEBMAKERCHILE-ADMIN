import { execFileSync } from "child_process";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Render HTML → PDF A4 con Puppeteer + Chromium del sistema (Nix).
 * Espera document.fonts.ready para que Oswald / IBM Plex estén cargadas.
 */

function chromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execFileSync("which", ["chromium"]).toString().trim();
  } catch {
    throw new Error(
      "No se encontró Chromium para generar el PDF. Instala chromium o define PUPPETEER_EXECUTABLE_PATH."
    );
  }
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b.connected) return b;
    } catch {
      /* relaunch below */
    }
  }
  browserPromise = puppeteer.launch({
    executablePath: chromiumPath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  });
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate("document.fonts.ready");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closePdfBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    if (b) await b.close().catch(() => {});
  }
}
