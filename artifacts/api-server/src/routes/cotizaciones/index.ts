import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { CotizacionSchema } from "./schema";
import { renderCotizacionHTML, logoDataUri } from "./template";
import { buscarChromium, SIN_CHROMIUM } from "./chromium";
import { htmlToPdf, SinChromiumError } from "./pdf";
import { generarContenidoCotizacion } from "./llm";
import { MMODA_EXAMPLE } from "./example-mmoda";

const router: IRouter = Router();

const GenerarBody = z.object({
  contexto_cliente: z.string().min(20, "Describe el contexto del cliente (mínimo 20 caracteres)"),
  modulos_sugeridos: z.string().optional(),
  /**
   * Un precio por módulo, en orden. `null` = "estímalo tú".
   *
   * Antes solo aceptaba números, así que el panel mandaba los precios unicamente
   * cuando TODOS los módulos tenían uno: quien sabía el precio de tres de
   * cuatro veía cómo la IA se inventaba también esos tres.
   */
  precios_netos: z.array(z.number().int().positive().nullable()).max(4).optional(),
  mensualidad_neto: z.number().int().positive().optional(),
  esquema_pago: z
    .array(z.object({ porcentaje: z.number().int().positive(), momento: z.string().min(3).max(25) }))
    .min(1)
    .max(3)
    .optional(),
});

/** Esquema de pago por defecto cuando el cliente no especifica uno. */
const ESQUEMA_PAGO_DEFAULT = [
  { porcentaje: 50, momento: "AL INICIAR" },
  { porcentaje: 50, momento: "CONTRA ENTREGA" },
];

/**
 * POST /cotizaciones/generar
 * Contexto libre del cliente → LLM (solo JSON) → validación Zod (+2 reintentos)
 * → devuelve el JSON de contenido + vista previa HTML.
 * Los montos los calcula SIEMPRE el servidor al renderizar.
 * Si no llega esquema_pago se usa 50% al iniciar / 50% contra entrega.
 */
router.post("/generar", async (req: Request, res: Response) => {
  const body = GenerarBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues.map((i) => i.message).join("; ") });
    return;
  }
  try {
    const input = {
      ...body.data,
      esquema_pago: body.data.esquema_pago ?? ESQUEMA_PAGO_DEFAULT,
    };
    const { data, intentos } = await generarContenidoCotizacion(input);
    let html: string | null = null;
    let htmlError: string | null = null;
    try {
      html = renderCotizacionHTML(data);
    } catch (e) {
      // Netos pendientes (-1): el JSON es editable, pero no hay preview ni PDF aún.
      htmlError = e instanceof Error ? e.message : "No se pudo renderizar la vista previa";
    }
    res.json({ cotizacion: data, intentos, html, htmlError });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error generando la cotización";
    res.status(502).json({ error: msg });
  }
});

/**
 * POST /cotizaciones/preview
 * JSON de contenido (posiblemente editado a mano) → vista previa HTML.
 */
router.post("/preview", (req: Request, res: Response) => {
  const parsed = CotizacionSchema.safeParse(req.body?.cotizacion);
  if (!parsed.success) {
    res.status(400).json({
      error: "El JSON de la cotización no es válido",
      detalles: parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`),
    });
    return;
  }
  try {
    res.json({ html: renderCotizacionHTML(parsed.data) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "No se pudo renderizar la cotización" });
  }
});

/**
 * POST /cotizaciones/pdf
 * JSON de contenido validado → plantilla fija → Puppeteer → PDF A4.
 */
router.post("/pdf", async (req: Request, res: Response) => {
  const parsed = CotizacionSchema.safeParse(req.body?.cotizacion);
  if (!parsed.success) {
    res.status(400).json({
      error: "El JSON de la cotización no es válido",
      detalles: parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`),
    });
    return;
  }
  try {
    const html = renderCotizacionHTML(parsed.data);
    const pdf = await htmlToPdf(html);
    const fname = `Cotizacion-${parsed.data.meta.empresa.replace(/[^\p{L}\p{N}]+/gu, "-")}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(pdf);
  } catch (e) {
    // 400 decía "la cotización está mal", y casi nunca era eso: faltaba el
    // navegador en el servidor. Con el mismo código para las dos causas, quien
    // lo leía se ponía a corregir una cotización que estaba perfecta.
    if (e instanceof SinChromiumError) {
      res.status(503).json({ error: e.message, code: e.code });
      return;
    }
    console.error("[cotizaciones/pdf]", e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "No se pudo generar el PDF",
      code: "pdf_fallo",
    });
  }
});

/**
 * GET /cotizaciones/diagnostico
 *
 * Dice si el servidor PUEDE generar PDFs, antes de intentarlo. "No genera los
 * contratos" tenía dos causas indistinguibles desde la pantalla —falta el
 * navegador, o falla la subida a Drive— y no había forma de saber cuál.
 */
router.get("/diagnostico", (_req: Request, res: Response) => {
  const chromium = buscarChromium();
  res.json({
    pdf: { listo: Boolean(chromium), ejecutable: chromium, mensaje: chromium ? null : SIN_CHROMIUM },
    logo: { encontrado: Boolean(logoDataUri()) },
  });
});

/**
 * GET /cotizaciones/ejemplo
 * Fixture M&M Moda (para probar la plantilla y como base editable).
 */
router.get("/ejemplo", (_req: Request, res: Response) => {
  res.json({ cotizacion: MMODA_EXAMPLE });
});

export default router;
