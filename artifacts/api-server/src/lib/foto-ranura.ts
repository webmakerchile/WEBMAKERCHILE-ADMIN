// Fotos propias dentro de la pieza interactiva.
//
// Un "antes y después" sin fotos es dos rectángulos con texto: la mitad de la
// gracia del formato es enseñar el cambio. Lo mismo con "ponle título", donde
// el marco vacío pide justamente una imagen.
//
// La foto NO se le pasa al modelo de imagen: se compone aquí, encima de la
// ilustración ya generada, en el hueco exacto que el formato reserva. Así la
// foto sale tal cual la subieron —sin reinterpretar— y el zorro y el set
// siguen siendo los de siempre.

import sharp from "sharp";
import { validarFotoPersona } from "./youtube-cover.js";

/** Un hueco del formato donde cabe una foto. */
export interface RanuraFoto {
  id: string;
  etiqueta: string;
  /** Qué se espera ahí, para que no haya que adivinar qué subir. */
  ayuda: string;
}

/**
 * Lado máximo de la foto ya preparada.
 *
 * La foto viaja incrustada en el SVG como data-URI, así que su peso es el peso
 * del SVG. Una foto de teléfono sin reducir son varios MB de base64 que el
 * rasterizador tiene que tragar entero: bastante más lento y sin ninguna
 * ganancia visible, porque el hueco donde entra mide unos 500 px.
 */
export const LADO_MAX = 900;

/** Calidad del JPEG de salida: suficiente para el tamaño en que se ve. */
const CALIDAD = 82;

export type FotoPreparada =
  | { ok: true; dataUri: string; ancho: number; alto: number }
  | { ok: false; error: string };

/**
 * Deja una foto lista para incrustarla en el hueco.
 *
 * Recorta al ALTO Y ANCHO del hueco (estilo "cover") en vez de encajarla
 * entera: una foto vertical metida en un hueco horizontal deja dos franjas
 * vacías a los lados, y eso se ve como un error de maquetación.
 */
export async function prepararFoto(
  base64: string,
  proporcion: number,
): Promise<FotoPreparada> {
  const v = validarFotoPersona(base64);
  if (!v.ok) return { ok: false, error: v.error };

  const ratio = Number.isFinite(proporcion) && proporcion > 0 ? proporcion : 1;
  const ancho = ratio >= 1 ? LADO_MAX : Math.round(LADO_MAX * ratio);
  const alto = ratio >= 1 ? Math.round(LADO_MAX / ratio) : LADO_MAX;

  try {
    const buf = await sharp(Buffer.from(v.base64, "base64"))
      .rotate() // respeta la orientación EXIF: si no, las fotos de teléfono salen tumbadas
      .resize(ancho, alto, { fit: "cover", position: "attention" })
      .jpeg({ quality: CALIDAD, mozjpeg: true })
      .toBuffer();
    return { ok: true, dataUri: `data:image/jpeg;base64,${buf.toString("base64")}`, ancho, alto };
  } catch {
    return { ok: false, error: "No se pudo procesar la foto. Prueba con otra." };
  }
}

/** Fotos ya preparadas, indexadas por el id de su ranura. */
export type FotosPorRanura = Map<string, string>;

/**
 * Prepara todas las fotos que llegaron, ignorando las ranuras vacías.
 *
 * Que falte una foto NO es un error: las ranuras son opcionales y el bloque
 * sabe dibujarse sin ellas. Que una foto llegue rota SÍ lo es, y se dice cuál.
 */
export async function prepararFotos(
  entradas: Record<string, string | undefined> | undefined,
  ranuras: readonly RanuraFoto[],
  proporcion: number,
): Promise<{ ok: true; fotos: FotosPorRanura } | { ok: false; error: string }> {
  const fotos: FotosPorRanura = new Map();
  if (!entradas) return { ok: true, fotos };

  for (const r of ranuras) {
    const crudo = entradas[r.id]?.trim();
    if (!crudo) continue;
    const p = await prepararFoto(crudo, proporcion);
    if (!p.ok) return { ok: false, error: `${r.etiqueta}: ${p.error}` };
    fotos.set(r.id, p.dataUri);
  }
  return { ok: true, fotos };
}

/**
 * Una foto recortada dentro de un rectángulo redondeado.
 *
 * `id` tiene que ser único dentro del SVG: dos recortes con el mismo id hacen
 * que el segundo use la forma del primero y la foto salga cortada donde no es.
 */
export function imagenRecortada(
  dataUri: string,
  id: string,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  radio: number,
): string {
  return (
    `<clipPath id="${id}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" height="${alto.toFixed(1)}" rx="${radio}"/></clipPath>` +
    `<image href="${dataUri}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" height="${alto.toFixed(1)}" ` +
    `preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
  );
}

/**
 * Velo oscuro sobre la foto para que el texto encima se lea.
 *
 * Sin esto el texto blanco desaparece sobre una foto clara y el negro sobre
 * una oscura: no hay color de letra que funcione con cualquier foto, así que
 * el contraste lo tiene que poner la pieza y no la suerte.
 */
export function veloTexto(
  id: string,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  radio: number,
): string {
  return (
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#000000" stop-opacity="0.15"/>` +
    `<stop offset="55%" stop-color="#000000" stop-opacity="0.45"/>` +
    `<stop offset="100%" stop-color="#000000" stop-opacity="0.78"/>` +
    `</linearGradient></defs>` +
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" height="${alto.toFixed(1)}" rx="${radio}" fill="url(#${id})"/>`
  );
}
