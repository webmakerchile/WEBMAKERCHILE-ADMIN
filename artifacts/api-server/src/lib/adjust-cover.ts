// Ajustes conversacionales sobre una imagen YA generada (portada vertical o
// miniatura de YouTube): el usuario pide un cambio puntual en lenguaje natural
// y gpt-image-1 EDITA la imagen actual manteniendo todo lo demás intacto
// (fidelidad "high"). También redacta la instrucción cruda del usuario antes
// de enviarla, vía el modelo de texto.

import sharp from "sharp";
import { COVER_WIDTH, COVER_HEIGHT } from "./cover-style.js";
import { YT_WIDTH, YT_HEIGHT } from "./youtube-cover.js";

export type FormatoAjuste = "vertical" | "youtube";

/* ==================== Prompt de edición ================================== */

export function buildAdjustPrompt(instruction: string, formato: FormatoAjuste): string {
  // Con el sistema de plantillas el titular puede vivir en cualquier zona
  // (izquierda, derecha, arriba o abajo según la plantilla usada), así que la
  // regla lo protege esté donde esté. `formato` sigue definiendo el lienzo.
  void formato;
  return `Edita la imagen adjunta aplicando ÚNICAMENTE el cambio pedido más abajo.

REGLA MAESTRA — TODO LO DEMÁS QUEDA EXACTAMENTE IGUAL (CRÍTICO):
- Mantén IDÉNTICOS la composición, el encuadre, el personaje o persona (rostro EXACTO), la pose, la ropa, los colores, la iluminación, el fondo y todos los objetos que el cambio no mencione
- El TEXTO DEL TITULAR (y cualquier número gigante o comillas decorativas), esté donde esté en la imagen, queda INTACTO: mismas palabras, misma tipografía, mismo tamaño, misma posición y mismos colores. PROHIBIDO tocarlo, moverlo o redibujarlo
- La imagen trae FRANJAS NEGRAS de relleno en dos bordes: déjalas EXACTAMENTE como están. No las elimines, no las rellenes con contenido y NO reencuadres ni hagas zoom — la escena debe quedar en la misma posición exacta
- No agregues elementos que no se pidan, no elimines nada que no se pida, no cambies el estilo visual ni el nivel de detalle

CAMBIO PEDIDO POR EL USUARIO (aplícalo bien integrado a la luz y la perspectiva de la escena):
${instruction}

Si el cambio pide escribir un texto dentro de un objeto de la escena (pizarra, pantalla, letrero, caja), escríbelo LEGIBLE, bien tipografiado y con la ortografía EXACTA pedida. Fuera de ese caso, no agregues ningún texto nuevo a la imagen.`;
}

/* El lienzo de edición de gpt-image-1 (1536x1024 / 1024x1536) NO tiene el
 * aspecto final (16:9 / 9:16). Si se envía la imagen tal cual, el modelo la
 * reencuadra para llenar el lienzo y el titular termina cortado. Solución
 * determinista: ANTES de editar se rellena con franjas negras hasta el lienzo
 * exacto (letterbox, todo en enteros: 1280x720→1536x864+80px arriba/abajo;
 * 1080x1920→864x1536+80px por lado) y DESPUÉS se recorta la región central,
 * descartando las franjas — el encuadre queda idéntico al original. */

const LIENZO_EDIT: Record<FormatoAjuste, { w: number; h: number }> = {
  youtube: { w: 1536, h: 1024 },
  vertical: { w: 1024, h: 1536 },
};
const TAMANO_FINAL: Record<FormatoAjuste, { w: number; h: number }> = {
  youtube: { w: YT_WIDTH, h: YT_HEIGHT },
  vertical: { w: COVER_WIDTH, h: COVER_HEIGHT },
};

/** Rellena la imagen actual con franjas negras hasta el tamaño exacto del
 *  lienzo de edición, sin deformar ni recortar nada. */
export async function prepararLienzoAjuste(buf: Buffer, formato: FormatoAjuste): Promise<Buffer> {
  const { w, h } = LIENZO_EDIT[formato];
  return sharp(buf)
    .resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
}

/** Recorta la región central (descarta las franjas de relleno) y devuelve la
 *  imagen al tamaño final del formato. */
export async function recortarAjuste(buf: Buffer, formato: FormatoAjuste): Promise<Buffer> {
  const lienzo = LIENZO_EDIT[formato];
  const fin = TAMANO_FINAL[formato];
  // Pase 1 (sharp solo admite UN resize por pipeline): normaliza al tamaño
  // exacto del lienzo, por si el modelo devolviera otro tamaño.
  const normalizado = await sharp(buf)
    .resize(lienzo.w, lienzo.h, { fit: "cover", position: "centre" })
    .toBuffer();
  const scale = Math.min(lienzo.w / fin.w, lienzo.h / fin.h);
  const width = Math.round(fin.w * scale);
  const height = Math.round(fin.h * scale);
  const left = Math.round((lienzo.w - width) / 2);
  const top = Math.round((lienzo.h - height) / 2);
  // Pase 2: recorta la región central (fuera franjas) y escala al tamaño final.
  return sharp(normalizado)
    .extract({ left, top, width, height })
    .resize(fin.w, fin.h)
    .png()
    .toBuffer();
}

/* ==================== Redacción de la instrucción ========================= */

export function buildImproveAdjustPrompt(
  instruction: string,
  formato: FormatoAjuste,
  title?: string | null,
): string {
  const pieza = formato === "youtube" ? "miniatura de YouTube" : "portada vertical";
  return `Eres el redactor creativo de WebMaker (agencia digital, LATAM). Un compañero quiere pedirle a la IA de imágenes un CAMBIO PUNTUAL sobre una ${pieza} ya generada${title ? ` (título del video: "${title}")` : ""}, pero lo escribió a lo bruto. Reescríbelo como una instrucción de edición clara y precisa.

INSTRUCCIÓN A LO BRUTO DEL COMPAÑERO:
"""
${instruction}
"""

REGLAS:
- Conserva la INTENCIÓN exacta: no agregues cambios que él no pidió ni elimines ninguno de los que pidió
- Si menciona un texto literal que debe aparecer en la imagen, consérvalo EXACTO y ponlo entre comillas
- Redáctala como orden directa de edición (ej: "Cambia…", "Haz que…"), máximo 2 frases, en español
- Si el pedido es ambiguo, elige la interpretación más obvia y hazla específica (qué objeto, qué cambio, dónde)
- Recuerda el estilo de la marca: set de estudio con utilería física real — nada de stickers ni iconos flotantes

Responde SOLO con JSON válido, sin markdown:
{"instruction": "la instrucción reescrita"}`;
}

export function parseImprovedInstruction(raw: string): string | null {
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
  const instruction = (obj as Record<string, unknown>).instruction;
  if (typeof instruction !== "string" || !instruction.trim()) return null;
  return instruction.trim().slice(0, 1000);
}
