// Miniaturas de YouTube (16:9): mismo universo "Estudio Spotlight" de la marca
// pero en encuadre HORIZONTAL y con protagonista distinto — la PERSONA REAL de
// una foto (estilo youtuber: rostro idéntico, expresión de alta energía) o el
// zorro Webi si no hay foto. El titular lo compone el servidor en la franja
// izquierda, que el prompt exige dejar despejada y oscura.

import {
  resolverDireccion,
  elegirDetalle,
  elegirPalabrasAcento,
  splitTextIntoLines,
  renderLineaTspans,
  FUENTES,
  type DireccionArte,
} from "./cover-style.js";
import {
  seleccionarPosePortada,
  bloquePoseRequerida,
  detectarEmocion,
  type PoseSeleccionada,
} from "./pose-bank.js";

export const YT_WIDTH = 1280;
export const YT_HEIGHT = 720;
/** Franja izquierda reservada para el titular (el prompt la exige despejada). */
const YT_TEXT_ZONE_WIDTH = 560;
const YT_TEXT_LEFT = 72;

/* ==================== Expresión youtuber según el tema =================== */

/** Traduce la emoción detectada del tema a una expresión facial/corporal de
 *  youtuber para la persona real de la miniatura. */
export function expresionYoutuber(tema: string): string {
  switch (detectarEmocion(tema)) {
    case "pregunta":
      return "ceja alzada y gesto exagerado de duda, palmas medio abiertas hacia arriba";
    case "problema":
      return "mueca de preocupación exagerada, manos hacia la cabeza en gesto de '¿qué hice?'";
    case "revelacion":
      return "boca abierta de asombro total, cejas arriba, una mano señalando la utilería";
    case "confianza":
      return "sonrisa segura mirando directo a cámara, brazos cruzados o pulgar arriba";
    case "celebracion":
      return "sonrisa enorme de celebración, puño en alto o brazos abiertos de triunfo";
    case "educativo":
      return "expresión entusiasta apuntando con el dedo índice hacia la utilería del set";
    case "alerta":
      return "ojos muy abiertos en alerta, palma extendida hacia la cámara como diciendo '¡espera!'";
    default:
      return "expresión youtuber de alta energía: sonrisa grande, mirada a cámara y un gesto expresivo con las manos";
  }
}

/* ==================== Prompt de la miniatura ============================== */

export interface OpcionesMiniaturaYoutube {
  /** Fija la variante de iluminación del estudio (id de DIRECCIONES_PORTADA). */
  direccionId?: string | null;
  /** Utilería pedida por el usuario: props físicos del set. */
  utileria?: string | null;
  /** true si la miniatura lleva la foto de una persona real como protagonista. */
  conPersona: boolean;
}

export function buildYoutubeThumbnailPrompt(
  tema: string,
  direccion: DireccionArte,
  detalle: string,
  opts: {
    conPersona: boolean;
    pose?: PoseSeleccionada | null;
    extraEstilo?: string | null;
    utileria?: string | null;
  },
): string {
  const bloqueProtagonista = opts.conPersona
    ? `PROTAGONISTA - LA PERSONA REAL DE LA FOTO ADJUNTA (CRÍTICO - NO NEGOCIABLE):
- Integra a la persona de la foto adjunta como protagonista ABSOLUTO de la miniatura, recortada de su fondo original (nada del fondo de la foto debe aparecer)
- Su ROSTRO debe quedar IDÉNTICO al de la foto: mismos rasgos, misma piel, mismo peinado, mismos lentes o accesorios si los tiene. FOTORREALISTA — PROHIBIDO convertirla en cartoon, ilustración o pintura
- Encuádrala de la cintura hacia arriba, GRANDE, ocupando aproximadamente la mitad DERECHA del encuadre y llegando casi hasta el borde superior, como los youtubers en sus miniaturas
- EXPRESIÓN OBLIGATORIA de youtuber para esta miniatura: ${expresionYoutuber(tema)}
- La luz del estudio la ilumina igual que al resto del set: cara hacia el foco y un borde de luz (rim light) del color de la variante recortando su silueta`
    : `PROTAGONISTA - ZORRO WEBI ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta verde oscuro, IDÉNTICO a la referencia en proporciones, estilo de dibujo y nivel de detalle
- Mantiene el estilo FLAT CARTOON de la referencia: contornos gruesos negros, colores PLANOS y sólidos, SIN degradados, SIN texturas, SIN sombras realistas en el personaje
- De cuerpo completo (cabeza, torso, brazos, piernas, cola), GRANDE, ocupando aproximadamente la mitad DERECHA del encuadre
- POSE Y EXPRESIÓN OBLIGATORIA para esta imagen: ${opts.pose?.descripcion ?? "pose expresiva y segura acorde al tema"}`;

  return `Genera una MINIATURA DE YOUTUBE HORIZONTAL en formato 16:9 (lienzo apaisado, más ancho que alto).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores, JAMÁS texto legible. Esta regla no tiene excepciones.

${bloqueProtagonista}

COMPOSICIÓN HORIZONTAL DE MINIATURA (CRÍTICO - NO NEGOCIABLE):
- MITAD DERECHA del encuadre: el protagonista, anclado al piso del estudio con su sombra coherente
- CENTRO (entre el protagonista y la franja izquierda): 2 a 3 piezas de UTILERÍA física del tema, apoyadas en el piso del set o sobre una mesa baja, a escala real
- FRANJA IZQUIERDA (el 40% izquierdo del encuadre): SOLO el fondo de la dirección de arte en su versión más plana y OSCURA, totalmente DESPEJADA — ahí se montará el titular después. NADA puede existir en esa franja: ni objetos, ni brazos, ni haces protagonistas, ni sombras marcadas.

TEMA DEL VIDEO: "${tema}"
${opts.extraEstilo ? `ESTILO ADICIONAL PEDIDO POR EL USUARIO: ${opts.extraEstilo}\n` : ""}
UTILERÍA REAL, NO STICKERS (CRÍTICO - NO NEGOCIABLE):
- Cada objeto es un PROP FÍSICO del set: volumen, materiales creíbles, APOYADO en el piso o sobre otro objeto — NUNCA flotando
- Cada objeto recibe la MISMA luz de la escena y proyecta sombra en la misma dirección que la del protagonista
- PROHIBIDO: objetos estilo sticker/icono plano, contornos de recorte, objetos flotantes, collage de iconos
- PROHIBIDO TAMBIÉN: símbolos abstractos dibujados en el aire (flechas, signos, corazones, monedas, estrellas). Una idea abstracta va DENTRO de un objeto físico: una pizarra apoyada, una pantalla encendida, una caja estampada
- Utilería ESPECÍFICA de este tema, no genérica: nada del kit cliché de marketing (cohete, embudo, lupa, gráfico de barras) salvo que el tema lo pida literalmente y entonces se dibuja como objeto físico real del set
${opts.utileria ? `
UTILERÍA PEDIDA POR EL USUARIO (OBLIGATORIA): ${opts.utileria}
Dibuja EXACTAMENTE esa utilería como los props del set — mismas reglas físicas de arriba — sin agregar otros objetos protagonistas por tu cuenta.
` : ""}
DIRECCIÓN DE ARTE DEL FONDO — "${direccion.nombre}" adaptada a encuadre HORIZONTAL (toda mención a "franja superior" aplícala aquí a la FRANJA IZQUIERDA):
${direccion.fondo}
DETALLE ÚNICO DE ESTA MINIATURA: ${detalle}

UTILERÍA — PALETA Y COMPORTAMIENTO BAJO LA LUZ:
${direccion.paletaObjetos}

RECUERDA: CERO TEXTO en ninguna parte de la imagen. Encuadre HORIZONTAL 16:9 con la franja izquierda despejada y oscura, protagonista grande a la derecha con energía de miniatura de YouTube.
${!opts.conPersona && opts.pose ? `\n${bloquePoseRequerida(opts.pose)}` : ""}`;
}

/* ==================== Preparación (dirección + pose + prompt) ============ */

export interface MiniaturaPreparada {
  direccion: DireccionArte;
  detalle: string;
  pose: PoseSeleccionada | null;
  prompt: string;
}

export function prepararMiniaturaYoutube(
  tema: string,
  extraEstilo?: string | null,
  opciones?: OpcionesMiniaturaYoutube | null,
): MiniaturaPreparada {
  const direccion = resolverDireccion(opciones?.direccionId);
  const detalle = elegirDetalle(direccion);
  const conPersona = opciones?.conPersona ?? false;
  // La pose del banco es exclusiva de Webi: solo aplica sin foto de persona.
  const pose = conPersona ? null : seleccionarPosePortada(tema);
  const utileria = opciones?.utileria?.trim() || null;
  const estilo = extraEstilo?.trim() || null;
  const prompt = buildYoutubeThumbnailPrompt(tema, direccion, detalle, {
    conPersona,
    pose,
    extraEstilo: estilo,
    utileria,
  });
  console.log(
    `[MINIATURA-YT] Dirección: ${direccion.id}${opciones?.direccionId ? " (fijada)" : ""} · Protagonista: ${conPersona ? "persona (foto)" : `Webi (pose ${pose?.id})`}${utileria ? " · Utilería personalizada" : ""}`,
  );
  return { direccion, detalle, pose, prompt };
}

/* ==================== Titular lateral (franja izquierda) ================== */

/** Overlay del titular para 16:9: scrim lateral (izquierda→derecha) + bloque
 *  de texto alineado a la izquierda, centrado verticalmente. Estilo youtuber:
 *  líneas cortas, tipografía enorme y 1-2 palabras en color de acento. */
export function buildYoutubeTitleOverlaySvg(title: string, dir: DireccionArte): Buffer {
  const estilo = dir.titular;
  const fuente = FUENTES[estilo.fuente];

  const cleanTitle = title.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const lines = splitTextIntoLines(cleanTitle, 12).slice(0, 4);
  const lineCount = lines.length;
  const acentos = elegirPalabrasAcento(lines);

  // Tamaños pensados para 720px de alto: más chicos que en vertical pero
  // enormes en proporción, como las miniaturas de youtubers.
  const sizes: [number, number, number] = estilo.fuente === "display" ? [104, 88, 72] : [84, 72, 60];
  let fontSize = lineCount <= 2 ? sizes[0] : lineCount === 3 ? sizes[1] : sizes[2];
  const maxTextWidth = YT_TEXT_ZONE_WIDTH - YT_TEXT_LEFT - (estilo.modo === "chips" ? 40 : 0);
  const maxLineChars = Math.max(...lines.map((l) => l.length));
  const estWidth = maxLineChars * fontSize * fuente.ratio;
  if (estWidth > maxTextWidth) fontSize = Math.floor(fontSize * (maxTextWidth / estWidth));

  const lineHeight = fontSize * fuente.lineHeight;
  const chipPadX = fontSize * 0.3;
  const chipH = lineHeight * (estilo.modo === "chips" ? 1.04 : 1);
  const gap = estilo.modo === "chips" ? 8 : 0;
  const totalH = lineCount * chipH + (lineCount - 1) * gap;
  const blockTop = Math.max(40, (YT_HEIGHT - totalH) / 2);
  const blockCenterY = blockTop + totalH / 2;

  const piezas: string[] = [];
  lines.forEach((line, i) => {
    const lineTop = blockTop + i * (chipH + gap);
    const baseline = lineTop + chipH / 2 + fontSize * 0.34;
    const tspans = renderLineaTspans(line, acentos, estilo.colorTexto, estilo.colorAcento);
    const offsetX = estilo.modo === "chips" && i % 2 === 1 ? 14 : 0;
    const x = YT_TEXT_LEFT + offsetX;

    if (estilo.modo === "chips") {
      const w = Math.min(line.length * fontSize * fuente.ratio + chipPadX * 2, YT_TEXT_ZONE_WIDTH);
      piezas.push(
        `<rect x="${(x - chipPadX).toFixed(1)}" y="${lineTop.toFixed(1)}" width="${w.toFixed(1)}" height="${chipH.toFixed(1)}" rx="${(fontSize * 0.2).toFixed(1)}" fill="${estilo.chipFondo}"/>`,
        `<text x="${x}" y="${baseline.toFixed(1)}" text-anchor="start" font-family="${fuente.familia}" font-weight="${fuente.peso}" font-size="${fontSize}" letter-spacing="1">${tspans}</text>`,
      );
    } else {
      const sombra = Math.max(3, Math.round(fontSize * 0.045));
      const tspansSombra = renderLineaTspans(line, acentos, "rgba(0,0,0,0.5)", "rgba(0,0,0,0.5)");
      piezas.push(
        `<text x="${x + sombra}" y="${(baseline + sombra).toFixed(1)}" text-anchor="start" font-family="${fuente.familia}" font-weight="${fuente.peso}" font-size="${fontSize}" letter-spacing="1" fill="rgba(0,0,0,0.5)">${tspansSombra}</text>`,
        `<text x="${x}" y="${baseline.toFixed(1)}" text-anchor="start" font-family="${fuente.familia}" font-weight="${fuente.peso}" font-size="${fontSize}" letter-spacing="1">${tspans}</text>`,
      );
    }
  });

  const { r, g, b } = estilo.scrim;
  const scrimWidth = Math.round(YT_WIDTH * 0.58);

  const svg = `<svg width="${YT_WIDTH}" height="${YT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrimYt" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgb(${r},${g},${b})" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="rgb(${r},${g},${b})" stop-opacity="0.78"/>
      <stop offset="1" stop-color="rgb(${r},${g},${b})" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${scrimWidth}" height="${YT_HEIGHT}" fill="url(#scrimYt)"/>
  <g transform="rotate(${estilo.inclinacion}, ${(YT_TEXT_LEFT + 240).toFixed(1)}, ${blockCenterY.toFixed(1)})">
    ${piezas.join("\n    ")}
  </g>
</svg>`;

  return Buffer.from(svg);
}

/* ==================== Composición final =================================== */

/** Redimensiona la ilustración a 1280x720 y compone scrim lateral + titular. */
export async function composeYoutubeCover(
  illustration: Buffer,
  title: string,
  dir: DireccionArte,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const overlay = buildYoutubeTitleOverlaySvg(title, dir);

  const finalImage = await sharp(illustration)
    .resize(YT_WIDTH, YT_HEIGHT, { fit: "cover" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  console.log(`[MiniaturaYT] Titular "${dir.nombre}" compuesto (${(finalImage.length / 1024).toFixed(0)}KB)`);
  return finalImage;
}

/* ==================== Validación de la foto (antes de gastar IA) ========= */

export const PERSON_IMG_MAX_BYTES = 8 * 1024 * 1024; // 8 MB decodificados

export type FotoValidada =
  | { ok: true; base64: string; mime: "image/png" | "image/jpeg" | "image/webp" }
  | { ok: false; error: string };

/** Valida una imagen subida (base64) antes de gastar una llamada cara de IA:
 *  tamaño acotado, base64 real y formato soportado según magic bytes.
 *  Devuelve el base64 normalizado (sin prefijo data-URL) y su MIME real. */
export function validarFotoPersona(input: string): FotoValidada {
  const errorFormato = { ok: false as const, error: "La foto no llegó en un formato válido. Vuelve a subirla." };
  const errorPeso = { ok: false as const, error: "La foto pesa demasiado (máximo 8 MB). Prueba con una versión más liviana." };

  // Aceptar (y descartar) un prefijo data-URL si el cliente envía la cadena entera.
  const sinPrefijo = input.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
  if (!sinPrefijo) return errorFormato;
  // Chequeo de peso ANTES de decodificar (largo base64 ≈ bytes * 4/3).
  if (sinPrefijo.length * 0.75 > PERSON_IMG_MAX_BYTES + 4) return errorPeso;
  if (!/^[A-Za-z0-9+/]+=*$/.test(sinPrefijo)) return errorFormato;

  const buf = Buffer.from(sinPrefijo, "base64");
  if (buf.length === 0) return errorFormato;
  if (buf.length > PERSON_IMG_MAX_BYTES) return errorPeso;

  // Magic bytes de los formatos que acepta el modelo de imágenes.
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ok: true, base64: sinPrefijo, mime: "image/png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ok: true, base64: sinPrefijo, mime: "image/jpeg" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { ok: true, base64: sinPrefijo, mime: "image/webp" };
  }
  return { ok: false, error: "El archivo no es una imagen compatible: usa JPG, PNG o WebP." };
}
