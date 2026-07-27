// Prompts y parseo del asistente de redacción del equipo.
//
// Separado de la ruta para poder probar la parte frágil —el parseo de lo que
// devuelve el modelo— sin levantar Express ni gastar llamadas.

/* ========================= Tipos de texto ================================ */

export const TIPOS_REDACCION = [
  "meta",
  "tarea",
  "ticket",
  "reporte",
  "evaluacion",
  "mensaje",
  "generico",
  "reparto",
] as const;
export type TipoRedaccion = (typeof TIPOS_REDACCION)[number];

export const TONOS = ["profesional", "cercano", "directo"] as const;
export type Tono = (typeof TONOS)[number];

/** Qué es un buen texto para cada apartado. */
const GUIA_POR_TIPO: Record<TipoRedaccion, string> = {
  meta: `Es una META de equipo. Debe ser verificable: qué se logra, para cuándo y cómo se sabe que se cumplió. Si el borrador trae un número, respétalo; si no trae ninguno y el objetivo lo admite, sugiere uno entre corchetes para que la persona lo confirme. Una sola frase de título y, si aporta, dos líneas de detalle.`,
  tarea: `Es una TAREA asignable. Empieza por un verbo en infinitivo, nombra el entregable concreto y deja claro cuándo está terminada. Nada de tareas que en realidad son proyectos: si el borrador abarca demasiado, dilo en una nota al final en vez de partirla por tu cuenta.`,
  ticket: `Es un TICKET de soporte o incidencia. Necesita: qué pasa, dónde pasa, qué se esperaba que pasara y desde cuándo. Si el borrador no dice alguna de esas cosas, deja el hueco marcado entre corchetes en vez de inventarlo.`,
  reporte: `Es un REPORTE interno. Ordena en: qué se hizo, qué resultó y qué sigue. Cifras concretas antes que adjetivos. Sin relleno de introducción ni de cierre.`,
  evaluacion: `Es una EVALUACIÓN de desempeño. Describe conductas observables, nunca rasgos de personalidad ("entrega tarde tres de cada cinco encargos", no "es desordenado"). Equilibra lo que va bien con lo que hay que corregir, y termina con una acción concreta.`,
  mensaje: `Es un MENSAJE para una persona o un cliente. Directo y cordial, sin fórmulas de correo antiguo ("por medio de la presente", "quedo atento a sus comentarios"). Que se entienda qué se pide y para cuándo.`,
  generico: `Es un texto interno del panel. Ordénalo y hazlo claro sin cambiar de registro.`,
  reparto: `Repartes un objetivo entre personas concretas.`,
};

const GUIA_TONO: Record<Tono, string> = {
  profesional: "Tono profesional y neutro, de trabajo. Ni acartonado ni informal.",
  cercano: "Tono cercano y humano, como quien le habla a un compañero. Sin perder claridad.",
  directo: "Tono directo y breve. Frases cortas, cero adorno.",
};

/** Reglas que no dependen del tipo: son las que evitan que suene a máquina. */
const REGLAS_COMUNES = `REGLAS INNEGOCIABLES:
- NO INVENTES el fondo. Trabajas con lo que la persona escribió: lo ordenas, lo concretas y lo dejas presentable. Si falta un dato imprescindible, déjalo marcado entre corchetes ([fecha], [responsable]) para que ella lo complete — nunca lo rellenes tú.
- Nada de relleno: sin introducciones ("En el marco de..."), sin cierres de cortesía, sin resumir al final lo que ya dijiste.
- Sin adjetivos de folleto: "increíble", "potente", "robusto", "de última generación", "sinergia", "proactivo".
- Sin emojis y sin MAYÚSCULAS sostenidas.
- Devuelve SOLO el texto final, sin comillas alrededor, sin encabezados tipo "Texto mejorado:" y sin explicar lo que hiciste.
- Si el borrador ya está bien escrito, devuélvelo casi igual. Cambiar por cambiar es peor que no tocar nada.`;

export interface OpcionesSystem {
  tipo: TipoRedaccion;
  tono: Tono;
  reglaIdioma: string;
}

export function construirSystemPrompt(opts: OpcionesSystem): string {
  const base = `Eres el asistente de redacción interno de WebMakerLatam, una agencia digital de LATAM. Ayudas al equipo a escribir bien lo que ya tienen en la cabeza.

${GUIA_POR_TIPO[opts.tipo]}

${GUIA_TONO[opts.tono]}

${REGLAS_COMUNES}

${opts.reglaIdioma}`;

  if (opts.tipo !== "reparto") return base;

  return `${base}

FORMATO DE SALIDA (obligatorio): devuelve SOLO un JSON, sin markdown ni explicaciones:
{
  "tareas": [
    { "persona": "nombre exacto de la lista", "titulo": "verbo en infinitivo + entregable", "detalle": "una o dos líneas: qué incluye y cuándo está lista" }
  ]
}

CÓMO REPARTIR:
- Cada tarea le toca a UNA persona de la lista, escrita con su nombre EXACTO.
- Reparte por lo que sabe hacer cada quien según su rol. Si el rol no da pistas, reparte por carga pareja.
- Ninguna tarea puede depender de otra que nadie hizo todavía: si hay orden, dilo en el detalle.
- No repartas por repartir: si el objetivo no da para todos, deja gente fuera.`;
}

export function construirUserPrompt(opts: {
  borrador: string;
  contexto?: string;
  ajuste?: string;
}): string {
  return [
    `LO QUE ESCRIBIÓ LA PERSONA:\n${opts.borrador}`,
    opts.contexto ? `\nCONTEXTO:\n${opts.contexto}` : "",
    opts.ajuste ? `\nAJUSTE PEDIDO (prioridad alta): ${opts.ajuste}` : "",
    `\nDevuelve solo el texto final.`,
  ].filter(Boolean).join("\n");
}

/* ==================== Parseo del reparto ================================= */

export interface TareaRepartida {
  persona: string;
  titulo: string;
  detalle: string;
}

/** Normaliza para comparar nombres sin depender de tildes ni mayúsculas. */
function clave(nombre: string): string {
  return nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Parsea el JSON del reparto de forma defensiva.
 *
 * Descarta las tareas asignadas a alguien que no está en el equipo: el modelo
 * a veces inventa un nombre o abrevia, y una tarea asignada a un fantasma no se
 * puede guardar. Los nombres se devuelven SIEMPRE con la grafía original de la
 * lista, no con la que haya escrito el modelo.
 */
export function parseReparto(raw: string, nombresValidos: string[]): TareaRepartida[] {
  const limpio = String(raw).trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let obj: unknown = null;
  try {
    obj = JSON.parse(limpio);
  } catch {
    const m = limpio.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const lista = (obj as { tareas?: unknown })?.tareas;
  if (!Array.isArray(lista)) return [];

  const porClave = new Map(nombresValidos.map((n) => [clave(n), n]));
  const out: TareaRepartida[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const persona = porClave.get(clave(String(r.persona ?? "")));
    const titulo = String(r.titulo ?? "").replace(/\s+/g, " ").trim();
    if (!persona || !titulo) continue;
    out.push({
      persona,
      titulo: titulo.slice(0, 200),
      detalle: String(r.detalle ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
    });
  }
  return out;
}
