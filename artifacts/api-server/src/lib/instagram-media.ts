// Preparación de medios para la API de publicación de Instagram.
//
// Instagram solo publicaba REELS: `uploadToInstagram` fijaba
// `media_type: "REELS"` y exigía un archivo de video en Drive. Pero TODO lo que
// genera esta app son imágenes (Portadas, Historias, Posts IA), así que ninguna
// de ellas podía llegar a Instagram — y, peor, el programador las marcaba como
// publicadas con éxito porque no había video que subir.
//
// Este módulo concentra las reglas de la plataforma, que son estrictas y no
// evidentes:
//
//  · Las imágenes deben ir en JPEG. La API rechaza PNG, y nuestro renderizador
//    produce PNG: sin conversión, el contenedor falla siempre.
//  · El feed solo acepta relaciones de aspecto entre 4:5 (0.8) y 1.91:1. Una
//    historia 9:16 (0.5625) NO cabe en el feed: su sitio es STORIES.
//  · Las historias aceptan el vertical completo.

import sharp from "sharp";

/** Límites de relación de aspecto del feed de Instagram (ancho / alto). */
export const RATIO_FEED_MIN = 0.8; // 4:5, vertical máximo
export const RATIO_FEED_MAX = 1.91; // 1.91:1, horizontal máximo

export type DestinoInstagram = "feed" | "story" | "auto";
export type TipoMedioInstagram = "IMAGE" | "STORIES" | "REELS";

export interface MedioPreparado {
  buffer: Buffer;
  mimeType: string;
  /** Valor exacto de `media_type` para el contenedor de la API. */
  tipo: TipoMedioInstagram;
  extension: string;
  /** Explicación de lo que se hizo, para el log y para la UI. */
  nota: string;
}

export function esMimeImagen(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

export function esMimeVideo(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("video/");
}

/** Deduce el tipo por el nombre cuando Drive no informa un MIME útil. */
export function pareceImagenPorNombre(nombre: string | null | undefined): boolean {
  return !!nombre && /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(nombre);
}

/**
 * Decide si una imagen va al feed o a historias cuando el destino es "auto".
 *
 * No es una preferencia estética: una imagen 9:16 simplemente no es publicable
 * en el feed, la API la rechaza. Elegir por la forma del lienzo es lo único que
 * permite que una historia generada aquí llegue a Instagram.
 */
export function destinoPorRatio(ratio: number): "feed" | "story" {
  return ratio < RATIO_FEED_MIN ? "story" : "feed";
}

/**
 * Convierte la imagen a lo que Instagram acepta y elige el `media_type`.
 *
 * Si la imagen es demasiado ancha para el feed se rellena hasta 1.91:1 con el
 * fondo de marca en vez de recortarla: recortar podría comerse el titular, y
 * este renderizador compone el texto pegado a los bordes de la zona.
 */
export async function prepararImagenInstagram(
  original: Buffer,
  destino: DestinoInstagram = "auto",
): Promise<MedioPreparado> {
  const meta = await sharp(original).metadata();
  const ancho = meta.width ?? 0;
  const alto = meta.height ?? 0;
  if (!ancho || !alto) throw new Error("La imagen no tiene dimensiones legibles");

  const ratio = ancho / alto;
  const elegido = destino === "auto" ? destinoPorRatio(ratio) : destino;

  let pipeline = sharp(original);
  let nota = `${ancho}x${alto} (${ratio.toFixed(2)}:1) → ${elegido}`;

  if (elegido === "feed" && ratio > RATIO_FEED_MAX) {
    // Demasiado apaisada para el feed: se añade alto hasta entrar en 1.91:1.
    const altoObjetivo = Math.ceil(ancho / RATIO_FEED_MAX);
    const relleno = altoObjetivo - alto;
    pipeline = pipeline.extend({
      top: Math.floor(relleno / 2),
      bottom: Math.ceil(relleno / 2),
      left: 0,
      right: 0,
      // Negro neutro del set, no el azul marino de la paleta anterior: las
      // barras se tienen que confundir con el fondo, no anunciarse.
      background: { r: 14, g: 14, b: 16 },
    });
    nota += ` · rellenada a ${ancho}x${altoObjetivo} para entrar en el feed`;
  }

  // JPEG obligatorio: la API rechaza PNG y nuestro renderizador produce PNG.
  const buffer = await pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();

  return {
    buffer,
    mimeType: "image/jpeg",
    tipo: elegido === "story" ? "STORIES" : "IMAGE",
    extension: "jpg",
    nota,
  };
}

/**
 * Motivo legible por el que un medio NO se puede publicar en Instagram, o null
 * si sí se puede. Se usa para explicarlo en la UI en vez de fallar en silencio.
 */
export function motivoNoPublicable(
  mimeType: string | null | undefined,
  nombre: string | null | undefined,
): string | null {
  if (esMimeVideo(mimeType) || esMimeImagen(mimeType)) return null;
  if (pareceImagenPorNombre(nombre)) return null;
  // MIME desconocido: Drive no siempre lo informa. Se mantiene el
  // comportamiento histórico —tratarlo como video e intentarlo— porque
  // rechazar por no saber rompería publicaciones que antes funcionaban.
  if (!mimeType) return null;
  return `Instagram no acepta este tipo de archivo (${mimeType})`;
}
