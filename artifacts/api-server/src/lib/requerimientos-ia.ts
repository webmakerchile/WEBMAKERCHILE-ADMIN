/**
 * Requerimientos iniciales con IA: la extensión del Brief Técnico.
 *
 * Del mismo insumo que el brief (el documento de la cotización SIN precios,
 * más el brief si ya existe) salen tareas accionables para el tablero, con
 * checklist, prioridad y el tipo de trabajo — que es lo que decide a quién
 * se le asignan. Es deliberadamente el MISMO flujo y no uno paralelo: mismo
 * cliente, mismo modelo, misma regla de oro (ni un monto en el texto).
 *
 * Este módulo no decide cuándo correr ni qué hacer si falla: eso es del
 * handoff de venta cerrada. Aquí solo se arma el prompt, se llama al modelo
 * y se valida/sanitiza. Cualquier problema → throw, y el handoff cae al
 * arranque mecánico desde el brief. Por eso NADA de aquí puede dejar tareas
 * a medias: o devuelve la lista completa y limpia, o lanza.
 */
import OpenAI from "openai";
import { z } from "zod";
import { VALID_PRIORITIES, type HubPriority } from "@workspace/db/schema";
import { stripAllMoneyFromText } from "./contract-view";

/** Tipo de trabajo → a quién se asigna (ver `elegirAsignado` en handoffs). */
export const AREAS_TRABAJO = ["desarrollo", "marketing", "otro"] as const;
export type AreaTrabajo = (typeof AREAS_TRABAJO)[number];

export interface RequerimientoIA {
  titulo: string;
  descripcion: string;
  checklist: string[];
  prioridad: HubPriority;
  area: AreaTrabajo;
}

const MAX_TAREAS = 20;
const MAX_CHECKLIST = 8;

/** Alias local: TODO texto que entra o sale del modelo pasa por aquí. */
function limpiarMontos(v: unknown): string {
  return stripAllMoneyFromText(String(v ?? ""));
}

/** Lo que puede venir del modelo: todo coaccionado, nada confiable. */
const respuestaSchema = z.object({
  tareas: z.array(z.object({
    titulo: z.coerce.string().default(""),
    descripcion: z.coerce.string().default(""),
    checklist: z.array(z.coerce.string()).default([]),
    prioridad: z.coerce.string().default("media"),
    area: z.coerce.string().default("desarrollo"),
  })).default([]),
});

/**
 * JSON del modelo → lista limpia. Pura a propósito: es lo testeable.
 * Descarta tareas sin título, acota largos, normaliza prioridad y área a los
 * valores del sistema, y pasa TODO texto por el filtro de montos — el modelo
 * recibe el documento sin precios, pero si igual inventa una cifra, no viaja.
 */
export function parsearRequerimientos(parsedJson: unknown): RequerimientoIA[] {
  const parsed = respuestaSchema.safeParse(parsedJson);
  if (!parsed.success) return [];
  const limpiar = (v: string, max: number) => limpiarMontos(v).trim().slice(0, max);

  const out: RequerimientoIA[] = [];
  for (const t of parsed.data.tareas) {
    const titulo = limpiar(t.titulo, 200);
    if (!titulo) continue;
    out.push({
      titulo,
      descripcion: limpiar(t.descripcion, 2000),
      checklist: t.checklist.map((c) => limpiar(c, 200)).filter(Boolean).slice(0, MAX_CHECKLIST),
      prioridad: (VALID_PRIORITIES as readonly string[]).includes(t.prioridad)
        ? (t.prioridad as HubPriority)
        : "media",
      area: (AREAS_TRABAJO as readonly string[]).includes(t.area) ? (t.area as AreaTrabajo) : "desarrollo",
    });
    if (out.length >= MAX_TAREAS) break;
  }
  return out;
}

type ContratoParaIA = Record<string, unknown> & {
  title?: unknown; client?: unknown; notes?: unknown;
  doc?: { project?: unknown; client?: unknown; scope?: unknown; modules?: unknown } | null;
  brief?: Record<string, unknown> | null;
};

/**
 * El contrato → el texto que ve el modelo. Sin precios: de los módulos solo
 * viajan nombre y descripción, y los textos libres pasan por el filtro de
 * montos ANTES de salir (el brief ya viene limpio de fábrica, pero el doc y
 * las notas del contrato no).
 */
export function armarContexto(contract: ContratoParaIA): string {
  const doc = contract.doc && typeof contract.doc === "object" ? contract.doc : null;
  const limpiar = (v: unknown) => limpiarMontos(v).trim();

  const mods = Array.isArray(doc?.modules)
    ? (doc!.modules as Record<string, unknown>[])
        .filter((m) => String(m?.name ?? "").trim() !== "")
        .map((m) => ({ nombre: limpiar(m.name), descripcion: limpiar(m.desc) }))
    : [];

  const brief = contract.brief && typeof contract.brief === "object" ? contract.brief : null;

  return [
    `Servicio vendido: ${limpiar(doc?.project ?? contract.title)}`,
    `Cliente: ${limpiar(doc?.client ?? contract.client)}`,
    `Alcance acordado: ${limpiar(doc?.scope ?? contract.notes)}`,
    `Módulos contratados: ${JSON.stringify(mods)}`,
    brief ? `Brief técnico ya generado (úsalo como fuente principal): ${JSON.stringify(brief)}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Llama al modelo y devuelve los requerimientos listos para insertar.
 * Lanza si no hay API key o si el modelo no entregó ninguna tarea usable:
 * un vacío que parece éxito es peor que un error (misma lección del brief).
 */
export async function generarRequerimientos(contract: ContratoParaIA): Promise<RequerimientoIA[]> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres un líder técnico de una agencia digital chilena (sitios web, e-commerce, software a medida, branding y contenido). Conviertes lo vendido en requerimientos accionables para el equipo. PROHIBIDO mencionar precios, montos, presupuestos, formas de pago o cualquier cifra de dinero. Responde SOLO con JSON válido.",
      },
      {
        role: "user",
        content: `${armarContexto(contract)}

Genera los requerimientos iniciales del proyecto con este JSON exacto:
{
  "tareas": [
    { "titulo": "…", "descripcion": "…", "checklist": ["paso concreto", "…"], "prioridad": "crítica|alta|media|baja", "area": "desarrollo|marketing|otro" }
  ]
}

Reglas:
- Entre 5 y ${MAX_TAREAS} tareas que cubran TODO el alcance vendido; una por módulo o entregable grande.
- titulo: corto y accionable (máx 80 caracteres), empieza con verbo (Diseñar, Desarrollar, Configurar, Publicar…).
- descripcion: qué hay que construir y qué se necesita del cliente; quien la lea debe poder empezar sin preguntar nada.
- checklist: 2 a ${MAX_CHECKLIST} pasos verificables para dar la tarea por lista.
- prioridad: "crítica" solo si bloquea todo lo demás; "alta" para los entregables principales.
- area: "desarrollo" para construir/configurar/diseñar el producto; "marketing" SOLO para difusión, redes o campañas; "otro" para coordinación con el cliente.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsedJson: unknown = {};
  try { parsedJson = JSON.parse(raw); } catch { /* parsear devuelve [] y abajo se lanza */ }

  const reqs = parsearRequerimientos(parsedJson);
  if (reqs.length === 0) throw new Error("el modelo no entregó tareas usables");
  return reqs;
}
