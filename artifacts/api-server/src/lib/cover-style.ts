// Sistema de dirección de arte para portadas verticales (TikTok / 9:16).
//
// Identidad visual aprobada por el usuario: ESTUDIO SPOTLIGHT — el zorro Webi
// (flat cartoon, referencia master) parado en un estudio fotográfico en
// penumbra, bajo un foco de luz. Cada portada combina:
//   · una VARIANTE de iluminación del estudio (color/posición de la luz,
//     paleta y tipografía propias), con memoria FIFO anti-repetición,
//   · un detalle escenográfico aleatorio dentro de la variante,
//   · una pose del banco de poses (pose-bank),
//   · UTILERÍA REAL del set — props físicos apoyados e iluminados por el
//     foco, JAMÁS stickers/iconos flotantes — que cuenta el tema del video,
//   · palabras del título destacadas en color de acento.

import { readFile } from "fs/promises";
import path from "path";
import { ai } from "@workspace/integrations-gemini-ai";
import { firstInlineData } from "./gemini-parts";
import {
  seleccionarPosePortada,
  bloquePoseRequerida,
  PORTADA_POSES,
  detectarEmocion,
  type PoseSeleccionada,
} from "./pose-bank";

export const COVER_WIDTH = 1080;
export const COVER_HEIGHT = 1920;
const TEXT_ZONE_TOP = 150;
const TEXT_ZONE_HEIGHT = 280;
const TEXT_SIDE_PADDING = 60;

/* ========================= Tipos ========================================= */

export interface EstiloTitular {
  /** "display" = Oswald Bold (condensada, alto impacto) · "sans" = Montserrat Black. */
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
  /** Descripción corta para la UI de selección de variantes. */
  descripcionUi: string;
  /** Bloque de prompt que describe el fondo/atmósfera (NO el personaje). */
  fondo: string;
  /** Paleta de la utilería y cómo se comporta bajo la luz de esta variante. */
  paletaObjetos: string;
  /** Detalles escenográficos: se elige 1 al azar para que cada portada sea única. */
  detalles: string[];
  titular: EstiloTitular;
}

/* ==================== Banco de direcciones de arte ======================= */

export const DIRECCIONES_PORTADA: DireccionArte[] = [
  {
    id: "estudio_spotlight",
    nombre: "Estudio spotlight ámbar",
    descripcionUi: "El clásico aprobado: foco cálido ámbar con partículas de polvo.",
    fondo: `Estudio fotográfico premium en penumbra: fondo carbón (#101012 arriba) a gris grafito (#26262B) hacia el piso, como un ciclorama infinito. Un spotlight cónico cálido cae desde arriba sobre el zorro, iluminando un círculo suave en el piso; partículas de polvo diminutas flotan visibles dentro del haz de luz. Sombra elíptica suave y marcada bajo el zorro. Todo fuera del haz queda en penumbra elegante. La franja superior es carbón casi negro, limpia y plana.`,
    paletaObjetos: `utilería en tonos cálidos: naranja, madera clara, blanco marfil y el verde de la marca; los props dentro del haz se ven cálidos y saturados, los que quedan al borde del círculo de luz caen en penumbra`,
    detalles: [
      "un segundo haz de luz lateral tenue de color ámbar cruzando el fondo en diagonal",
      "una tarima circular baja de escenario bajo el zorro, iluminada por el foco",
      "humo bajo muy sutil arrastrándose por el piso, apenas visible dentro del haz",
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
    id: "estudio_medianoche",
    nombre: "Estudio medianoche",
    descripcionUi: "Luz fría azul de medianoche, ambiente sereno y tecnológico.",
    fondo: `Estudio fotográfico en penumbra azul noche: ciclorama infinito de azul carbón (#0A0F1E arriba) a azul grafito (#182136) hacia el piso. Un spotlight cónico de luz FRÍA azul hielo cae desde arriba sobre el zorro, dibujando un círculo de luz fría en el piso; un rim light cian muy sutil recorta la silueta del zorro. Fuera del haz, penumbra azulada elegante. Sombra elíptica nítida bajo el zorro. La franja superior es azul casi negro, plana y limpia.`,
    paletaObjetos: `utilería en azules fríos, plateado, blanco y el naranja del zorro como único acento cálido; los props toman la luz fría del haz con brillos suaves de lado`,
    detalles: [
      "un telón de fondo azul noche con pliegues suaves apenas insinuados en la penumbra",
      "un segundo haz cian rasante entrando desde un costado a la altura del piso",
      "un reflejo frío apenas perceptible del zorro sobre el piso pulido",
    ],
    titular: {
      fuente: "display",
      modo: "limpio",
      colorTexto: "#FFFFFF",
      colorAcento: "#38BDF8",
      scrim: { r: 10, g: 15, b: 30 },
      inclinacion: 0,
    },
  },
  {
    id: "estudio_esmeralda",
    nombre: "Estudio esmeralda",
    descripcionUi: "Luz verde esmeralda, fresca y con el color de la marca.",
    fondo: `Estudio fotográfico en penumbra verde profundo: ciclorama de verde casi negro (#06120D arriba) a verde bosque oscuro (#123227) hacia el piso. Un spotlight cónico verde esmeralda suave cae desde arriba sobre el zorro con partículas finas flotando en el haz. Una neblina baja muy tenue se arrastra por el piso alrededor del círculo de luz. Sombra elíptica suave bajo el zorro. Fuera del haz, penumbra verdosa elegante. La franja superior es verde casi negro, plana y limpia.`,
    paletaObjetos: `utilería en verdes profundos, dorado apagado, crema y el naranja del zorro; los props dentro del haz toman un matiz esmeralda suave en su cara iluminada`,
    detalles: [
      "una cortina de terciopelo verde oscuro asomando con su caída por un borde lateral",
      "una tarima circular baja bajo el zorro, con el canto apenas iluminado",
      "motas de polvo doradas visibles solo dentro del haz de luz",
    ],
    titular: {
      fuente: "sans",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#6EE7B7",
      chipFondo: "#0B2E20",
      scrim: { r: 5, g: 18, b: 13 },
      inclinacion: -1.5,
    },
  },
  {
    id: "estudio_purpura",
    nombre: "Estudio púrpura",
    descripcionUi: "Luz violeta, moderna y creativa.",
    fondo: `Estudio fotográfico en penumbra púrpura: ciclorama de púrpura casi negro (#120A1E arriba) a violeta profundo (#251540) hacia el piso. Un spotlight cónico violeta suave cae desde arriba sobre el zorro; partículas brillantes diminutas flotan SOLO dentro del haz. Un segundo haz magenta muy tenue cruza el fondo en diagonal sin tocar al zorro. Sombra elíptica marcada bajo el zorro. Fuera de los haces, penumbra púrpura elegante. La franja superior es púrpura casi negro, plana y limpia.`,
    paletaObjetos: `utilería en violetas profundos, magenta apagado, plata y el naranja del zorro; la cara iluminada de cada prop toma el matiz violeta del haz`,
    detalles: [
      "un telón púrpura profundo con caída suave insinuado al fondo en penumbra",
      "un aro de luz tenue dibujado en el piso alrededor del círculo del foco",
      "una siluetas de focos de estudio con trípode en penumbra a un costado del fondo",
    ],
    titular: {
      fuente: "display",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#E879F9",
      chipFondo: "#1C1030",
      scrim: { r: 16, g: 10, b: 28 },
      inclinacion: -2,
    },
  },
  {
    id: "estudio_carmesi",
    nombre: "Estudio carmesí",
    descripcionUi: "Luz roja dramática, para temas de urgencia o impacto.",
    fondo: `Estudio fotográfico en penumbra dramática: ciclorama de negro humo (#0C0A0A arriba) a granate muy oscuro (#221114) hacia el piso. Un spotlight cónico de luz roja cálida cae desde arriba sobre el zorro, con humo fino y elegante atravesando el haz. El círculo de luz en el piso es rojizo y suave. Sombra elíptica intensa bajo el zorro. Fuera del haz, penumbra casi negra. La franja superior es negro humo, plana y limpia.`,
    paletaObjetos: `utilería en rojos profundos, negro, gris humo y el naranja del zorro; la cara iluminada de cada prop se tiñe del rojo cálido del foco y la opuesta cae en penumbra`,
    detalles: [
      "volutas de humo fino cruzando el haz a media altura, apenas visibles",
      "un telón carmesí muy oscuro con pliegues insinuados al fondo",
      "un borde de luz roja rasante recortando el piso desde un costado",
    ],
    titular: {
      fuente: "sans",
      modo: "limpio",
      colorTexto: "#FFFFFF",
      colorAcento: "#F87171",
      scrim: { r: 14, g: 9, b: 10 },
      inclinacion: 0,
    },
  },
  {
    id: "estudio_dorado",
    nombre: "Estudio dorado lateral",
    descripcionUi: "Luz dorada lateral con sombras largas, look editorial.",
    fondo: `Estudio fotográfico en penumbra con luz LATERAL dorada: ciclorama de carbón (#111013 arriba) a bronce muy oscuro (#241A0E) hacia el piso. Un haz dorado cálido entra desde UN COSTADO a media altura (no desde arriba), iluminando al zorro de lado: una mitad cálida y brillante, la otra en penumbra suave. La sombra del zorro se proyecta ALARGADA hacia el lado opuesto de la luz. Motas de polvo flotan visibles dentro del haz lateral. La franja superior es carbón casi negro, plana y limpia.`,
    paletaObjetos: `utilería en dorados, madera oscura, crema y el naranja del zorro; cada prop con su mitad hacia la luz dorada encendida y la otra mitad en penumbra, sombras alargadas como la del zorro`,
    detalles: [
      "un panel softbox de estudio en silueta al fondo, apenas visible en penumbra",
      "una franja de luz dorada barriendo el piso en diagonal desde el costado iluminado",
      "polvo dorado suspendido denso solo dentro del haz lateral",
    ],
    titular: {
      fuente: "display",
      modo: "limpio",
      colorTexto: "#FFF8E7",
      colorAcento: "#FBBF24",
      scrim: { r: 18, g: 14, b: 8 },
      inclinacion: 0,
    },
  },
  {
    id: "estudio_contraluz",
    nombre: "Estudio contraluz",
    descripcionUi: "Contraluz naranja: silueta con borde de luz encendido.",
    fondo: `Estudio fotográfico con contraluz cálido: ciclorama de carbón oscuro (#0E0C0B arriba) a marrón humo (#1E1510) hacia el piso. Un resplandor naranja cálido difuso brilla DETRÁS del zorro a la altura del piso (como un foco apuntando hacia la cámara desde atrás, oculto por el personaje), creando un rim light naranja marcado en todo su contorno. Una luz de relleno frontal suave mantiene visibles los colores del zorro. Halo de luz difusa alrededor de su silueta. Sombra proyectada hacia adelante. La franja superior es carbón casi negro, plana y limpia.`,
    paletaObjetos: `utilería en marrones cálidos, ámbar, crema y el naranja del zorro; los props cercanos al resplandor se recortan a contraluz con su propio borde de luz naranja`,
    detalles: [
      "siluetas de dos focos de estudio con trípode en penumbra a los costados del fondo",
      "un destello de lente sutil y elegante justo en el borde del hombro del zorro",
      "neblina fina retroiluminada de naranja flotando a la altura del piso",
    ],
    titular: {
      fuente: "sans",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#FDBA74",
      chipFondo: "#1A120C",
      scrim: { r: 16, g: 11, b: 7 },
      inclinacion: 1.5,
    },
  },
  {
    id: "estudio_duotono",
    nombre: "Estudio duotono cine",
    descripcionUi: "Doble luz de cine: ámbar y azul cruzados.",
    fondo: `Estudio fotográfico con iluminación cruzada de cine: ciclorama de grafito oscuro (#121116 arriba a #1C1B22 abajo). Dos luces cruzadas bañan la escena: un haz ÁMBAR cálido desde un costado y un haz AZUL frío desde el costado opuesto, tiñendo cada mitad del ciclorama con su temperatura. El zorro recibe un doble rim light sutil (borde cálido de un lado, frío del otro) manteniendo sus colores planos reconocibles. Dos sombras suaves cruzadas bajo el zorro. Neblina muy fina revela ambos haces. La franja superior es grafito casi negro, plana y limpia.`,
    paletaObjetos: `utilería en neutros (gris, negro mate, blanco) más el naranja del zorro; cada prop toma ámbar por un lado y azul por el otro, igual que el personaje`,
    detalles: [
      "un piso grafito con doble reflejo tenue (cálido y frío) bajo el zorro",
      "los dos haces visibles como conos de luz cruzados gracias a la neblina fina",
      "un taburete de estudio de madera en penumbra al borde de la escena",
    ],
    titular: {
      fuente: "display",
      modo: "chips",
      colorTexto: "#FFFFFF",
      colorAcento: "#F59E0B",
      chipFondo: "#141318",
      scrim: { r: 12, g: 12, b: 16 },
      inclinacion: -1.5,
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
  utileria?: string | null,
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
${extraEstilo ? `ESTILO ADICIONAL PEDIDO POR EL USUARIO: ${extraEstilo}\n` : ""}Construye una MINI-ESCENA DE SET FOTOGRÁFICO alrededor del zorro que cuente visualmente el tema: 2 a 4 piezas de UTILERÍA relevantes al tema (ni una más), algunas ligeramente detrás del zorro y otras delante, agrupadas hacia UN lado para dejar aire al otro lado. El zorro SIEMPRE anclado al piso con su sombra suave — nunca flotando.

UTILERÍA REAL, NO STICKERS (CRÍTICO - NO NEGOCIABLE):
- Cada objeto es un PROP FÍSICO del set: tiene volumen, materiales creíbles (cartón, madera, metal, tela, vidrio, plástico) y está APOYADO en el piso del estudio o sobre otro objeto — NUNCA flotando en el aire
- Cada objeto recibe la MISMA luz de la escena: cara iluminada hacia el foco, cara opuesta en penumbra, y proyecta su sombra sobre el piso en la MISMA dirección que la sombra del zorro
- Escala natural respecto al zorro: una caja es una caja real, un notebook es de tamaño real, nada de miniaturas ni gigantes decorativos
- Los objetos alejados del haz de luz quedan parcialmente en penumbra, fundidos con la atmósfera del estudio
- PROHIBIDO: objetos estilo sticker/pegatina/icono plano, contornos gruesos negros alrededor de los objetos, objetos flotantes, glow o borde de recorte, collage de iconos, rodear al zorro de objetos por todos lados
- PROHIBIDO TAMBIÉN: símbolos abstractos dibujados en el aire — signos de interrogación o exclamación, flechas, gráficos, corazones, monedas o estrellas flotantes. Si necesitas comunicar una idea abstracta, ponla DENTRO de un objeto físico del set: una pizarra o letrero apoyado con el símbolo impreso, una pantalla encendida mostrando el gráfico, una caja de cartón con el símbolo estampado en su cara
La utilería debe ser ESPECÍFICA de este tema, no genérica: PROHIBIDO el kit cliché de marketing (cohete, embudo, carrito de compras, lupa, gráfico de barras) — y si el título menciona uno de estos literalmente, se dibuja como objeto FÍSICO real del set (un carrito de supermercado de metal de tamaño real parado en el piso, por ejemplo), jamás como icono. Pregúntate qué utilería pondría un director de arte en una foto editorial sobre este tema exacto y pon ESA en el set.
${utileria ? `
UTILERÍA PEDIDA POR EL USUARIO (OBLIGATORIA): ${utileria}
Dibuja EXACTAMENTE esa utilería como los props protagonistas del set — mismas reglas físicas de arriba: apoyada, con volumen, iluminada por el foco y con sombras coherentes — sin agregar otros objetos protagonistas por tu cuenta.
` : ""}
ZONA SUPERIOR VACÍA (CRÍTICO - NO NEGOCIABLE):
- El 35% SUPERIOR de la imagen (de 0px a 670px desde arriba) debe ser ÚNICAMENTE el fondo de la dirección de arte en su versión más plana y oscura, SIN elementos
- NADA puede existir en esa zona: ni el zorro, ni objetos, ni sombras, ni líneas, ni bordes
- Toda la acción visual comienza DEBAJO del píxel 670

CONTRASTE DE ESTILOS (IMPORTANTE):
- SOLO el ZORRO se dibuja en estilo FLAT CARTOON: contornos gruesos negros, colores planos y vibrantes, sin degradados
- El FONDO y la UTILERÍA pertenecen al mundo del set: iluminación cinematográfica, volumen y sombreado suave, SIN contornos gruesos de cartoon en los objetos
- Este contraste — la mascota cartoon parada dentro de un set fotográfico estilizado con props reales — es la firma visual de la marca

DIRECCIÓN DE ARTE DEL FONDO — "${direccion.nombre}" (solo el fondo, NO el personaje):
${direccion.fondo}
DETALLE ÚNICO DE ESTA PORTADA: ${detalle}

UTILERÍA — PALETA Y COMPORTAMIENTO BAJO LA LUZ:
${direccion.paletaObjetos}

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte de la imagen. El zorro debe verse EXACTAMENTE como en la referencia (flat cartoon), protagonista sobre un fondo "${direccion.nombre}" trabajado y con atmósfera.

${bloquePoseRequerida(pose)}`;
}

/** Opciones de personalización manual: cada campo fija UN punto del prompt. */
export interface OpcionesPortada {
  /** Fija la variante de iluminación del estudio (id de DIRECCIONES_PORTADA). */
  direccionId?: string | null;
  /** Fija la pose del zorro (id del banco de poses). */
  poseId?: string | null;
  /** Utilería pedida por el usuario: se dibuja como props físicos del set. */
  utileria?: string | null;
}

/** Direcciones y poses disponibles, en formato listo para una UI de selección. */
export function listarOpcionesPortada() {
  return {
    direcciones: DIRECCIONES_PORTADA.map(d => ({
      id: d.id,
      nombre: d.nombre,
      descripcion: d.descripcionUi,
      colorAcento: d.titular.colorAcento,
    })),
    poses: PORTADA_POSES.map(p => ({ id: p.id, etiqueta: p.etiqueta })),
  };
}

/** Selecciona dirección + detalle + pose y arma el prompt en una llamada.
 *  `opciones` fija manualmente dirección, pose y/o utilería; lo no fijado
 *  sigue el comportamiento automático con rotación anti-repetición. */
export function prepararPortada(tema: string, extraEstilo?: string | null, opciones?: OpcionesPortada | null): PortadaPreparada {
  const fijada = opciones?.direccionId
    ? DIRECCIONES_PORTADA.find(d => d.id === opciones.direccionId)
    : undefined;
  let direccion: DireccionArte;
  if (fijada) {
    direccion = fijada;
    // Registrar en la memoria FIFO para que la rotación automática no la repita enseguida.
    ultimasDirecciones.push(fijada.id);
    if (ultimasDirecciones.length > MEMORIA_DIRECCIONES) ultimasDirecciones.shift();
  } else {
    direccion = seleccionarDireccion();
  }

  const detalle = elegirDetalle(direccion);

  const poseFija = opciones?.poseId
    ? PORTADA_POSES.find(p => p.id === opciones.poseId)
    : undefined;
  const pose: PoseSeleccionada = poseFija
    ? { id: poseFija.id, descripcion: poseFija.descripcion, emocion: detectarEmocion(tema) }
    : seleccionarPosePortada(tema);

  // Normalizar entradas de texto libre (clientes no-UI pueden mandar solo espacios).
  const utileria = opciones?.utileria?.trim() || null;
  const estilo = extraEstilo?.trim() || null;
  const prompt = buildCoverIllustrationPrompt(tema, direccion, detalle, pose, estilo, utileria);
  console.log(`[PORTADA] Dirección: ${direccion.id}${fijada ? " (fijada)" : ""} · Pose: ${pose.id}${poseFija ? " (fijada)" : ""} (emoción: ${pose.emocion || "ninguna"})${utileria ? " · Utilería personalizada" : ""}`);
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
