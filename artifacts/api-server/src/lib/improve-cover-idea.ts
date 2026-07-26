// Redacción asistida de ideas de portada: el usuario cuenta su idea "a lo
// bruto" y la IA la convierte en un título de miniatura + un brief visual
// alineado con la dirección de arte "Estudio Spotlight" (utilería física real
// apoyada en el set — nunca stickers ni símbolos flotantes). Además propone el
// set completo: utilería, toque de estilo e iluminación del estudio (id
// validado contra el catálogo real).

export const IMPROVE_TITLE_MAX = 60;
export const IMPROVE_IDEA_MAX = 600;
export const IMPROVE_UTILERIA_MAX = 200;
export const IMPROVE_ESTILO_MAX = 120;

/** Resumen de una dirección de arte para ofrecérsela a la IA como opción. */
export interface DireccionResumen {
  id: string;
  nombre: string;
  descripcion: string;
}

export type FormatoPortada = "vertical" | "youtube";

export function buildImproveIdeaPrompt(
  title: string,
  ideaBruta: string,
  direcciones: DireccionResumen[],
  opts?: { formato?: FormatoPortada; conPersona?: boolean },
): string {
  const catalogoLuces = direcciones
    .map((d) => `  - "${d.id}": ${d.nombre} — ${d.descripcion}`)
    .join("\n");

  const esYoutube = opts?.formato === "youtube";
  const conPersona = esYoutube && Boolean(opts?.conPersona);

  const contexto = esYoutube
    ? `Un compañero escribió a lo bruto la idea para la MINIATURA HORIZONTAL (16:9) de un video de YOUTUBE. El estilo de marca es fijo: estudio fotográfico en penumbra con un foco de luz, el titular ocupa la franja izquierda, y el protagonista va grande al lado derecho: ${
        conPersona
          ? "una PERSONA REAL (la foto que él va a subir) con energía de youtuber — expresión exagerada, gesto expresivo"
          : "el zorro Webi de la marca"
      }. Con utilería física real apoyada en el set.`
    : `Un compañero escribió a lo bruto la idea para la PORTADA vertical de un video. El estilo de marca es fijo: estudio fotográfico en penumbra con un foco de luz y el zorro Webi como protagonista, con utilería física real apoyada en el set.`;

  const reglaIdea = esYoutube
    ? `- "idea": 2 a 3 frases en español natural que describan la miniatura horizontal: ${
        conPersona
          ? "la EXPRESIÓN exagerada de youtuber de la persona (asombro, celebración, alerta, duda…) y su actitud"
          : "la emoción o actitud del zorro Webi"
      }, 1 a 3 objetos físicos reales de utilería (apoyados en el set — nunca stickers, iconos ni símbolos flotantes; si hay una idea abstracta, va impresa en un objeto físico como una pizarra, una pantalla encendida o una caja) y el ambiente o tono general.`
    : `- "idea": 2 a 3 frases en español natural que describan la escena de la portada: la emoción o actitud del zorro, 1 a 3 objetos físicos reales de utilería (apoyados en el set — nunca stickers, iconos ni símbolos flotantes; si hay una idea abstracta, va impresa en un objeto físico como una pizarra, una pantalla encendida o una caja) y el ambiente o tono general.`;

  return `Eres el redactor creativo de WebMaker (agencia digital, LATAM). ${contexto}

Tu tarea: redactar mejor su idea, conservando SIEMPRE el tema que él quiso contar (no inventes un tema distinto), y proponer el set completo para que él solo revise y ajuste.

Devuelve EXCLUSIVAMENTE JSON válido (sin markdown, sin backticks) con esta forma exacta:
{ "title": "...", "idea": "...", "utileria": "...", "estiloExtra": "...", "direccionId": "..." }

Reglas:
- "title": gancho corto para la miniatura, máximo ${esYoutube ? "5" : "6"} palabras, sin emojis, sin comillas internas y sin punto final. Si el compañero ya escribió un título, mejóralo sin cambiar su sentido.
${reglaIdea}
- "utileria": los MISMOS 1 a 3 objetos físicos que usaste en "idea", como lista breve separada por comas (ej: "un notebook abierto, una taza de café humeante"). Objetos reales con volumen, jamás símbolos.
- "estiloExtra": una frase corta (máximo 12 palabras) con el tono o ambiente de la escena (ej: "tono dramático, ambiente de suspenso").
- "direccionId": el id EXACTO de UNA de estas iluminaciones del estudio — elige la que mejor calce con la emoción del tema:
${catalogoLuces}

Material del compañero:
Título (puede venir vacío): "${title}"
Idea en bruto (puede venir vacía): "${ideaBruta}"`;
}

export type ImprovedIdea = {
  title: string;
  idea: string;
  utileria: string;
  estiloExtra: string;
  /** id validado contra el catálogo; "" si la IA no propuso una luz válida. */
  direccionId: string;
};

// Parseo defensivo del JSON de la IA: acepta fences de markdown y JSON
// embebido en texto; null si no hay nada usable (el endpoint responde 502).
// `allowedDireccionIds` filtra la luz sugerida: un id fuera del catálogo se
// descarta en vez de propagarse a la UI.
export function parseImprovedIdea(
  raw: string,
  allowedDireccionIds?: readonly string[],
): ImprovedIdea | null {
  const cleaned = String(raw)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let obj: unknown = null;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const rec = obj as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(rec.title);
  const idea = str(rec.idea);
  if (!title && !idea) return null;

  const direccionCruda = str(rec.direccionId);
  const direccionId =
    allowedDireccionIds && !allowedDireccionIds.includes(direccionCruda)
      ? ""
      : direccionCruda;

  return {
    title: title.slice(0, IMPROVE_TITLE_MAX),
    idea: idea.slice(0, IMPROVE_IDEA_MAX),
    utileria: str(rec.utileria).slice(0, IMPROVE_UTILERIA_MAX),
    estiloExtra: str(rec.estiloExtra).slice(0, IMPROVE_ESTILO_MAX),
    direccionId,
  };
}
