// Plan de normalización del vídeo del Estudio.
//
// El servidor re-codifica lo que graba el navegador por dos razones legítimas:
// MediaRecorder produce vídeo de tasa de fotogramas VARIABLE (los editores lo
// desincronizan) y algunos móviles entregan el vídeo apaisado con una etiqueta
// de rotación que muchos reproductores ignoran.
//
// Pero el filtro estaba escrito así:
//
//   scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920
//
// Eso REDUCE todo a 1080p. Grabaras lo que grabaras — 4K incluido — el
// servidor lo tiraba a Full HD antes de subirlo a Drive. Era el último y más
// definitivo de los topes: aunque el navegador hubiera capturado en 4K, aquí
// se perdía. "Si grabo en 4K que se suba en 4K" pasaba exactamente por acá.
//
// Ahora el recorte a 9:16 se calcula SOBRE la resolución de origen y solo se
// reduce si supera el techo de 4K. Vive fuera de la ruta para poder probarlo
// sin ffmpeg ni subida a Drive.

/** Techo de resolución: 4K vertical. Por encima no lo acepta ninguna red. */
export const ALTO_MAXIMO = 3840;
export const ANCHO_MAXIMO = 2160;

/** Formato de salida del estudio: vertical 9:16. */
export const ASPECTO_DESTINO = 9 / 16;

/** Tope de fotogramas por segundo: más no aporta y multiplica el tiempo de encode. */
export const FPS_MAXIMO = 60;

export interface FuenteVideo {
  width: number;
  height: number;
  /** Rotación declarada en los metadatos (0, 90, 180, 270 o negativos). */
  rotation: number;
  /** Fotogramas por segundo del origen; 0 si no se pudo leer. */
  fps?: number;
}

export interface PlanVideo {
  /** Cadena para `-vf`. */
  vf: string;
  /** Resolución final. */
  ancho: number;
  alto: number;
  /** Fotogramas por segundo de salida (constantes). */
  fps: number;
  crf: number;
  preset: string;
  /** Milisegundos de margen para el proceso de ffmpeg. */
  timeoutMs: number;
  /** true si hubo que reducir por superar el techo. */
  reducido: boolean;
  /** Frase para el log: deja por escrito qué se hizo con la resolución. */
  resumen: string;
}

/** Redondea a par: libx264 con yuv420p exige dimensiones pares. */
function aPar(n: number): number {
  const v = Math.round(n);
  return v % 2 === 0 ? v : v - 1;
}

function sano(v: number | undefined, porDefecto: number): number {
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : porDefecto;
}

/**
 * Calcula el recorte 9:16 más grande que cabe en la fuente, sin ampliar.
 *
 * Nunca escala hacia arriba: estirar 720p a 4K no añade detalle, solo peso.
 */
export function recorteVertical(ancho: number, alto: number): { ancho: number; alto: number } {
  const w = sano(ancho, 0);
  const h = sano(alto, 0);
  if (w <= 0 || h <= 0) return { ancho: 0, alto: 0 };
  // Más ancha que 9:16 → sobra ancho. Más alta → sobra alto.
  if (w / h > ASPECTO_DESTINO) {
    return { ancho: aPar(h * ASPECTO_DESTINO), alto: aPar(h) };
  }
  return { ancho: aPar(w), alto: aPar(w / ASPECTO_DESTINO) };
}

/**
 * Plan completo de normalización.
 *
 * `duracionSeg` solo afecta al timeout: codificar 4K tarda mucho más que 1080p
 * y el timeout fijo de 180 s hacía que un 4K largo fallara y cayera al vídeo
 * crudo. Un fallo que se resuelve subiendo el original no es grave, pero sí es
 * un fallo silencioso: el vídeo llegaba a Drive con tasa variable sin que
 * nadie lo supiera.
 */
export function planNormalizacion(fuente: FuenteVideo, duracionSeg = 60): PlanVideo {
  const wIn = sano(fuente.width, 0);
  const hIn = sano(fuente.height, 0);
  const rot = Math.abs(sano(fuente.rotation, 0));
  const rotada = rot === 90 || rot === 270;

  const filtros: string[] = [];

  // Apaisada y SIN etiqueta de rotación: hay que girarla de verdad. Si la
  // etiqueta existe, ffmpeg ya la aplica y girar otra vez la dejaría al revés.
  const apaisada = wIn > hIn && !rotada;
  if (apaisada) filtros.push("transpose=1");

  // Tras el giro, el lado largo pasa a ser el alto.
  const w = apaisada ? hIn : wIn;
  const h = apaisada ? wIn : hIn;

  // Sin dimensiones legibles no se inventa nada: se deja el 1080x1920 de
  // siempre, que es el formato que promete la sección.
  if (w <= 0 || h <= 0) {
    filtros.push(`scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`);
    return {
      vf: filtros.join(","),
      ancho: 1080,
      alto: 1920,
      fps: 30,
      crf: 18,
      preset: "fast",
      timeoutMs: 240_000,
      reducido: false,
      resumen: "sin dimensiones legibles: se normaliza a 1080x1920",
    };
  }

  const recorte = recorteVertical(w, h);
  let salidaW = recorte.ancho;
  let salidaH = recorte.alto;
  let reducido = false;

  if (salidaH > ALTO_MAXIMO || salidaW > ANCHO_MAXIMO) {
    const factor = Math.min(ALTO_MAXIMO / salidaH, ANCHO_MAXIMO / salidaW);
    salidaW = aPar(salidaW * factor);
    salidaH = aPar(salidaH * factor);
    reducido = true;
  }

  // Recortar al centro a la resolución de ORIGEN, y solo escalar si se recortó
  // por el techo. El orden importa: crop primero trabaja sobre más píxeles.
  filtros.push(`crop=${recorte.ancho}:${recorte.alto}`);
  if (reducido) filtros.push(`scale=${salidaW}:${salidaH}:flags=lanczos`);

  const fps = Math.min(FPS_MAXIMO, Math.round(sano(fuente.fps, 30)));

  // A más píxeles, preset más rápido: `fast` a 4K multiplica el tiempo sin
  // diferencia visible a estos bitrates, y lo que sí se nota es el timeout.
  const megapixeles = (salidaW * salidaH) / 1_000_000;
  const crf = megapixeles > 4 ? 20 : 18;
  const preset = megapixeles > 4 ? "veryfast" : "fast";

  // Presupuesto: ~1.2 s de proceso por segundo de vídeo y megapíxel, con un
  // suelo de 4 min y un techo de 20 (por encima algo va mal, no lento).
  const estimado = duracionSeg * Math.max(1, megapixeles) * 1200;
  const timeoutMs = Math.round(Math.min(1_200_000, Math.max(240_000, estimado)));

  const resumen = reducido
    ? `${wIn}x${hIn}${apaisada ? " (girada)" : ""} → ${salidaW}x${salidaH} (reducida: superaba 4K)`
    : `${wIn}x${hIn}${apaisada ? " (girada)" : ""} → ${salidaW}x${salidaH} (resolución de origen conservada)`;

  return { vf: filtros.join(","), ancho: salidaW, alto: salidaH, fps, crf, preset, timeoutMs, reducido, resumen };
}

/** Nombre comercial por el lado largo (el estudio graba en vertical). */
export function etiquetaResolucion(ancho: number, alto: number): string {
  const largo = Math.max(sano(ancho, 0), sano(alto, 0));
  if (largo >= 3200) return "4K";
  if (largo >= 2400) return "2.7K";
  if (largo >= 2000) return "2K";
  if (largo >= 1700) return "1080p";
  if (largo >= 1100) return "720p";
  return largo > 0 ? `${ancho}x${alto}` : "desconocida";
}
