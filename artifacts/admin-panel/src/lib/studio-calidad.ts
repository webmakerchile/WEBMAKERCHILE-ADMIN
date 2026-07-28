// Calidad de captura del Estudio.
//
// Antes se pedía la cámara así:
//
//   width:  { ideal: 1080, max: 1920 }
//   height: { ideal: 1920, max: 2560 }
//
// `max` es una restricción DURA en getUserMedia: el navegador NUNCA entrega
// más que eso. Un 4K vertical son 2160x3840, o sea que grabar en 4K era
// imposible por diseño — daba igual la cámara del teléfono. Y `ideal: 1080`
// hacía que la frontal, que suele tener menos modos, se quedara en 1080p
// incluso pudiendo dar más.
//
// El bitrate era peor: 8 Mbps fijos. A 1080p pasa; a 4K son cinco veces menos
// de lo que necesita, así que el vídeo salía blando aunque la captura fuera
// buena. Y pedirle a un móvil modesto 8 Mbps a una resolución que no puede
// codificar por hardware es justo lo que hace que se salten fotogramas: el
// "lag" que se veía.
//
// Aquí no hay techo artificial: se pide lo máximo del perfil y luego se LEE lo
// que el dispositivo entregó de verdad, y el bitrate sale de ahí.

export type PerfilCalidad = "maxima" | "alta" | "datos";

export interface Perfil {
  id: PerfilCalidad;
  etiqueta: string;
  descripcion: string;
  /** Alto ideal en píxeles del lado largo (vertical). */
  altoIdeal: number;
  /** Fotogramas por segundo ideales. */
  fps: number;
}

export const PERFILES_CALIDAD: Perfil[] = [
  {
    id: "maxima",
    etiqueta: "Máxima",
    descripcion: "Pide lo mejor que dé la cámara (hasta 4K). Archivos grandes.",
    altoIdeal: 3840,
    fps: 30,
  },
  {
    id: "alta",
    etiqueta: "Alta 1080p",
    descripcion: "Full HD vertical. El equilibrio seguro en cualquier equipo.",
    altoIdeal: 1920,
    fps: 30,
  },
  {
    id: "datos",
    etiqueta: "Ahorro 720p",
    descripcion: "Para conexiones lentas o equipos justos de batería.",
    altoIdeal: 1280,
    fps: 30,
  },
];

export function perfilPorId(id: PerfilCalidad): Perfil {
  return PERFILES_CALIDAD.find((p) => p.id === id) ?? PERFILES_CALIDAD[1]!;
}

/**
 * Restricciones de vídeo para `getUserMedia`.
 *
 * Todo va como `ideal`, nunca como `max`: `ideal` significa "dame lo más
 * parecido que puedas" y degrada solo si hace falta, mientras que `max` corta
 * en seco. Ese era el bug: el techo impedía físicamente capturar en 4K.
 */
export function restriccionesVideo(perfil: Perfil, facing: "user" | "environment"): MediaTrackConstraints {
  return {
    facingMode: facing,
    frameRate: { ideal: perfil.fps },
    width: { ideal: Math.round((perfil.altoIdeal * 9) / 16) },
    height: { ideal: perfil.altoIdeal },
    aspectRatio: { ideal: 9 / 16 },
  };
}

/** Restricciones mínimas: solo la cámara, sin pedir formato. Último recurso. */
export function restriccionesMinimas(facing: "user" | "environment"): MediaTrackConstraints {
  return { facingMode: facing };
}

/**
 * Bitrate de vídeo para la resolución REAL capturada.
 *
 * Se calcula por píxel y por segundo en vez de fijarlo: 8 Mbps a 1080p es una
 * cifra razonable, la misma cifra a 4K es un vídeo destrozado. La constante
 * (0.10 bits por píxel y fotograma) sale de dejar 1080p30 en ~6.2 Mbps y
 * 4K30 en ~25 Mbps, que es el rango que piden Instagram y YouTube para
 * vertical.
 *
 * El techo de 45 Mbps existe para no ahogar al codificador del móvil: por
 * encima de eso ningún encoder por hardware de teléfono mantiene el ritmo, y
 * quedarse sin ritmo es exactamente lo que produce fotogramas saltados.
 */
export const BITS_POR_PIXEL = 0.1;
export const BITRATE_MIN = 2_000_000;
export const BITRATE_MAX = 45_000_000;

export function bitratePara(ancho: number, alto: number, fps = 30): number {
  // `Math.max(1, NaN)` es NaN, no 1: los valores no numéricos hay que
  // descartarlos ANTES. El navegador deja campos sin informar más de lo que
  // parece, y un bitrate NaN hace que MediaRecorder lance al construirse.
  const sano = (v: number, porDefecto: number) => (Number.isFinite(v) && v > 0 ? v : porDefecto);
  const px = sano(ancho, 1) * sano(alto, 1);
  const crudo = px * sano(fps, 30) * BITS_POR_PIXEL;
  return Math.round(Math.min(BITRATE_MAX, Math.max(BITRATE_MIN, crudo)));
}

/** Bitrate de audio: 128 kbps estéreo, suficiente para voz y música de fondo. */
export const BITRATE_AUDIO = 128_000;

/**
 * Nombre comercial de una resolución vertical, por el lado LARGO.
 *
 * Se mira el lado largo y no el ancho porque el estudio graba en vertical: un
 * 2160x3840 es "4K" aunque su ancho sea 2160.
 */
export function etiquetaResolucion(ancho: number, alto: number): string {
  const largo = Math.max(ancho, alto);
  if (largo >= 3200) return "4K";
  if (largo >= 2400) return "2.7K";
  if (largo >= 2000) return "2K";
  if (largo >= 1700) return "1080p";
  if (largo >= 1100) return "720p";
  if (largo > 0) return `${ancho}×${alto}`;
  return "—";
}

/** "25 Mbps" a partir de bits por segundo. */
export function etiquetaBitrate(bps: number): string {
  return `${(bps / 1_000_000).toFixed(bps >= 10_000_000 ? 0 : 1)} Mbps`;
}

/**
 * Orden de preferencia de contenedor y códec.
 *
 * MP4/H.264 primero porque es lo que aceptan Drive, TikTok e Instagram sin
 * reprocesar, y porque casi todos los móviles lo codifican por hardware — que
 * es la diferencia entre grabar fluido y grabar a tirones.
 */
export const MIMES_PREFERIDOS = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];

export interface DiagnosticoCaptura {
  ancho: number;
  alto: number;
  fps: number;
  etiqueta: string;
  bitrate: number;
}

/** Lo que se está capturando de verdad, para mostrarlo en pantalla. */
export function diagnosticarCaptura(settings: MediaTrackSettings): DiagnosticoCaptura {
  const ancho = Math.round(settings.width ?? 0);
  const alto = Math.round(settings.height ?? 0);
  const fps = Math.round(settings.frameRate ?? 30);
  return {
    ancho,
    alto,
    fps,
    etiqueta: etiquetaResolucion(ancho, alto),
    bitrate: bitratePara(ancho, alto, fps),
  };
}

/**
 * Decide si hay que bajar de perfil por fotogramas perdidos.
 *
 * Se mide sobre la previsualización, que es el mismo pipeline que alimenta al
 * codificador: si el navegador no logra pintar los fotogramas, tampoco los
 * está codificando. Por encima del 8% perdido la grabación se ve a tirones —
 * y el usuario no tiene por qué diagnosticarlo, así que se baja solo Y SE
 * AVISA. Bajar en silencio sería indistinguible de que funcione bien.
 */
export const UMBRAL_FOTOGRAMAS_PERDIDOS = 0.08;

export function debeBajarPerfil(total: number, perdidos: number): boolean {
  if (total < 60) return false; // menos de ~2 s: aún no hay muestra
  return perdidos / total > UMBRAL_FOTOGRAMAS_PERDIDOS;
}

/** Perfil inmediatamente inferior, o null si ya es el más bajo. */
export function perfilInferior(id: PerfilCalidad): Perfil | null {
  const i = PERFILES_CALIDAD.findIndex((p) => p.id === id);
  if (i < 0 || i >= PERFILES_CALIDAD.length - 1) return null;
  return PERFILES_CALIDAD[i + 1]!;
}
