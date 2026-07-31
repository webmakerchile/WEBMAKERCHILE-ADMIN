/**
 * Plan semanal de contenido con IA: tareas de redes ↔ edición, SIEMPRE en par.
 *
 * La regla de negocio que este módulo hace cumplir: el contenido orgánico
 * involucra a dos personas — quien maneja las redes (graba, escribe el copy,
 * publica) y quien edita el material. Por eso el modelo no devuelve tareas
 * sueltas: devuelve ITEMS, y cada item trae las dos caras. La ruta inserta
 * ambas tareas y las enlaza (pairedTaskId); aquí solo se arma el prompt, se
 * llama al modelo y se valida/sanitiza.
 *
 * Mismas reglas de oro que los requerimientos de arranque: JSON puro, todo
 * texto pasa por el filtro de montos, y ante cualquier problema → throw.
 * Un plan vacío que parece éxito es peor que un error.
 */
import OpenAI from "openai";
import { z } from "zod";
import { VALID_PRIORITIES, type HubPriority } from "@workspace/db/schema";
import { stripAllMoneyFromText } from "./contract-view";

export interface CaraContenido {
  titulo: string;
  descripcion: string;
  checklist: string[];
}

export interface PlanContenidoItem {
  tema: string;
  prioridad: HubPriority;
  /** Día sugerido de publicación (YYYY-MM-DD) o null si el modelo no lo dio. */
  dia: string | null;
  redes: CaraContenido;
  edicion: CaraContenido;
}

const MAX_ITEMS = 7; // una semana de contenido, no un backlog infinito
const MAX_CHECKLIST = 6;

function limpiarMontos(v: unknown): string {
  return stripAllMoneyFromText(String(v ?? ""));
}

const caraSchema = z.object({
  titulo: z.coerce.string().default(""),
  descripcion: z.coerce.string().default(""),
  checklist: z.array(z.coerce.string()).default([]),
});

const respuestaSchema = z.object({
  items: z.array(z.object({
    tema: z.coerce.string().default(""),
    prioridad: z.coerce.string().default("media"),
    dia: z.coerce.string().default(""),
    redes: caraSchema.default({ titulo: "", descripcion: "", checklist: [] }),
    edicion: caraSchema.default({ titulo: "", descripcion: "", checklist: [] }),
  })).default([]),
});

/**
 * JSON del modelo → plan limpio. Pura a propósito: es lo testeable.
 * Un item solo sobrevive si AMBAS caras tienen título — un par cojo no sirve,
 * la regla es que redes y edición van juntas o no van.
 */
export function parsearPlanContenido(parsedJson: unknown): PlanContenidoItem[] {
  const parsed = respuestaSchema.safeParse(parsedJson);
  if (!parsed.success) return [];
  const limpiar = (v: string, max: number) => limpiarMontos(v).trim().slice(0, max);
  const cara = (c: z.infer<typeof caraSchema>): CaraContenido => ({
    titulo: limpiar(c.titulo, 200),
    descripcion: limpiar(c.descripcion, 2000),
    checklist: c.checklist.map((x) => limpiar(x, 200)).filter(Boolean).slice(0, MAX_CHECKLIST),
  });

  const out: PlanContenidoItem[] = [];
  for (const it of parsed.data.items) {
    const redes = cara(it.redes);
    const edicion = cara(it.edicion);
    if (!redes.titulo || !edicion.titulo) continue;
    out.push({
      tema: limpiar(it.tema, 200) || redes.titulo,
      prioridad: (VALID_PRIORITIES as readonly string[]).includes(it.prioridad)
        ? (it.prioridad as HubPriority)
        : "media",
      dia: /^\d{4}-\d{2}-\d{2}$/.test(it.dia.trim()) ? it.dia.trim() : null,
      redes,
      edicion,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export interface VideoSemana {
  title: string;
  scheduledAt: Date | null;
  workflowStatus: string;
}

/** Lo que ve el modelo: la semana, los videos en juego y lo que ya existe. */
export function armarContextoContenido(input: {
  semana: string;
  videos: VideoSemana[];
  existentes: string[];
}): string {
  const lineas = input.videos.map((v) => {
    const fecha = v.scheduledAt ? v.scheduledAt.toISOString().slice(0, 10) : "sin fecha";
    return `· ${limpiarMontos(v.title)} (estado: ${v.workflowStatus}, ${fecha})`;
  });
  return [
    `Semana: ${input.semana}`,
    lineas.length
      ? `Videos ya planificados o en preparación esta semana:\n${lineas.join("\n")}`
      : "No hay videos planificados esta semana todavía.",
    input.existentes.length
      ? `Tareas de contenido que YA existen esta semana (no las repitas):\n${input.existentes
          .map((t) => `· ${limpiarMontos(t)}`)
          .join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");
}

/**
 * Llama al modelo y devuelve el plan listo para insertar en pares.
 * Lanza si no hay API key o si no salió ningún item usable.
 */
export async function generarPlanContenido(input: {
  semana: string;
  videos: VideoSemana[];
  existentes: string[];
  /** Sufijo de tono de marca (buildBrandToneSuffix); "" si no hay. */
  tono: string;
}): Promise<PlanContenidoItem[]> {
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
          "Eres el estratega de contenido de una agencia digital chilena (sitios web, e-commerce, software a medida, branding). Planificas el contenido orgánico de la semana para redes sociales (TikTok, Instagram, YouTube, LinkedIn). Cada pieza de contenido tiene DOS caras inseparables: la tarea de REDES (idea, guion, grabación, copy y publicación) y la tarea de EDICIÓN (montaje, subtítulos, portada, exportes por red). PROHIBIDO mencionar precios, montos o cualquier cifra de dinero. Responde SOLO con JSON válido." +
          (input.tono ? `\n${input.tono}` : ""),
      },
      {
        role: "user",
        content: `${armarContextoContenido(input)}

Genera el plan de contenido de la semana con este JSON exacto:
{
  "items": [
    {
      "tema": "…",
      "prioridad": "crítica|alta|media|baja",
      "dia": "YYYY-MM-DD",
      "redes": { "titulo": "…", "descripcion": "…", "checklist": ["paso", "…"] },
      "edicion": { "titulo": "…", "descripcion": "…", "checklist": ["paso", "…"] }
    }
  ]
}

Reglas:
- Entre 3 y ${MAX_ITEMS} items. Si hay videos planificados, apóyalos (guion, cortes, portada, copy); si faltan piezas para completar la semana, propone contenido nuevo alineado a la agencia.
- titulo: corto y accionable (máx 80 caracteres), empieza con verbo (Grabar, Escribir, Editar, Subtitular, Publicar…).
- descripcion: qué hay que hacer y con qué material; quien la lea debe poder empezar sin preguntar nada.
- checklist: 2 a ${MAX_CHECKLIST} pasos verificables por cara.
- dia: día sugerido de publicación dentro de la semana indicada.
- prioridad: "alta" para lo que sostiene el calendario de la semana; "crítica" solo si bloquea todo lo demás.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsedJson: unknown = {};
  try { parsedJson = JSON.parse(raw); } catch { /* parsear devuelve [] y abajo se lanza */ }

  const items = parsearPlanContenido(parsedJson);
  if (items.length === 0) throw new Error("el modelo no entregó items usables");
  return items;
}
