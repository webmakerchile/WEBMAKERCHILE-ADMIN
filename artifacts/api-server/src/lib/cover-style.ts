// Sistema de direcciones de arte para portadas verticales (TikTok / 9:16).
//
// Antes todas las portadas compartían UNA receta fija (fondo slate + glow
// naranja + franja amarilla con texto blanco). Ahora cada portada combina:
//   · una DIRECCIÓN DE ARTE rotativa (fondo, luz, paleta, tipografía propia),
//   · un detalle escenográfico aleatorio dentro de la dirección,
//   · una pose del banco de poses (pose-bank),
//   · palabras del título destacadas en color de acento.
// La selección usa memoria FIFO anti-repetición: dos portadas seguidas nunca
// comparten dirección. El zorro Webi (flat cartoon, referencia master) se
// mantiene intacto: lo que cambia es TODO lo demás.

import { readFile } from "fs/promises";
import path from "path";
import { ai } from "@workspace/integrations-gemini-ai";
import { firstInlineData } from "./gemini-parts";
import {
  seleccionarPosePortada,
  bloquePoseRequerida,
  type PoseSeleccionada,
} from "./pose-bank";

export const COVER_WIDTH = 1080;
export const COVER_HEIGHT = 1920;
const TEXT_ZONE_TOP = 150;
const TEXT_ZONE_HEIGHT = 280;
const TEXT_SIDE_PADDING = 60;

/* ========================= Tipos ========================================= */

export interface EstiloTitular {
  /** "display" = Bebas Neue (condensada, alto impacto) · "sans" = Montserrat Black. */
  fuente: "display" | "sans";
  /** "chips" = cada línea sobre una placa redondeada · "limpio" = texto directo con sombra. */
  modo: "chips" | "limpio";
  colorTexto: string;
  /** Color para las 1-2 palabras clave del título. */
  colorAcento: string;
  chipFondo?: string;
  /** Scrim: degradado superior que garantiza legibilidad sin tapar la escena. */
  scrim: { r: number; g: number; b: number };
  /** Inclinación en grados del bloque de texto (dinamismo). */
  inclinacion: number;
}

export interface DireccionArte {
  id: string;
  nombre: string;
  /** Bloque de prompt que describe el fondo/atmósfera (NO el personaje). */
  fondo: string;
  paletaObjetos: string;
  /** Detalles escenográficos: se elige 1 al azar para que cada portada sea única. */
  detalles: string[];
  titular: EstiloTitular;
}

/* ==================== Banco de direcciones de arte ======================= */

export const DIRECCIONES_PORTADA: DireccionArte[] = [
  {
    id: "neon_nocturno",
    nombre: "Neón nocturno",
    fondo: `Ciudad nocturna abstracta y elegante: gradiente vertical de azul índigo profundo (#0B1026 arriba, casi negro) a violeta oscuro (#1E1B4B) hacia abajo. Siluetas minimalistas de edificios al fondo en un tono apenas más claro. Dos o tres trazos de luz de neón (cian #22D3EE y magenta #E879F9) como líneas geométricas elegantes detrás del zorro, con glow suave. El piso refleja levemente los neones como pavimento mojado (reflejos sutiles, no espejo). La franja superior se mantiene en el azul índigo más oscuro y plano, limpia.`,
    paletaObjetos: `objetos flat con contorno negro grueso en cian eléctrico, magenta, naranja del zorro y blanco; pequeños acentos de glow neón en bordes de pantallas u objetos tecnológicos`,
    detalles: [
      "una luna llena pequeña y estilizada con halo suave en una esquina lateral del cielo, a media altura",
      "lluvia fina sugerida con trazos diagonales muy sutiles al 8% de opacidad",
      "un cartel de neón ABSTRACTO (formas geométricas, sin letras) colgando a un costado",
    ],
    titular: {
      fuente: "display",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#22D3EE",
      chipFondo: "#0E1130",
      scrim: { r: 11, g: 16, b: 38 },
      inclinacion: -1.5,
    },
  },
  {
    id: "estudio_spotlight",
    nombre: "Estudio spotlight",
    fondo: `Estudio fotográfico premium en penumbra: fondo carbón (#101012 arriba) a gris grafito (#26262B) hacia el piso, como un ciclorama infinito. Un spotlight cónico cálido cae desde arriba sobre el zorro, iluminando un círculo suave en el piso; partículas de polvo diminutas flotan visibles dentro del haz de luz. Sombra elíptica suave y marcada bajo el zorro. Todo fuera del haz queda en penumbra elegante. La franja superior es carbón casi negro, limpia y plana.`,
    paletaObjetos: `objetos flat con contorno negro grueso en naranja cálido, blanco marfil y verde de la marca; los objetos dentro del haz de luz se ven saturados, con leve borde de luz cálida`,
    detalles: [
      "un segundo haz de luz lateral tenue de color ámbar cruzando el fondo en diagonal",
      "un círculo de escenario (tarima baja redonda) bajo el zorro, estilo flat",
      "humo bajo muy sutil arrastrándose por el piso, apenas visible",
    ],
    titular: {
      fuente: "sans",
      modo: "limpio",
      colorTexto: "#FFFFFF",
      colorAcento: "#FB923C",
      scrim: { r: 14, g: 14, b: 16 },
      inclinacion: 0,
    },
  },
  {
    id: "aurora_gradiente",
    nombre: "Aurora gradiente",
    fondo: `Gradiente rico y moderno tipo aurora: violeta profundo (#31104F) en la franja superior, fundiéndose en magenta (#831843) al centro y naranja quemado (#7C2D12) cerca del piso, con GRANO fino de película sobre todo el fondo (textura sutil, no ruido fuerte). Dos formas orgánicas de "vidrio esmerilado" translúcido flotan detrás del zorro desenfocadas, captando el gradiente. Piso apenas más oscuro que el fondo con sombra suave bajo el zorro. La franja superior se mantiene en el violeta más profundo, limpia.`,
    paletaObjetos: `objetos flat con contorno negro grueso en amarillo dorado, magenta claro, blanco y el naranja del zorro`,
    detalles: [
      "estrellas diminutas dispersas solo en el tercio medio, como polvo brillante",
      "un arco delgado de luz dorada curvándose detrás del zorro como un halo gigante",
      "burbujas de vidrio pequeñas flotando a un costado, semitransparentes",
    ],
    titular: {
      fuente: "display",
      modo: "chips",
      colorTexto: "#2A0E3F",
      colorAcento: "#C026D3",
      chipFondo: "#FFFFFF",
      scrim: { r: 42, g: 14, b: 63 },
      inclinacion: -2,
    },
  },
  {
    id: "taller_papel",
    nombre: "Taller de papel",
    fondo: `Collage de papel recortado hecho a mano: fondo azul petróleo profundo (#082F49 arriba, #0C4A6E abajo) con textura de papel sutil. Capas de "papel recortado" en tonos petróleo más claros forman colinas u ondas superpuestas en el tercio inferior, cada capa con su sombra suave proyectada (efecto profundidad de diorama). Algunos trozos de cinta adhesiva decorativa (washi tape) en las esquinas de las capas. El zorro está "parado" sobre la capa frontal del diorama. La franja superior es papel azul petróleo oscuro, limpia.`,
    paletaObjetos: `objetos flat como recortes de papel con contorno negro grueso, en coral #FF6B4A, crema, amarillo mostaza y el verde de la marca, cada uno con sombrita de papel`,
    detalles: [
      "nubes de papel recortado con sombra flotando a un costado a media altura",
      "un sol de papel con rayos geométricos asomándose por un borde lateral",
      "pequeñas montañas de papel plegado al fondo del diorama",
    ],
    titular: {
      fuente: "sans",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#FFE08A",
      chipFondo: "#FF6B4A",
      scrim: { r: 6, g: 36, b: 58 },
      inclinacion: 1.5,
    },
  },
  {
    id: "blueprint_tech",
    nombre: "Blueprint técnico",
    fondo: `Plano técnico de ingeniería premium: fondo azul blueprint profundo (#101F46 arriba, #1E3A8A muy sutil abajo). Líneas técnicas blancas finas al 8% de opacidad: una cuadrícula de plano, círculos de compás, flechas de cota y trazos de esquema rodeando la zona media SIN saturar. Detrás del zorro, un "esquema técnico" abstracto dibujado en líneas blancas finas (como si el escenario estuviera siendo diseñado). Piso con línea de horizonte técnica y sombra elíptica bajo el zorro. Franja superior azul profundo plano, limpia.`,
    paletaObjetos: `objetos flat con contorno negro grueso en verde lima #A3E635, blanco, cian claro y el naranja del zorro; algunos objetos con esquinas "marcadas" con cruces técnicas`,
    detalles: [
      "un engranaje gigante delineado (solo contorno fino blanco) girado detrás de la escena",
      "reglas y escuadras delineadas flotando a un costado como marcas de agua",
      "una espiral de compás delineada en una esquina lateral media",
    ],
    titular: {
      fuente: "display",
      modo: "limpio",
      colorTexto: "#FFFFFF",
      colorAcento: "#A3E635",
      scrim: { r: 13, g: 25, b: 60 },
      inclinacion: 0,
    },
  },
  {
    id: "selva_digital",
    nombre: "Selva digital",
    fondo: `Jungla estilizada nocturna: gradiente de verde bosque casi negro (#04210F arriba) a verde profundo (#14532D) abajo. Hojas tropicales GRANDES estilo flat (monstera, palma) enmarcan las esquinas inferiores y un borde lateral, en verdes más claros con contorno oscuro, algunas por delante creando profundidad. Luciérnagas doradas como puntos de luz suaves dispersos en la zona media. Sombra suave bajo el zorro sobre un claro del suelo. La franja superior es verde casi negro, limpia y sin hojas.`,
    paletaObjetos: `objetos flat con contorno negro grueso en dorado #FBBF24, verde claro, blanco y el naranja del zorro, integrados como si estuvieran en el claro de la selva`,
    detalles: [
      "un rayo de luna verdosa cayendo en diagonal entre las hojas",
      "flores tropicales flat de color naranja asomando entre las hojas de un costado",
      "una liana con una hoja colgando desde un borde lateral, a media altura",
    ],
    titular: {
      fuente: "sans",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#FBBF24",
      chipFondo: "#06301B",
      scrim: { r: 4, g: 26, b: 12 },
      inclinacion: -1.5,
    },
  },
  {
    id: "pop_brutalista",
    nombre: "Pop brutalista",
    fondo: `Diseño gráfico pop brutalista de alto contraste: fondo dividido en bloques geométricos GRANDES y diagonales de negro humo (#0D0D0F) y naranja de marca (#E86A30), con un bloque blanco roto pequeño como acento. Patrón de semitono (puntos halftone) grande y visible dentro de UNO de los bloques. Formas geométricas gruesas (círculo, flecha maciza, zigzag) como elementos decorativos con contorno negro. El zorro se para sobre el borde de un bloque como si fuera una tarima. La franja superior cae dentro del bloque NEGRO, plana y limpia.`,
    paletaObjetos: `objetos flat con contorno negro extra grueso en blanco, negro y naranja SOLAMENTE (paleta restringida de 3 colores + el verde de la polera del zorro)`,
    detalles: [
      "una flecha maciza naranja apuntando hacia el zorro desde un costado",
      "un círculo de semitono gigante detrás del zorro como sol pop",
      "tres líneas de velocidad gruesas cruzando un bloque en diagonal",
    ],
    titular: {
      fuente: "display",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#FF7A29",
      chipFondo: "#111114",
      scrim: { r: 13, g: 13, b: 15 },
      inclinacion: -2.5,
    },
  },
  {
    id: "atardecer_retro",
    nombre: "Atardecer retro",
    fondo: `Atardecer retro-moderno suave: gradiente de púrpura profundo (#2B1147 arriba) a durazno (#F97362) en el horizonte bajo. Un sol grande estilizado con 3-4 bandas horizontales recortadas se hunde tras montañas en silueta minimalista púrpura oscuro. Nubes alargadas flat en rosa y naranja cruzan el cielo medio. El piso es una llanura en sombra púrpura con la sombra del zorro alargada hacia un costado por la luz del atardecer. La franja superior es púrpura profundo casi plano, limpia.`,
    paletaObjetos: `objetos flat con contorno negro grueso en rosa #FF8FB1, dorado #FFD166, blanco cálido y el naranja del zorro`,
    detalles: [
      "pájaros lejanos como pequeñas 'v' oscuras cruzando el cielo medio",
      "una franja de destello dorado horizontal justo sobre el horizonte",
      "palmeras o cactus en silueta minimalista en un borde lateral",
    ],
    titular: {
      fuente: "sans",
      modo: "limpio",
      colorTexto: "#FFF7ED",
      colorAcento: "#FFD166",
      scrim: { r: 43, g: 17, b: 71 },
      inclinacion: 0,
    },
  },
];

/* ==================== Selección con memoria FIFO ========================= */

const MEMORIA_DIRECCIONES = 5;
const ultimasDirecciones: string[] = [];

export function seleccionarDireccion(): DireccionArte {
  const disponibles = DIRECCIONES_PORTADA.filter(d => !ultimasDirecciones.includes(d.id));
  const candidatas = disponibles.length > 0 ? disponibles : DIRECCIONES_PORTADA;
  const elegida = candidatas[Math.floor(Math.random() * candidatas.length)]!;
  ultimasDirecciones.push(elegida.id);
  if (ultimasDirecciones.length > MEMORIA_DIRECCIONES) ultimasDirecciones.shift();
  return elegida;
}

export function elegirDetalle(dir: DireccionArte): string {
  return dir.detalles[Math.floor(Math.random() * dir.detalles.length)]!;
}

/* ==================== Prompt de ilustración compartido =================== */

export interface PortadaPreparada {
  direccion: DireccionArte;
  detalle: string;
  pose: PoseSeleccionada;
  prompt: string;
}

export function buildCoverIllustrationPrompt(
  tema: string,
  direccion: DireccionArte,
  detalle: string,
  pose: PoseSeleccionada,
  extraEstilo?: string | null,
): string {
  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores o gráficos abstractos, JAMÁS texto legible. Esta regla no tiene excepciones.

PERSONAJE - ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta/polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible
- El zorro debe ocupar al menos 40% del área visual inferior. Es el PROTAGONISTA, no un elemento secundario
- Debe verse IDÉNTICO al de la referencia en proporciones, estilo de dibujo y nivel de detalle
- El zorro DEBE mantener el estilo FLAT CARTOON de la referencia: líneas de contorno GRUESAS negras, colores PLANOS y sólidos (naranja puro, verde sólido), SIN degradados en el personaje, SIN texturas, SIN sombras realistas. El zorro es un cartoon simple y limpio
- POSE Y EXPRESIÓN OBLIGATORIA para esta imagen: ${pose.descripcion}

ESCENA A ILUSTRAR:
TEMA DEL VIDEO: "${tema}"
${extraEstilo ? `ESTILO ADICIONAL PEDIDO POR EL USUARIO: ${extraEstilo}\n` : ""}Construye una MINI-ESCENA con profundidad alrededor del zorro que cuente visualmente el tema: 2 a 4 objetos de apoyo RELEVANTES al tema (ni uno más), algunos ligeramente detrás del zorro y otros delante, agrupados hacia UN lado para dejar aire al otro lado. El zorro SIEMPRE anclado al piso con su sombra suave — nunca flotando. PROHIBIDO el collage de iconos y PROHIBIDO rodear al zorro de objetos por todos lados.
Los objetos deben ser ESPECÍFICOS de este tema, no genéricos: PROHIBIDO el kit cliché de marketing (cohete, embudo, carrito de compras, lupa, gráfico de barras genérico) salvo que el título los mencione literalmente. Pregúntate qué objetos reales saldrían en una foto editorial sobre este tema exacto y dibuja ESOS en flat cartoon, integrados a la escenografía de la dirección de arte.

ZONA SUPERIOR VACÍA (CRÍTICO - NO NEGOCIABLE):
- El 35% SUPERIOR de la imagen (de 0px a 670px desde arriba) debe ser ÚNICAMENTE el fondo de la dirección de arte en su versión más plana y oscura, SIN elementos
- NADA puede existir en esa zona: ni el zorro, ni objetos, ni sombras, ni líneas, ni bordes
- Toda la acción visual comienza DEBAJO del píxel 670

CONTRASTE DE ESTILOS (IMPORTANTE):
- El ZORRO y los OBJETOS se dibujan en estilo FLAT CARTOON: contornos gruesos negros, colores planos y vibrantes, sin degradados ni sombras realistas
- El FONDO es una dirección de arte trabajada y atmosférica (ver abajo), con profundidad, luz y textura
- Este contraste entre personaje cartoon sobre fondo cinematográfico es intencional: es la firma visual de la marca

DIRECCIÓN DE ARTE DEL FONDO — "${direccion.nombre}" (solo el fondo, NO el personaje):
${direccion.fondo}
DETALLE ÚNICO DE ESTA PORTADA: ${detalle}

PALETA DE OBJETOS DE APOYO:
${direccion.paletaObjetos}

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte de la imagen. El zorro debe verse EXACTAMENTE como en la referencia (flat cartoon), protagonista sobre un fondo "${direccion.nombre}" trabajado y con atmósfera.

${bloquePoseRequerida(pose)}`;
}

/** Selecciona dirección + detalle + pose y arma el prompt en una llamada. */
export function prepararPortada(tema: string, extraEstilo?: string | null): PortadaPreparada {
  const direccion = seleccionarDireccion();
  const detalle = elegirDetalle(direccion);
  const pose = seleccionarPosePortada(tema);
  const prompt = buildCoverIllustrationPrompt(tema, direccion, detalle, pose, extraEstilo);
  console.log(`[PORTADA] Dirección: ${direccion.id} · Pose: ${pose.id} (emoción: ${pose.emocion || "ninguna"})`);
  return { direccion, detalle, pose, prompt };
}

/* ==================== Generación Gemini (compartida) ===================== */

async function resolveAsset(...segments: string[]): Promise<string> {
  const candidates = [
    path.join(process.cwd(), ...segments),
    path.join(process.cwd(), "artifacts", "api-server", ...segments),
  ];
  for (const p of candidates) {
    try { await readFile(p); return p; } catch { /* siguiente candidato */ }
  }
  return candidates[0]!;
}

let _foxRefCache: string | null = null;
/** Imagen master del zorro Webi (flat cartoon) en base64, cacheada. */
export async function loadFoxReference(): Promise<string> {
  if (_foxRefCache) return _foxRefCache;
  const buf = await readFile(await resolveAsset("public", "fox-reference.png"));
  _foxRefCache = buf.toString("base64");
  return _foxRefCache;
}

function isRateLimitError(err: unknown): boolean {
  const msg = typeof (err as { message?: unknown })?.message === "string" ? (err as { message: string }).message : "";
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Resource exhausted") || msg.includes("rate limit");
}

/**
 * Detecta si un error de generación fue por saturación del servicio, para que
 * las rutas puedan responder 429 (tanto el error etiquetado con code del
 * pipeline compartido como el "RATE_LIMIT" legado de la rama gpt-image-1).
 */
export function esErrorRateLimit(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === "RATE_LIMIT" || e?.message === "RATE_LIMIT" || isRateLimitError(err);
}

const MAX_RETRIES = 4;
const RETRY_DELAYS = [5000, 15000, 30000];

/** Genera la ilustración del zorro (sin texto) con reintentos y referencia master. */
export async function generateFoxIllustration(prompt: string, refImageBase64?: string): Promise<Buffer> {
  const refBase64 = refImageBase64 ?? (await loadFoxReference());

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[CoverGen] Generando ilustración (intento ${attempt}/${MAX_RETRIES})...`);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { data: refBase64, mimeType: "image/png" } },
              { text: prompt },
            ],
          },
        ],
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });

      const inline = firstInlineData(response.candidates?.[0]?.content?.parts);
      if (!inline?.data) throw new Error("Gemini no devolvió imagen en este intento");
      return Buffer.from(inline.data, "base64");
    } catch (err) {
      const rateLimited = isRateLimitError(err);
      console.warn(`[CoverGen] Intento ${attempt} falló (rate_limit=${rateLimited}): ${(err as Error).message}`);
      if (attempt < MAX_RETRIES) {
        const delay = rateLimited
          ? RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]!
          : 2000 * attempt;
        await new Promise(r => setTimeout(r, delay));
      } else if (rateLimited) {
        throw Object.assign(
          new Error("El servicio de IA está saturado. Espera 1-2 minutos e intenta de nuevo."),
          { code: "RATE_LIMIT" },
        );
      } else {
        throw new Error("No se pudo generar la imagen después de varios intentos. Intenta de nuevo.");
      }
    }
  }
  throw new Error("No se pudo generar la imagen");
}

/* ==================== Titular: acentos y overlay SVG ===================== */

const PALABRAS_CLAVE = new Set([
  "error", "errores", "secreto", "secretos", "gratis", "nunca", "siempre",
  "clave", "claves", "truco", "trucos", "ia", "web", "ventas", "venta",
  "exito", "éxito", "facil", "fácil", "rapido", "rápido", "peligro",
  "millon", "millón", "millones", "dinero", "plata", "cliente", "clientes",
  "hoy", "ya", "ahora", "prohibido", "urgente", "verdad", "mentira",
  "mentiras", "gigante", "mejor", "peor", "todo", "nada", "nadie",
]);

function normalizar(w: string): string {
  return w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Elige hasta 2 palabras del título para destacar en color de acento.
 * Prioridad: números > palabras "gatillo" > la palabra más larga (≥5).
 */
export function elegirPalabrasAcento(lines: string[]): Set<string> {
  type Cand = { word: string; score: number };
  const cands: Cand[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const raw of line.split(/\s+/)) {
      const word = raw.trim();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      const limpio = normalizar(word.replace(/[^\p{L}\p{N}]/gu, ""));
      if (!limpio) continue;
      if (/\d/.test(word)) cands.push({ word, score: 3 });
      else if (PALABRAS_CLAVE.has(limpio) || PALABRAS_CLAVE.has(normalizar(word))) cands.push({ word, score: 2 });
      else if (limpio.length >= 5) cands.push({ word, score: 1 + limpio.length / 100 });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return new Set(cands.slice(0, 2).map(c => c.word));
}

export function splitTextIntoLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxCharsPerLine) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface FuenteCfg {
  familia: string;
  peso: number;
  /** Ancho aproximado de un carácter en mayúsculas relativo al font-size. */
  ratio: number;
  lineHeight: number;
  /** Tamaños base por cantidad de líneas [1-2, 3, 4]. */
  sizes: [number, number, number];
}

const FUENTES: Record<EstiloTitular["fuente"], FuenteCfg> = {
  display: {
    familia: "'Oswald','Montserrat','DejaVu Sans',sans-serif",
    peso: 700,
    ratio: 0.52,
    lineHeight: 1.08,
    sizes: [150, 128, 108],
  },
  sans: {
    familia: "'Montserrat','DejaVu Sans',sans-serif",
    peso: 900,
    ratio: 0.72,
    lineHeight: 1.14,
    sizes: [108, 92, 78],
  },
};

function renderLineaTspans(line: string, acentos: Set<string>, colorBase: string, colorAcento: string): string {
  return line
    .split(/\s+/)
    .map((w, i) => {
      const fill = acentos.has(w) ? colorAcento : colorBase;
      const esc = escapeXml(w);
      // &#160; (espacio no separable) entre palabras: librsvg recorta los
      // espacios normales en los bordes de cada tspan y el titular quedaría
      // con las palabras pegadas ("3ERRORESQUE").
      return `${i > 0 ? "&#160;" : ""}<tspan fill="${fill}">${esc}</tspan>`;
    })
    .join("");
}

/**
 * Overlay del titular: scrim degradado (nunca franja sólida) + texto por
 * dirección de arte (chips o limpio, con palabras de acento y leve
 * inclinación). Devuelve el SVG listo para componer con Sharp.
 */
export function buildTitleOverlaySvg(title: string, dir: DireccionArte): Buffer {
  const estilo = dir.titular;
  const fuente = FUENTES[estilo.fuente];

  const cleanTitle = title.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const lines = splitTextIntoLines(cleanTitle, 16).slice(0, 4);
  const lineCount = lines.length;
  const acentos = elegirPalabrasAcento(lines);

  let fontSize = lineCount <= 2 ? fuente.sizes[0] : lineCount === 3 ? fuente.sizes[1] : fuente.sizes[2];
  const maxTextWidth = COVER_WIDTH - TEXT_SIDE_PADDING * 2 - (estilo.modo === "chips" ? 70 : 0);
  const maxLineChars = Math.max(...lines.map(l => l.length));
  const estWidth = maxLineChars * fontSize * fuente.ratio;
  if (estWidth > maxTextWidth) fontSize = Math.floor(fontSize * (maxTextWidth / estWidth));

  const lineHeight = fontSize * fuente.lineHeight;
  const chipPadX = fontSize * 0.34;
  const chipH = lineHeight * (estilo.modo === "chips" ? 1.04 : 1);
  const totalH = lineCount * chipH + (estilo.modo === "chips" ? (lineCount - 1) * 10 : 0);
  const blockTop = totalH <= TEXT_ZONE_HEIGHT
    ? TEXT_ZONE_TOP + (TEXT_ZONE_HEIGHT - totalH) / 2
    : TEXT_ZONE_TOP;
  const blockCenterY = blockTop + totalH / 2;

  const piezas: string[] = [];
  lines.forEach((line, i) => {
    const lineTop = blockTop + i * (chipH + (estilo.modo === "chips" ? 10 : 0));
    const baseline = lineTop + chipH / 2 + fontSize * 0.34;
    const tspans = renderLineaTspans(line, acentos, estilo.colorTexto, estilo.colorAcento);

    if (estilo.modo === "chips") {
      const w = Math.min(line.length * fontSize * fuente.ratio + chipPadX * 2, COVER_WIDTH - 40);
      const offsetX = i % 2 === 0 ? -12 : 12;
      const x = (COVER_WIDTH - w) / 2 + offsetX;
      piezas.push(
        `<rect x="${x.toFixed(1)}" y="${lineTop.toFixed(1)}" width="${w.toFixed(1)}" height="${chipH.toFixed(1)}" rx="${(fontSize * 0.2).toFixed(1)}" fill="${estilo.chipFondo}"/>`,
        `<text x="${(COVER_WIDTH / 2 + offsetX).toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="middle" font-family="${fuente.familia}" font-weight="${fuente.peso}" font-size="${fontSize}" letter-spacing="1">${tspans}</text>`,
      );
    } else {
      const sombra = Math.max(4, Math.round(fontSize * 0.045));
      // La sombra usa la MISMA estructura de tspans que el texto principal:
      // si fuera texto plano tendría otro ancho y asomaría por los costados.
      const tspansSombra = renderLineaTspans(line, acentos, "rgba(0,0,0,0.5)", "rgba(0,0,0,0.5)");
      piezas.push(
        `<text x="${COVER_WIDTH / 2 + sombra}" y="${(baseline + sombra).toFixed(1)}" text-anchor="middle" font-family="${fuente.familia}" font-weight="${fuente.peso}" font-size="${fontSize}" letter-spacing="1" fill="rgba(0,0,0,0.5)">${tspansSombra}</text>`,
        `<text x="${COVER_WIDTH / 2}" y="${baseline.toFixed(1)}" text-anchor="middle" font-family="${fuente.familia}" font-weight="${fuente.peso}" font-size="${fontSize}" letter-spacing="1">${tspans}</text>`,
      );
    }
  });

  const { r, g, b } = estilo.scrim;
  const scrimBottom = Math.max(640, blockTop + totalH + 120);

  const svg = `<svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgb(${r},${g},${b})" stop-opacity="0.94"/>
      <stop offset="0.6" stop-color="rgb(${r},${g},${b})" stop-opacity="0.82"/>
      <stop offset="1" stop-color="rgb(${r},${g},${b})" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${COVER_WIDTH}" height="${scrimBottom}" fill="url(#scrim)"/>
  <g transform="rotate(${estilo.inclinacion}, ${COVER_WIDTH / 2}, ${blockCenterY.toFixed(1)})">
    ${piezas.join("\n    ")}
  </g>
</svg>`;

  return Buffer.from(svg);
}

/* ==================== Composición final ================================== */

/** Redimensiona la ilustración a 1080x1920 y compone scrim + titular encima. */
export async function composeVerticalCover(
  illustration: Buffer,
  title: string,
  dir: DireccionArte,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const overlay = buildTitleOverlaySvg(title, dir);

  const finalImage = await sharp(illustration)
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  console.log(`[CoverGen] Titular "${dir.nombre}" compuesto (${(finalImage.length / 1024).toFixed(0)}KB)`);
  return finalImage;
}
