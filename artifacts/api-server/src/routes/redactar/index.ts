// Asistente de redacción del equipo.
//
// Un solo endpoint para TODO el panel: metas, tareas, tickets, reportes,
// evaluaciones y cualquier campo de texto interno. La alternativa —un prompt
// por página— garantiza que cada apartado escriba con una voz distinta y que
// arreglar algo obligue a tocar siete sitios.
//
// La premisa del pedido: la persona entiende la idea pero no sabe redactarla.
// Así que el asistente NUNCA inventa el fondo: reordena, concreta y da forma a
// lo que ya escribió. Si el borrador viene vacío, se rechaza en vez de
// inventar contenido que después alguien firmaría como suyo.

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { ai } from "@workspace/integrations-gemini-ai";
import { REGLA_ESPANOL_NEUTRO } from "../../lib/lenguaje-neutro";
import {
  TONOS,
  TIPOS_REDACCION,
  construirSystemPrompt,
  construirUserPrompt,
  parseReparto,
  type TipoRedaccion,
} from "../../lib/redactar";

const router: IRouter = Router();

const MODELO = "gpt-4.1";

async function pedirTexto(system: string, user: string, maxTokens: number): Promise<string> {
  const resp = await ai._openai.chat.completions.create({
    model: MODELO,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_completion_tokens: maxTokens,
  });
  return resp.choices[0]?.message?.content?.trim() ?? "";
}

const redactarSchema = z.object({
  tipo: z.enum(TIPOS_REDACCION as unknown as [TipoRedaccion, ...TipoRedaccion[]]),
  /** Lo que la persona escribió como pudo. Es el material de partida. */
  borrador: z.string().trim().min(1).max(4000),
  /** Contexto opcional: de qué proyecto/cliente/área se está hablando. */
  contexto: z.string().trim().max(2000).optional().default(""),
  tono: z.enum(TONOS).optional().default("profesional"),
  /** Instrucción extra sobre el resultado ("más corto", "menos formal"). */
  ajuste: z.string().trim().max(400).optional().default(""),
});

/** POST /redactar — mejora un texto que la persona ya empezó a escribir. */
router.post("/redactar", async (req: Request, res: Response) => {
  const parsed = redactarSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Escribe primero tu idea, aunque sea en borrador." });
    return;
  }
  try {
    const { tipo, borrador, contexto, tono, ajuste } = parsed.data;
    const texto = await pedirTexto(
      construirSystemPrompt({ tipo, tono, reglaIdioma: REGLA_ESPANOL_NEUTRO }),
      construirUserPrompt({ borrador, contexto, ajuste }),
      900,
    );
    if (!texto) {
      res.status(502).json({ error: "El asistente no devolvió texto. Inténtalo de nuevo." });
      return;
    }
    res.json({ texto });
  } catch (err) {
    console.error("[redactar POST]", err);
    res.status(500).json({ error: "No se pudo redactar. Inténtalo de nuevo." });
  }
});

const repartoSchema = z.object({
  /** Qué hay que lograr, contado como la persona pueda. */
  objetivo: z.string().trim().min(1).max(2000),
  contexto: z.string().trim().max(2000).optional().default(""),
  /** A quiénes repartir. El nombre es obligatorio; el rol ayuda mucho. */
  personas: z.array(z.object({
    nombre: z.string().trim().min(1).max(120),
    rol: z.string().trim().max(120).optional().default(""),
  })).min(1).max(20),
  /** Cuántas tareas por persona como máximo. */
  porPersona: z.number().int().min(1).max(5).optional().default(2),
});

/**
 * POST /redactar/reparto — convierte un objetivo en tareas concretas por persona.
 *
 * Este es el caso que se pidió explícitamente: quien lidera sabe qué hay que
 * lograr pero no cómo repartirlo. Describe el contexto con los nombres y el
 * asistente propone qué le toca a cada quien, ya redactado.
 */
router.post("/redactar/reparto", async (req: Request, res: Response) => {
  const parsed = repartoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Describe el objetivo y a quiénes se reparte." });
    return;
  }
  try {
    const { objetivo, contexto, personas, porPersona } = parsed.data;
    const crudo = await pedirTexto(
      construirSystemPrompt({ tipo: "reparto", tono: "profesional", reglaIdioma: REGLA_ESPANOL_NEUTRO }),
      [
        `OBJETIVO A LOGRAR: ${objetivo}`,
        contexto ? `CONTEXTO: ${contexto}` : "",
        `EQUIPO (reparte SOLO entre estas personas, por su nombre exacto):`,
        ...personas.map((p) => `  - ${p.nombre}${p.rol ? ` (${p.rol})` : ""}`),
        `Máximo ${porPersona} tarea${porPersona > 1 ? "s" : ""} por persona. No es obligatorio darle tareas a todos si el objetivo no lo justifica.`,
      ].filter(Boolean).join("\n"),
      1800,
    );
    const tareas = parseReparto(crudo, personas.map((p) => p.nombre));
    if (tareas.length === 0) {
      res.status(502).json({ error: "El asistente no pudo repartir el objetivo. Prueba dando más contexto." });
      return;
    }
    res.json({ tareas });
  } catch (err) {
    console.error("[redactar/reparto POST]", err);
    res.status(500).json({ error: "No se pudo repartir. Inténtalo de nuevo." });
  }
});

export default router;
