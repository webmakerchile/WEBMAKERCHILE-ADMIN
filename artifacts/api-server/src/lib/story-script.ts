// Guion narrativo de una serie de historias.
//
// CAMBIO DE RAÍZ: antes el texto de cada frame se pedía al modelo por
// separado y EN PARALELO — cada frame solo sabía su rol y el tema, así que
// la serie no tenía hilo: eran N variaciones del mismo tema. Aquí el modelo
// escribe el GUION COMPLETO de una sola vez: mismo protagonista, mismas
// cifras, progresión real y sin repetirse.
//
// El guion también dirige la ILUSTRACIÓN de cada frame (`prompt_visual`), así
// que la imagen acompaña la narrativa en vez de ser una pose genérica por rol.

import type { FormatoHistoria, PasoNarrativo } from "./story-formats.js";
import { obtenerLayoutHistoria, layoutHistoriaPorDefecto } from "./story-formats.js";

/* ========================= Tipos ========================================= */

export interface FrameGuion {
  numero: number;
  /** Rol narrativo del paso (viene del arco del formato). */
  paso: string;
  layoutId: string;
  /** Titular del frame (lo compone el motor de tipografía de impacto). */
  copy_principal: string;
  /** Línea de contexto; "" si el layout no lleva sub-copy. */
  sub_copy: string;
  /** Cifra protagonista para el layout "dato_gigante" (ej. "40", "72%"). */
  dato: string;
  /** Qué mide esa cifra (ej. "pedidos perdidos al mes"). */
  dato_label: string;
  /** Invitación final: solo en el frame de cierre. "" en el resto. */
  cta: string;
  /** Hashtags: solo en el frame de cierre. "" en el resto. */
  hashtags: string;
  /** Dirección de la ilustración de ESTE frame (pose + objetos, sin texto). */
  prompt_visual: string;
}

export interface GuionHistoria {
  /** El hilo conductor en una frase (para depurar y para los reintentos). */
  hilo: string;
  /** Protagonista/sujeto que se mantiene en toda la serie ("" si no aplica). */
  protagonista: string;
  formatoId: string;
  frames: FrameGuion[];
}

/* ==================== Límites por tipo de bloque ========================= */

/** Los layouts sin sub-copy admiten titulares más largos. */
export const LIMITES_GUION = {
  titularCorto: 44,
  titularLargo: 58,
  subCopy: 88,
  cta: 28,
  dato: 7,
  datoLabel: 34,
  promptVisual: 220,
} as const;

function limiteTitular(layoutId: string): number {
  const layout = obtenerLayoutHistoria(layoutId);
  const llevaSub = layout?.subCopyCenterY !== null && layout?.bloques.includes("subcopy");
  return llevaSub ? LIMITES_GUION.titularCorto : LIMITES_GUION.titularLargo;
}

/* ==================== Reglas de naturalidad ============================== */

/** Frases que delatan la plantilla robótica. El prompt las prohíbe y el
 *  post-proceso las limpia si el modelo insiste. */
export const FRASES_PROHIBIDAS = [
  "sigue viendo",
  "sigue mirando",
  "toca para seguir",
  "toca para ver",
  "desliza",
  "swipe",
  "continúa viendo",
  "continua viendo",
  "no te pierdas",
  "mira esto",
  "atento a lo que viene",
  "sigue leyendo",
  "en el siguiente",
  "próxima historia",
  "proxima historia",
  "descubre cómo",
  "descubre como",
  "lleva tu negocio al siguiente nivel",
  "potencia tu negocio",
  "transforma tu negocio",
  "no esperes más",
  "no esperes mas",
  "en el mundo digital de hoy",
  "en la era digital",
  "haz clic",
  "link en bio",
];

const BLOQUE_NATURALIDAD = `CÓMO ESCRIBIR (esto es lo que separa un guion bueno de una plantilla):
- Escribe como una persona que cuenta algo que le importa, no como una agencia que publica. Frases cortas, concretas, sin adornos.
- PROHIBIDO pedirle al espectador que siga mirando. Nada de "sigue viendo", "toca para seguir", "desliza", "no te pierdas", "mira esto", "en el siguiente". Si el frame necesita un botón para retener, el guion está mal escrito: la curiosidad la genera lo que CUENTAS.
- PROHIBIDAS las muletillas de marketing: "lleva tu negocio al siguiente nivel", "potencia tu negocio", "transforma tu negocio", "en la era digital", "no esperes más", "descubre cómo".
- Nada de emojis (rompen el render) ni de MAYÚSCULAS sostenidas.
- Preferir lo específico sobre lo genérico: "perdía 40 pedidos al mes" en vez de "perdía muchas ventas"; "responde en 2 minutos" en vez de "mejora la atención".
- Cada frame aporta información NUEVA. Si un frame se puede borrar sin que se note, está mal.
- No repitas la misma palabra clave en todos los titulares: varía el vocabulario manteniendo el tema.`;

const BLOQUE_CIERRE = `EL CIERRE (solo el último frame):
- El campo "cta" SOLO existe en el último frame. En todos los demás va vacío ("").
- Debe nacer de lo que acabas de contar, no ser un anuncio pegado. Varía la forma: a veces una invitación a escribir, a veces a revisar algo propio, a veces una pregunta que deja pensando.
- PROHIBIDO repetir siempre WhatsApp. Alterna entre: "Escríbenos y lo vemos", "Cuéntanos tu caso", "Agenda una llamada", "Revisa tu web hoy", "Hagamos la prueba", "¿Te suena conocido?", "Te ayudamos a verlo".
- Los "hashtags" también van SOLO en el último frame (3 a 5, uno de marca). En el resto, cadena vacía ("").`;

/* ==================== Prompt del guion =================================== */

export interface OpcionesGuion {
  tipoHistoria: string;
  concepto: string;
  formato: FormatoHistoria;
  arco: PasoNarrativo[];
  toneSuffix?: string;
  /** Ajuste libre del usuario (por ejemplo desde un reintento). */
  ajuste?: string | null;
  catalogoServicios: string;
  reglaIdioma: string;
}

export function buildGuionSystemPrompt(opts: OpcionesGuion): string {
  return `Eres guionista de contenido de WebMakerLatam, una agencia digital que ayuda a emprendedores, pymes y empresas de Latinoamérica a crecer con tecnología. Escribes SERIES DE HISTORIAS verticales (stories) que la gente ve completas porque están bien contadas.

${opts.catalogoServicios}

${opts.reglaIdioma}

AUDIENCIA: dueños de negocio que NO son técnicos. Háblales de su negocio (clientes, tiempo, ventas, tranquilidad), nunca de tecnología por dentro.

${opts.formato.instruccionGuion}

${BLOQUE_NATURALIDAD}

${BLOQUE_CIERRE}

COHERENCIA DE LA SERIE (lo más importante):
- Escribes TODOS los frames de una vez: son UNA historia partida en capítulos, no ${opts.arco.length} publicaciones sueltas.
- Define un hilo conductor y respétalo: mismo protagonista, mismo negocio, mismas cifras y mismo tiempo verbal en toda la serie.
- Cada frame debe entenderse solo (la gente entra en cualquier punto), pero verlos en orden tiene que sumar algo que por separado no está.
- Prohibido que dos frames digan lo mismo con otras palabras.

LA IMAGEN DE CADA FRAME:
- "prompt_visual" dirige la ilustración de ESE frame: describe en UNA frase la pose y expresión de Webi (el zorro naranja de la marca) y como máximo 2 objetos de apoyo concretos del relato.
- La imagen debe avanzar con la historia: la pose del frame de tensión no puede ser la misma que la del cierre.
- JAMÁS pidas texto, letras ni números dentro de la ilustración.`;
}

export function buildGuionUserPrompt(opts: OpcionesGuion): string {
  const pasos = opts.arco
    .map((p, i) => `  Frame ${i + 1} — rol "${p.paso}": ${p.objetivo}${necesitaDato(p.layoutId) ? ' [ESTE FRAME LLEVA UNA CIFRA PROTAGONISTA: rellena "dato" y "dato_label"]' : ""}${sinSubCopy(p.layoutId) ? ' [este frame NO lleva sub_copy: deja "" y pon toda la fuerza en el titular]' : ""}`)
    .join("\n");

  const n = opts.arco.length;
  return `TIPO de historia: ${opts.tipoHistoria}
TEMA: "${opts.concepto}"
FORMATO NARRATIVO: ${opts.formato.nombre} — ${opts.formato.descripcionUi}

ARCO DE ${n} FRAME${n > 1 ? "S" : ""} (respeta el rol de cada uno, en orden):
${pasos}
${opts.ajuste ? `\nAJUSTE PEDIDO POR EL USUARIO (prioridad alta): ${opts.ajuste}\n` : ""}
LÍMITES DE LONGITUD (cuéntalos, se cortan sin piedad si te pasas):
- copy_principal: máximo ${LIMITES_GUION.titularCorto} caracteres (hasta ${LIMITES_GUION.titularLargo} en los frames sin sub_copy).
- sub_copy: máximo ${LIMITES_GUION.subCopy} caracteres.
- cta: máximo ${LIMITES_GUION.cta} caracteres, solo en el último frame.
- dato: máximo ${LIMITES_GUION.dato} caracteres (ej: "40", "72%", "3 h"). dato_label: máximo ${LIMITES_GUION.datoLabel}.

Devuelve SOLO este JSON, sin markdown ni explicaciones:
{
  "hilo": "el hilo conductor de la serie en una frase",
  "protagonista": "quién protagoniza (o cadena vacía si no aplica)",
  "frames": [
    {
      "numero": 1,
      "copy_principal": "...",
      "sub_copy": "...",
      "dato": "",
      "dato_label": "",
      "cta": "",
      "hashtags": "",
      "prompt_visual": "..."
    }
  ]
}
El array "frames" debe tener EXACTAMENTE ${n} elemento${n > 1 ? "s" : ""}, en orden.`;
}

function necesitaDato(layoutId: string): boolean {
  return Boolean(obtenerLayoutHistoria(layoutId)?.bloques.includes("dato_gigante"));
}

function sinSubCopy(layoutId: string): boolean {
  const l = obtenerLayoutHistoria(layoutId);
  if (!l) return false;
  return l.subCopyCenterY === null || !l.bloques.includes("subcopy");
}

/* ==================== Parseo y saneado =================================== */

function limpiar(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** Quita las frases de relleno robótico si el modelo las coló igual. */
export function limpiarFrasesProhibidas(texto: string): string {
  let out = texto;
  for (const frase of FRASES_PROHIBIDAS) {
    const re = new RegExp(`\\s*[.,;:—-]?\\s*\\b${frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[.!¡]*`, "gi");
    out = out.replace(re, " ");
  }
  return out.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

/**
 * Parsea el JSON del guion de forma defensiva y lo alinea con el arco:
 * exactamente un frame por paso, límites aplicados, CTA/hashtags solo en el
 * cierre y frases robóticas eliminadas. Devuelve null si no hay nada usable.
 */
export function parseGuion(
  raw: string,
  arco: PasoNarrativo[],
  formatoId: string,
): GuionHistoria | null {
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
  const framesRaw = Array.isArray(rec.frames) ? rec.frames : [];
  if (framesRaw.length === 0) return null;

  const ultimo = arco.length - 1;
  const frames: FrameGuion[] = arco.map((paso, i) => {
    const f = (framesRaw[i] ?? framesRaw[framesRaw.length - 1] ?? {}) as Record<string, unknown>;
    const esCierre = i === ultimo;
    const layout = obtenerLayoutHistoria(paso.layoutId) ?? layoutHistoriaPorDefecto();

    const titular = limpiarFrasesProhibidas(limpiar(f.copy_principal)).slice(0, limiteTitular(paso.layoutId));
    const sub = sinSubCopy(paso.layoutId)
      ? ""
      : limpiarFrasesProhibidas(limpiar(f.sub_copy)).slice(0, LIMITES_GUION.subCopy);

    return {
      numero: i + 1,
      paso: paso.paso,
      layoutId: layout.id,
      copy_principal: titular,
      sub_copy: sub,
      dato: necesitaDato(paso.layoutId) ? limpiar(f.dato).slice(0, LIMITES_GUION.dato) : "",
      dato_label: necesitaDato(paso.layoutId) ? limpiar(f.dato_label).slice(0, LIMITES_GUION.datoLabel) : "",
      // CTA y hashtags SOLO en el cierre: es lo que mataba la naturalidad.
      cta: esCierre ? limpiarFrasesProhibidas(limpiar(f.cta)).slice(0, LIMITES_GUION.cta) : "",
      hashtags: esCierre ? limpiar(f.hashtags) : "",
      prompt_visual: limpiar(f.prompt_visual).slice(0, LIMITES_GUION.promptVisual),
    };
  });

  // Sin titulares no hay guion utilizable.
  if (!frames.some(f => f.copy_principal)) return null;

  return {
    hilo: limpiar(rec.hilo),
    protagonista: limpiar(rec.protagonista),
    formatoId,
    frames,
  };
}

/** Problemas de calidad que justifican pedirle al modelo una segunda pasada. */
export function revisarGuion(guion: GuionHistoria, arco: PasoNarrativo[]): string[] {
  const issues: string[] = [];
  const titulares = guion.frames.map(f => f.copy_principal.toLowerCase().trim());

  for (const [i, f] of guion.frames.entries()) {
    if (!f.copy_principal) issues.push(`el frame ${i + 1} se quedó sin titular`);
    if (necesitaDato(f.layoutId) && !f.dato) {
      issues.push(`el frame ${i + 1} necesita una cifra protagonista en "dato" y llegó vacía`);
    }
    if (!sinSubCopy(f.layoutId) && !f.sub_copy) {
      issues.push(`el frame ${i + 1} necesita sub_copy y llegó vacío`);
    }
    if (!f.prompt_visual) issues.push(`el frame ${i + 1} no trae prompt_visual`);
  }

  // Titulares repetidos = la serie no avanza.
  const vistos = new Set<string>();
  for (const [i, t] of titulares.entries()) {
    if (!t) continue;
    if (vistos.has(t)) issues.push(`el titular del frame ${i + 1} repite uno anterior`);
    vistos.add(t);
  }

  const cierre = guion.frames[arco.length - 1];
  if (cierre && !cierre.cta) issues.push("el frame de cierre se quedó sin invitación (cta)");
  return issues;
}
