// Redacción asistida de ideas de portada: el usuario cuenta su idea "a lo
// bruto" y la IA la convierte en un título de miniatura + un brief visual
// alineado con la dirección de arte "Estudio Spotlight" (utilería física real
// apoyada en el set — nunca stickers ni símbolos flotantes).

export const IMPROVE_TITLE_MAX = 60;
export const IMPROVE_IDEA_MAX = 600;

export function buildImproveIdeaPrompt(title: string, ideaBruta: string): string {
  return `Eres el redactor creativo de WebMaker (agencia digital, LATAM). Un compañero escribió a lo bruto la idea para la PORTADA vertical de un video. El estilo de marca es fijo: estudio fotográfico en penumbra con un foco de luz y el zorro Webi como protagonista, con utilería física real apoyada en el set.

Tu tarea: redactar mejor su idea, conservando SIEMPRE el tema que él quiso contar (no inventes un tema distinto).

Devuelve EXCLUSIVAMENTE JSON válido (sin markdown, sin backticks) con esta forma exacta:
{ "title": "...", "idea": "..." }

Reglas:
- "title": gancho corto para la miniatura, máximo 6 palabras, sin emojis, sin comillas internas y sin punto final. Si el compañero ya escribió un título, mejóralo sin cambiar su sentido.
- "idea": 2 a 3 frases en español natural que describan la escena de la portada: la emoción o actitud del zorro, 1 a 3 objetos físicos reales de utilería (apoyados en el set — nunca stickers, iconos ni símbolos flotantes; si hay una idea abstracta, va impresa en un objeto físico como una pizarra, una pantalla encendida o una caja) y el ambiente o tono general.

Material del compañero:
Título (puede venir vacío): "${title}"
Idea en bruto (puede venir vacía): "${ideaBruta}"`;
}

export type ImprovedIdea = { title: string; idea: string };

// Parseo defensivo del JSON de la IA: acepta fences de markdown y JSON
// embebido en texto; null si no hay nada usable (el endpoint responde 502).
export function parseImprovedIdea(raw: string): ImprovedIdea | null {
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
  const title = typeof rec.title === "string" ? rec.title.trim() : "";
  const idea = typeof rec.idea === "string" ? rec.idea.trim() : "";
  if (!title && !idea) return null;

  return {
    title: title.slice(0, IMPROVE_TITLE_MAX),
    idea: idea.slice(0, IMPROVE_IDEA_MAX),
  };
}
