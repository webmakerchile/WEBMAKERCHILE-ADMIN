// Miniaturas de YouTube (16:9): mismo universo "Estudio Spotlight" de la marca
// pero en encuadre HORIZONTAL y con protagonista distinto — la PERSONA REAL de
// una o varias fotos (estilo youtuber: rostro idéntico, expresión de alta
// energía) o el zorro Webi si no hay foto. El titular lo compone el servidor
// según la PLANTILLA elegida (formatos predeterminados que se intercalan) con
// el motor de tipografía de impacto (title-style).

import {
  resolverDireccion,
  elegirDetalle,
  type DireccionArte,
} from "./cover-style.js";
import {
  seleccionarPosePortada,
  bloquePoseRequerida,
  detectarEmocion,
  POSES_PRIMER_PLANO,
  type PoseSeleccionada,
} from "./pose-bank.js";
import {
  construirOverlayTitular,
  resolverEstiloTitular,
  type EstiloTitular,
} from "./title-style.js";
import { resolverPlantilla, obtenerPlantilla, type PlantillaPortada } from "./thumbnail-templates.js";

export const YT_WIDTH = 1280;
export const YT_HEIGHT = 720;

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
  /** Fija la plantilla de composición (id de PLANTILLAS_PORTADA formato youtube). */
  plantillaId?: string | null;
  /** Fija el estilo tipográfico del titular (id de ESTILOS_TITULAR). */
  estiloTitularId?: string | null;
  /** Utilería pedida por el usuario: props físicos del set. */
  utileria?: string | null;
  /** true si la miniatura lleva la foto de una persona real como protagonista. */
  conPersona: boolean;
  /** Cuántas fotos de la persona se adjuntan (refuerza el bloque de identidad). */
  numFotosPersona?: number;
}

export function buildYoutubeThumbnailPrompt(
  tema: string,
  direccion: DireccionArte,
  detalle: string,
  opts: {
    conPersona: boolean;
    plantilla: PlantillaPortada;
    pose?: PoseSeleccionada | null;
    extraEstilo?: string | null;
    utileria?: string | null;
    numFotosPersona?: number;
  },
): string {
  const numFotos = Math.max(1, opts.numFotosPersona ?? 1);
  const refFotos =
    numFotos > 1
      ? `las ${numFotos} fotos adjuntas — TODAS son LA MISMA persona vista desde distintos ángulos`
      : "la foto adjunta";

  const bloqueProtagonista = opts.conPersona
    ? `PROTAGONISTA - LA PERSONA REAL DE ${numFotos > 1 ? "LAS FOTOS ADJUNTAS" : "LA FOTO ADJUNTA"} (CRÍTICO - NO NEGOCIABLE):
- El protagonista es LA MISMA PERSONA de ${refFotos} y debe ser reconocible AL INSTANTE por cualquiera que la conozca. Trátalo como un RETRATO de esa persona, no como "alguien parecido"
- Rostro IDÉNTICO al de la foto: misma forma de cara, misma nariz, mismos ojos y cejas, misma boca y mentón, mismo tono de piel, misma edad, mismo peinado y color de pelo, misma barba/maquillaje/lentes/accesorios si los tiene
- Conserva sus marcas personales tal cual (lunares, pecas, cicatrices, forma exacta de las cejas): son parte de la identidad
${numFotos > 1 ? `- Usa TODOS los ángulos de las fotos para reconstruir el rostro con precisión (forma exacta de nariz, mandíbula y ojos); ante cualquier duda manda la PRIMERA foto\n` : ""}- PROHIBIDO inventar una cara nueva, "embellecerla", rejuvenecerla o cambiar su contextura. Lo ÚNICO que cambia respecto a la foto es: la EXPRESIÓN, la POSE, la ropa y la iluminación. Nada más
- FOTORREALISTA — PROHIBIDO convertirla en cartoon, ilustración o pintura: piel con textura real, como fotografía de estudio tomada con cámara profesional
- Recórtala de su fondo original (nada del fondo de la foto debe aparecer)
- EXPRESIÓN OBLIGATORIA de youtuber (exagerada, llevada al máximo SIN deformar sus rasgos): ${expresionYoutuber(tema)}
- La luz del estudio la esculpe con drama: luz principal modelando la cara y un RIM LIGHT intenso del color de la variante recortando toda su silueta contra el fondo`
    : `PROTAGONISTA - ZORRO WEBI ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta verde oscuro, IDÉNTICO a la referencia en proporciones, estilo de dibujo y nivel de detalle
- Mantiene el estilo FLAT CARTOON de la referencia: contornos gruesos negros, colores PLANOS y sólidos, SIN degradados, SIN texturas, SIN sombras realistas en el personaje
- GRANDE y protagonista, siguiendo la composición indicada más abajo
- POSE Y EXPRESIÓN OBLIGATORIA para esta imagen: ${opts.pose?.descripcion ?? "pose expresiva y segura acorde al tema"}`;

  return `Genera una MINIATURA DE YOUTUBE HORIZONTAL en formato 16:9 (lienzo apaisado, más ancho que alto).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores, JAMÁS texto legible. Esta regla no tiene excepciones.

${bloqueProtagonista}

${opts.plantilla.bloqueComposicion(opts.conPersona)}
- MARGEN DE SEGURIDAD: el 8% superior e inferior del lienzo se recorta después — nada crítico (cabeza, ojos, objetos clave) puede quedar pegado al borde superior ni al inferior

ENERGÍA DE MINIATURA VIRAL (CRÍTICO — debe dar GANAS DE HACER CLIC):
- Nada de escena tranquila ni foto corporativa de banco de imágenes: esto es la miniatura de un youtuber top — dramática, intensa y con tensión visual
- COLOR AL MÁXIMO: la paleta de la dirección de arte en su versión más SATURADA y contrastada — luces potentes, sombras profundas, colores que revientan incluso en pantalla de celular
- Iluminación CINEMATOGRÁFICA con volumen: atmósfera/neblina sutil que hace visibles los haces de luz, rim light vibrante bien marcado, brillos especulares en la utilería
- La escena cuenta un MOMENTO con drama (algo acaba de pasar o está a punto de pasar), no un posado estático
- Acabado premium de productora audiovisual: la calidad se nota a primera vista

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
DIRECCIÓN DE ARTE DEL FONDO — "${direccion.nombre}" adaptada a encuadre HORIZONTAL (toda mención a "franja superior" aplícala aquí a la zona que la composición exige dejar despejada) y AMPLIFICADA: más saturación, más contraste y luz más potente que en una portada normal, sin aclarar la zona despejada del titular:
${direccion.fondo}
DETALLE ÚNICO DE ESTA MINIATURA: ${detalle}

UTILERÍA — PALETA Y COMPORTAMIENTO BAJO LA LUZ:
${direccion.paletaObjetos}

RECUERDA: CERO TEXTO en ninguna parte de la imagen. Encuadre HORIZONTAL 16:9 respetando la composición de la plantilla, con su zona del titular despejada y oscura, y energía de miniatura de YouTube.
${!opts.conPersona && opts.pose ? `\n${bloquePoseRequerida(opts.pose)}` : ""}`;
}

/* ==================== Preparación (dirección + pose + prompt) ============ */

export interface MiniaturaPreparada {
  direccion: DireccionArte;
  plantilla: PlantillaPortada;
  estiloTitular: EstiloTitular;
  detalle: string;
  pose: PoseSeleccionada | null;
  prompt: string;
}

export function prepararMiniaturaYoutube(
  tema: string,
  extraEstilo?: string | null,
  opciones?: OpcionesMiniaturaYoutube | null,
  titulo?: string | null,
): MiniaturaPreparada {
  const direccion = resolverDireccion(opciones?.direccionId);
  const detalle = elegirDetalle(direccion);
  const conPersona = opciones?.conPersona ?? false;
  const plantilla = resolverPlantilla(opciones?.plantillaId, "youtube", { titulo: titulo ?? tema });
  const estiloTitular = resolverEstiloTitular(opciones?.estiloTitularId, plantilla.estiloTitularDefault);
  // La pose del banco es exclusiva de Webi: solo aplica sin foto de persona.
  // En plantillas de primer plano solo entran gestos de cabeza/hombros — las
  // poses de cuerpo completo (manos en caderas, brazos arriba) contradirían
  // el encuadre cerrado que la composición exige.
  const pose = conPersona
    ? null
    : seleccionarPosePortada(tema, plantilla.encuadre === "primer_plano" ? POSES_PRIMER_PLANO : undefined);
  const utileria = opciones?.utileria?.trim() || null;
  const estilo = extraEstilo?.trim() || null;
  const prompt = buildYoutubeThumbnailPrompt(tema, direccion, detalle, {
    conPersona,
    plantilla,
    pose,
    extraEstilo: estilo,
    utileria,
    numFotosPersona: opciones?.numFotosPersona,
  });
  console.log(
    `[MINIATURA-YT] Dirección: ${direccion.id}${opciones?.direccionId ? " (fijada)" : ""} · Plantilla: ${plantilla.id}${opciones?.plantillaId ? " (fijada)" : ""} · Titular: ${estiloTitular.id} · Protagonista: ${conPersona ? `persona (${opciones?.numFotosPersona ?? 1} foto/s)` : `Webi (pose ${pose?.id})`}${utileria ? " · Utilería personalizada" : ""}`,
  );
  return { direccion, plantilla, estiloTitular, detalle, pose, prompt };
}

/* ==================== Titular (overlay según plantilla) ================== */

/** Overlay del titular para 16:9 con el motor de tipografía de impacto.
 *  Sin plantilla/estilo explícitos usa la clásica lateral (compatibilidad). */
export function buildYoutubeTitleOverlaySvg(
  title: string,
  dir: DireccionArte,
  plantilla?: PlantillaPortada,
  estilo?: EstiloTitular,
): Buffer {
  const plantillaFinal = plantilla ?? obtenerPlantilla("yt_lateral_izquierda")!;
  const estiloFinal = estilo ?? resolverEstiloTitular(null, plantillaFinal.estiloTitularDefault);
  return construirOverlayTitular({
    canvas: { width: YT_WIDTH, height: YT_HEIGHT },
    zona: plantillaFinal.zona,
    scrim: plantillaFinal.scrim,
    titulo: title,
    estilo: estiloFinal,
    paleta: { colorAcento: dir.titular.colorAcento, scrim: dir.titular.scrim },
    extras: plantillaFinal.extras,
  });
}

/* ==================== Composición final =================================== */

/** Redimensiona la ilustración a 1280x720 y compone scrim + titular según la
 *  plantilla y el estilo tipográfico. */
export async function composeYoutubeCover(
  illustration: Buffer,
  title: string,
  dir: DireccionArte,
  plantilla?: PlantillaPortada,
  estilo?: EstiloTitular,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const overlay = buildYoutubeTitleOverlaySvg(title, dir, plantilla, estilo);

  const finalImage = await sharp(illustration)
    .resize(YT_WIDTH, YT_HEIGHT, { fit: "cover" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  console.log(
    `[MiniaturaYT] Titular "${dir.nombre}" compuesto (plantilla ${plantilla?.id ?? "clásica"}, ${(finalImage.length / 1024).toFixed(0)}KB)`,
  );
  return finalImage;
}

/* ==================== Validación de la foto (antes de gastar IA) ========= */

export const PERSON_IMG_MAX_BYTES = 8 * 1024 * 1024; // 8 MB decodificados
/** Máximo de fotos de la persona por miniatura (gpt-image-1 acepta varias). */
export const MAX_FOTOS_PERSONA = 3;

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

/** Valida la lista de fotos de la persona (1 a MAX_FOTOS_PERSONA). */
export function validarFotosPersona(
  inputs: string[],
): { ok: true; fotos: Array<{ base64: string; mime: string }> } | { ok: false; error: string } {
  if (inputs.length > MAX_FOTOS_PERSONA) {
    return { ok: false, error: `Máximo ${MAX_FOTOS_PERSONA} fotos de la persona por miniatura.` };
  }
  const fotos: Array<{ base64: string; mime: string }> = [];
  for (const [i, input] of inputs.entries()) {
    const v = validarFotoPersona(input);
    if (!v.ok) {
      return inputs.length > 1 ? { ok: false, error: `Foto ${i + 1}: ${v.error}` } : v;
    }
    fotos.push({ base64: v.base64, mime: v.mime });
  }
  return { ok: true, fotos };
}
