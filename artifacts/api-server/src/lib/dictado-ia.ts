import OpenAI from "openai";
import { TICKET_AREAS, TICKET_AREA_LABELS } from "@workspace/roles";

/**
 * Convierte un dictado hablado en items estructurados.
 *
 * La persona habla corrido ("que desarrollo arregle el checkout para el viernes,
 * y que marketing prepare el post del lanzamiento, eso es urgente") y aca se
 * parte en varios items, cada uno con su destino, prioridad, encargado y fecha.
 * No se crea nada: quien llama decide.
 *
 * Todo campo que la IA no pueda deducir con confianza queda listado en `dudas`,
 * para que la vista previa lo marque y la persona lo corrija antes de crear.
 */

const MAX_ITEMS = 15;
const PRIORIDADES = ["crítica", "alta", "media", "baja"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

/** Persona del equipo a la que se puede encargar algo. */
export interface PersonaEquipo {
  id: number;
  nombre: string;
  rol?: string;
}

export interface ProyectoParaDictado {
  ref: string;
  nombre: string;
  cliente?: string;
}

interface Comun {
  title: string;
  priority: Prioridad;
  dueDate: string | null;
  /** Campos que la IA no pudo deducir con seguridad. */
  dudas: string[];
}

export interface TicketDictado extends Comun {
  description: string;
  area: string;
  assignedTo: number | null;
}

export interface TareaDictada extends Comun {
  notes: string;
  projectRef: string | null;
  assigneeId: number | null;
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
  const completion = await clienteIA().chat.completions.create({
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
  const v = texto(valor, 20).toLowerCase();
  return (PRIORIDADES as readonly string[]).includes(v) ? (v as Prioridad) : "media";
}

/** Solo aceptamos YYYY-MM-DD; cualquier otra cosa se descarta. */
function fecha(valor: unknown): string | null {
  const v = texto(valor, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return Number.isNaN(new Date(`${v}T00:00:00`).getTime()) ? null : v;
}

function listaDudas(valor: unknown, permitidos: readonly string[]): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map((x) => texto(x, 20)).filter((x) => permitidos.includes(x)))];
}

function listaDe(parsed: Record<string, unknown>, clave: string): Record<string, unknown>[] {
  const bruto = parsed[clave];
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .slice(0, MAX_ITEMS);
}

/** Resuelve el id de la persona a la que se le encarga algo. */
function persona(valor: unknown, equipo: readonly PersonaEquipo[]): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && equipo.some((p) => p.id === n) ? n : null;
}

function catalogoEquipo(equipo: readonly PersonaEquipo[]): string {
  if (equipo.length === 0) return "  (no hay equipo cargado: deja encargado en null)";
  return equipo
    .slice(0, 60)
    .map((p) => `  - ${p.id}: ${p.nombre}${p.rol ? ` (${p.rol})` : ""}`)
    .join("\n");
}

function reglasComunes(hoy: string): string {
  return [
    "- Un item por cada cosa distinta que se pida. Si se mencionan tres encargos, devolve tres items.",
    "- No inventes trabajo que no se dijo. Si el audio tiene una sola idea, devolve un solo item.",
    "- titulo: corto y accionable (max 90 caracteres), empieza con verbo.",
    "- Escribi en espanol de Chile, neutro y profesional. No copies muletillas del habla.",
    "- prioridad: 'critica' si se dijo que bloquea, que es urgente o que es para hoy;",
    "  'alta' si hay apuro o fecha cercana ('lo antes posible', 'esta semana');",
    "  'baja' si se dijo que puede esperar ('cuando puedas', 'sin apuro');",
    "  'media' si no se dijo nada del plazo.",
    `- fechaLimite: hoy es ${hoy}. Convertí a YYYY-MM-DD lo que se diga ("el viernes", "en dos semanas", "antes de fin de mes"). Si no se menciona ninguna fecha, null.`,
    "- encargado: SOLO el id numerico de la lista, cuando se nombre a la persona ('que lo tome Roberto', 'para Josue'). Si no se nombra a nadie, null.",
    "- dudas: lista con los nombres de los campos que NO pudiste deducir del audio y tuviste que suponer. Si algo se dijo explicitamente, NO lo pongas en dudas.",
  ].join("\n");
}

const CAMPOS_TICKET = ["area", "priority", "assignedTo", "dueDate"] as const;
const CAMPOS_TAREA = ["projectRef", "priority", "assigneeId", "dueDate"] as const;

/**
 * Dictado -> tickets, derivados al area que corresponda.
 *
 * Se ofrecen TODAS las areas, igual que el formulario manual: el rol de quien
 * dicta define su bandeja, no a quien le puede pedir algo.
 */
export async function extraerTickets(
  transcripcion: string,
  equipo: readonly PersonaEquipo[] = [],
  hoy: string = new Date().toISOString().slice(0, 10),
): Promise<TicketDictado[]> {
  const areas = TICKET_AREAS as readonly string[];
  const catalogo = areas
    .map((a) => `  - ${a}: ${TICKET_AREA_LABELS[a as keyof typeof TICKET_AREA_LABELS] ?? a}`)
    .join("\n");

  const parsed = await pedirJson(
    "Sos el asistente operativo de una agencia digital chilena. Convertis dictados de voz en tickets internos bien derivados. Responde SOLO con JSON valido.",
    `Transcripcion del audio:\n"""\n${transcripcion}\n"""\n\nDevolve este JSON exacto:\n{ "tickets": [ { "titulo": "...", "descripcion": "...", "area": "...", "prioridad": "crítica|alta|media|baja", "encargado": null, "fechaLimite": null, "dudas": [] } ] }\n\nAreas validas (usa exactamente la clave de la izquierda):\n${catalogo}\n\nEquipo (para "encargado", usa el id numerico):\n${catalogoEquipo(equipo)}\n\nReglas:\n${reglasComunes(hoy)}\n- descripcion: 1 a 3 frases con el detalle que se dijo. Si no se dijo mas, string vacio.\n- area: respeta el area si la persona la nombra ("que lo vea marketing", "esto es para ventas", "que lo tome RRHH"). Si no la nombra, deducila del contenido y agrega "area" a dudas.\n- Nombres de campo validos en dudas: ${CAMPOS_TICKET.join(", ")}.`,
  );

  return listaDe(parsed, "tickets")
    .map((t) => {
      const area = texto(t.area, 40).toLowerCase();
      const valida = areas.includes(area);
      const dudas = listaDudas(t.dudas, CAMPOS_TICKET);
      if (!valida && !dudas.includes("area")) dudas.push("area");
      return {
        title: texto(t.titulo, 90),
        description: texto(t.descripcion, 2000),
        area: valida ? area : String(areas[0]),
        priority: prioridad(t.prioridad),
        assignedTo: persona(t.encargado, equipo),
        dueDate: fecha(t.fechaLimite),
        dudas,
      };
    })
    .filter((t) => t.title.length > 0);
}

/** Dictado -> tareas del tablero Scrum. */
export async function extraerTareas(
  transcripcion: string,
  proyectos: readonly ProyectoParaDictado[],
  equipo: readonly PersonaEquipo[] = [],
  hoy: string = new Date().toISOString().slice(0, 10),
): Promise<TareaDictada[]> {
  const catalogo = proyectos.length
    ? proyectos
        .slice(0, 80)
        .map((p) => `  - ${p.ref}: ${p.nombre}${p.cliente ? ` (cliente: ${p.cliente})` : ""}`)
        .join("\n")
    : "  (no hay proyectos cargados: deja proyecto en null)";

  const parsed = await pedirJson(
    "Sos el asistente operativo de una agencia digital chilena. Convertis dictados de voz en tareas de un tablero Scrum. Responde SOLO con JSON valido.",
    `Transcripcion del audio:\n"""\n${transcripcion}\n"""\n\nDevolve este JSON exacto:\n{ "tareas": [ { "titulo": "...", "notas": "...", "prioridad": "crítica|alta|media|baja", "proyecto": null, "encargado": null, "fechaLimite": null, "dudas": [] } ] }\n\nProyectos disponibles (usa exactamente la clave de la izquierda):\n${catalogo}\n\nEquipo (para "encargado", usa el id numerico):\n${catalogoEquipo(equipo)}\n\nReglas:\n${reglasComunes(hoy)}\n- notas: el detalle que se dijo. Si no se dijo mas, string vacio.\n- proyecto: si se nombra al cliente o al proyecto ("para MyTurno", "lo de OFIX"), busca la clave que mejor calce. Si no se nombra ninguno, null y NO lo agregues a dudas.\n- Nombres de campo validos en dudas: ${CAMPOS_TAREA.join(", ")}.`,
  );

  const refs = new Set(proyectos.map((p) => p.ref));
  return listaDe(parsed, "tareas")
    .map((t) => {
      const ref = texto(t.proyecto, 120);
      return {
        title: texto(t.titulo, 90),
        notes: texto(t.notas, 2000),
        priority: prioridad(t.prioridad),
        projectRef: refs.has(ref) ? ref : null,
        assigneeId: persona(t.encargado, equipo),
        dueDate: fecha(t.fechaLimite),
        dudas: listaDudas(t.dudas, CAMPOS_TAREA),
      };
    })
    .filter((t) => t.title.length > 0);
}
