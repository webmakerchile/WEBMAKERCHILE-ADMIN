import OpenAI from "openai";
import { TICKET_AREAS, TICKET_AREA_LABELS } from "@workspace/roles";

/**
 * Convierte un dictado hablado en items estructurados.
 *
 * La persona habla corrido ("que desarrollo arregle el checkout, y que marketing
 * prepare el post del lanzamiento") y aca se parte en varios items, cada uno con
 * su area/proyecto y prioridad. No se crea nada: quien llama decide.
 */

const MAX_ITEMS = 15;
const PRIORIDADES = ["crítica", "alta", "media", "baja"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export interface TicketDictado {
  title: string;
  description: string;
  area: string;
  priority: Prioridad;
}

export interface TareaDictada {
  title: string;
  notes: string;
  priority: Prioridad;
  projectRef: string | null;
}

export class DictadoError extends Error {}

function clienteIA(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new DictadoError("Falta configurar OPENAI_API_KEY para el dictado.");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });
}

async function pedirJson(sistema: string, usuario: string): Promise<Record<string, unknown>> {
  const openai = clienteIA();
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: usuario },
    ],
  });
  const crudo = completion.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    throw new DictadoError("El modelo no devolvio un JSON valido.");
  }
}

function texto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function prioridad(valor: unknown): Prioridad {
  const v = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  return (PRIORIDADES as readonly string[]).includes(v) ? (v as Prioridad) : "media";
}

function listaDe(parsed: Record<string, unknown>, clave: string): Record<string, unknown>[] {
  const bruto = parsed[clave];
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .slice(0, MAX_ITEMS);
}

const REGLAS_COMUNES = [
  "- Un item por cada cosa distinta que se pida. Si la persona menciona tres encargos, devolve tres items.",
  "- No inventes trabajo que no se dijo. Si el audio solo tiene una idea, devolve un solo item.",
  "- titulo: corto y accionable (max 90 caracteres), empieza con verbo.",
  "- Escribi en espanol de Chile, neutro y profesional. No copies muletillas del habla.",
  "- prioridad: 'crítica' solo si se dijo que bloquea o es urgente; si no se dijo nada, 'media'.",
].join("\n");

/** Areas a las que este usuario puede derivar. */
export async function extraerTickets(
  transcripcion: string,
  areasPermitidas: readonly string[],
): Promise<TicketDictado[]> {
  const areas = areasPermitidas.length
    ? areasPermitidas
    : (TICKET_AREAS as readonly string[]);
  const catalogo = areas
    .map((a) => `  - ${a}: ${TICKET_AREA_LABELS[a as keyof typeof TICKET_AREA_LABELS] ?? a}`)
    .join("\n");

  const parsed = await pedirJson(
    "Sos el asistente operativo de una agencia digital chilena. Convertis dictados de voz en tickets internos bien derivados. Responde SOLO con JSON valido.",
    `Transcripcion del audio:\n"""\n${transcripcion}\n"""\n\nDevolve este JSON exacto:\n{ "tickets": [ { "titulo": "...", "descripcion": "...", "area": "...", "prioridad": "crítica|alta|media|baja" } ] }\n\nAreas validas (usa exactamente la clave de la izquierda):\n${catalogo}\n\nReglas:\n${REGLAS_COMUNES}\n- descripcion: 1 a 3 frases con el detalle que se dijo (que hay que hacer y para quien). Si no se dijo mas, deja el string vacio.\n- area: elegi la que corresponda por el contenido. Si la persona nombra el area ("que lo vea marketing"), respetala. Si no calza ninguna, usa la primera de la lista.`,
  );

  return listaDe(parsed, "tickets")
    .map((t) => {
      const area = texto(t.area, 40).toLowerCase();
      return {
        title: texto(t.titulo, 90),
        description: texto(t.descripcion, 2000),
        area: areas.includes(area) ? area : String(areas[0]),
        priority: prioridad(t.prioridad),
      };
    })
    .filter((t) => t.title.length > 0);
}

export interface ProyectoParaDictado {
  ref: string;
  nombre: string;
  cliente?: string;
}

export async function extraerTareas(
  transcripcion: string,
  proyectos: readonly ProyectoParaDictado[],
): Promise<TareaDictada[]> {
  const catalogo = proyectos.length
    ? proyectos
        .slice(0, 80)
        .map((p) => `  - ${p.ref}: ${p.nombre}${p.cliente ? ` (cliente: ${p.cliente})` : ""}`)
        .join("\n")
    : "  (no hay proyectos cargados: deja proyecto en null)";

  const parsed = await pedirJson(
    "Sos el asistente operativo de una agencia digital chilena. Convertis dictados de voz en tareas de un tablero Scrum. Responde SOLO con JSON valido.",
    `Transcripcion del audio:\n"""\n${transcripcion}\n"""\n\nDevolve este JSON exacto:\n{ "tareas": [ { "titulo": "...", "notas": "...", "prioridad": "crítica|alta|media|baja", "proyecto": "clave-del-proyecto-o-null" } ] }\n\nProyectos disponibles (usa exactamente la clave de la izquierda):\n${catalogo}\n\nReglas:\n${REGLAS_COMUNES}\n- notas: el detalle que se dijo. Si no se dijo mas, deja el string vacio.\n- proyecto: solo si el audio menciona al cliente o al proyecto. Si no queda claro, null.`,
  );

  const refsValidas = new Set(proyectos.map((p) => p.ref));
  return listaDe(parsed, "tareas")
    .map((t) => {
      const ref = texto(t.proyecto, 120);
      return {
        title: texto(t.titulo, 90),
        notes: texto(t.notas, 2000),
        priority: prioridad(t.prioridad),
        projectRef: refsValidas.has(ref) ? ref : null,
      };
    })
    .filter((t) => t.title.length > 0);
}
