import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const REFERENCE_IMAGE_PATH = path.join(process.cwd(), "public", "fox-reference.png");

const COVER_WIDTH = 1080;
const COVER_HEIGHT = 1920;

const TEXT_ZONE_TOP = 60;
const TEXT_ZONE_BOTTOM = 630;
const TEXT_ZONE_HEIGHT = TEXT_ZONE_BOTTOM - TEXT_ZONE_TOP;
const TEXT_ZONE_SIDE_PADDING = 60;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface SceneTemplate {
  scenes: string[];
  keywords: RegExp;
}

const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    keywords: /error|peligro|perder|pierde|pierden|perdiendo|miedo|problema|riesgo|arriesgar|cuidado|ojo|alerta|frenan|frena|falta|adios|atrás|se queda|quedarse|obsolet|\bsin\b|no tiene/,
    scenes: [
      "El zorro de cuerpo completo con expresion MUY PREOCUPADA, manos en la cabeza, junto a una PANTALLA DE COMPUTADORA grande que muestra una X roja y esta agrietada, con flechas rojas cayendo y una nube de tormenta oscura arriba",
      "El zorro de cuerpo completo con gesto de ALARMA y boca abierta, levantando las manos, junto a un TRIANGULO DE WARNING amarillo gigante con signo de exclamacion, con engranajes rotos y tornillos cayendo alrededor",
      "El zorro de cuerpo completo como BOMBERO con casco rojo, apuntando un extinguidor hacia una computadora en llamas, con gotas de agua y humo saliendo",
      "El zorro de cuerpo completo con expresion ASUSTADA sosteniendo un paraguas mientras le llueven X rojas, relojes y flechas hacia abajo, protegiendo una laptop pequena debajo",
      "El zorro de cuerpo completo EMPUJANDO una pared que se cae (como dominos) con esfuerzo, con signos de X roja y relojes detras de la pared",
    ],
  },
  {
    keywords: /tienda|venta|producto|compra|commerce|shopify|vitrina/,
    scenes: [
      "El zorro de cuerpo completo parado junto a un CARRITO DE COMPRAS grande lleno de cajas de colores, con una bolsa de compras en la mano y un checkmark verde flotando arriba",
      "El zorro de cuerpo completo mostrando orgulloso una PANTALLA DE TABLET grande que muestra una tienda online (sin texto, solo bloques de colores representando productos), con cajas y paquetes apilados a su lado",
      "El zorro de cuerpo completo detras de un MOSTRADOR DE TIENDA estilizado con productos en estantes simples, sosteniendo una caja de regalo con sonrisa amplia",
      "El zorro de cuerpo completo empujando un carrito de supermercado gigante desbordando de cajas coloridas, con signos de dinero flotando alrededor",
      "El zorro de cuerpo completo abriendo una caja grande de la que salen productos volando (zapatos, ropa, gadgets en estilo iconico simple), con estrellas de satisfaccion",
    ],
  },
  {
    keywords: /chat|bot|mensaje|whatsapp|atencion|soporte|cliente.*feliz/,
    scenes: [
      "El zorro de cuerpo completo junto a un ROBOT amigable de color azul/celeste que tiene burbujas de chat flotando sobre su cabeza, ambos dando pulgar arriba",
      "El zorro de cuerpo completo sentado relajado con los pies en un escritorio mientras un ROBOT PEQUENO a su lado atiende multiples burbujas de conversacion flotantes",
      "El zorro de cuerpo completo con audiculares de CALL CENTER abrazando a un robot chatbot pequeno y simpatico, con checkmarks verdes flotando arriba",
      "El zorro de cuerpo completo y un ROBOT de pie espalda con espalda como un equipo, con burbujas de chat y corazones flotando alrededor",
      "El zorro de cuerpo completo dormido tranquilamente en una hamaca mientras un ROBOT trabaja frente a una pantalla con burbujas de chat, luna y estrellas arriba (servicio 24/7)",
    ],
  },
  {
    keywords: /sitio|pagina|landing|web|seo|diseno.*web|rediseno/,
    scenes: [
      "El zorro de cuerpo completo parado senalando con orgullo un MONITOR GRANDE que muestra un sitio web colorido (bloques de colores, sin texto), con un cursor de mouse grande flotando",
      "El zorro de cuerpo completo con una brocha de pintor en la mano PINTANDO una pantalla de computadora grande, con gotas de colores vibrantes salpicando",
      "El zorro de cuerpo completo como un ARQUITECTO con un casco, frente a una pantalla de computadora en construccion con gruas y bloques de colores",
      "El zorro de cuerpo completo sosteniendo un LAPTOP abierto hacia el espectador mostrando un sitio web colorido (sin texto), con estrellas y flechas subiendo",
      "El zorro de cuerpo completo con una varita magica tocando una PANTALLA que se transforma de gris opaco a colorida y brillante, con chispas de magia",
    ],
  },
  {
    keywords: /red social|instagram|tiktok|publicidad|anuncio|marketing|contenido/,
    scenes: [
      "El zorro de cuerpo completo como un DIRECTOR DE CINE con una claqueta y un megafono, rodeado de iconos de redes sociales (corazones, likes, estrellas, play buttons)",
      "El zorro de cuerpo completo sosteniendo un TELEFONO GIGANTE del que salen corazones, estrellas y flechas de engagement volando hacia arriba",
      "El zorro de cuerpo completo con un megafono en la mano y un RING LIGHT grande detras, rodeado de iconos de play y likes flotantes",
      "El zorro de cuerpo completo en un ESTUDIO DE GRABACION con aros de luz, camara y telefono, rodeado de iconos de play y likes flotantes",
      "El zorro de cuerpo completo con audifonos grandes y un microfono de podcast, rodeado de ondas de sonido y iconos de redes sociales",
    ],
  },
  {
    keywords: /automat|proceso|flujo|sistema|piloto|robot|24.*7|dormir/,
    scenes: [
      "El zorro de cuerpo completo recostado en una SILLA DE PLAYA con lentes de sol mientras engranajes y robots trabajan automaticamente detras de el",
      "El zorro de cuerpo completo junto a una MAQUINA GRANDE con engranajes, palancas y un boton rojo, con una flecha circular mostrando automatizacion",
      "El zorro de cuerpo completo con un CONTROL REMOTO apuntando a un tablero de engranajes y flechas conectadas que representan procesos automaticos",
      "El zorro de cuerpo completo dormido placidamente en una hamaca mientras ENGRANAJES y ROBOTS trabajan a su lado, con un reloj flotando arriba",
      "El zorro de cuerpo completo presionando un BOTON GIGANTE rojo con un icono de play, mientras a su alrededor una cadena de engranajes y flechas se activa",
    ],
  },
  {
    keywords: /inteligencia|\bia\b|artificial|gpt|machine|cerebro/,
    scenes: [
      "El zorro de cuerpo completo con una bata de CIENTIFICO junto a un CEREBRO brillante conectado con circuitos y rayos de energia azul",
      "El zorro de cuerpo completo interactuando con un HOLOGRAMA futurista azul que muestra redes neuronales y conexiones brillantes",
      "El zorro de cuerpo completo con gafas de realidad virtual, rodeado de CIRCUITOS y bombillas encendidas que flotan formando una red",
      "El zorro de cuerpo completo junto a una pantalla flotante transparente con simbolos de codigo y un cerebro digital brillando arriba",
      "El zorro de cuerpo completo junto a un ROBOT AVANZADO azul con un cerebro visible brillando, ambos chocando los cinco en gesto de equipo",
    ],
  },
  {
    keywords: /empresa|negocio|digital|crecer|escalar|exito|transformar/,
    scenes: [
      "El zorro de cuerpo completo como SUPERHERO con capa naranja, puno en alto, con un cohete despegando a su lado y estrellas arriba",
      "El zorro de cuerpo completo en traje ejecutivo ROMPIENDO una pared con un punch, al otro lado se ve un mundo digital brillante y colorido",
      "El zorro de cuerpo completo sosteniendo un TROFEO dorado con ambas manos y sonrisa enorme, con confeti y estrellas cayendo alrededor",
      "El zorro de cuerpo completo abriendo unas PUERTAS GRANDES dobles que revelan un mundo digital lleno de iconos de tecnologia y crecimiento",
      "El zorro de cuerpo completo con un maletin ejecutivo en una mano y un GRAFICO ASCENDENTE grande al lado, con flechas verdes subiendo y estrellas",
    ],
  },
  {
    keywords: /app.*movil|movil|celular|smartphone|ios|android|store/,
    scenes: [
      "El zorro de cuerpo completo sosteniendo un SMARTPHONE GIGANTE que muestra una app colorida (sin texto), con notificaciones y checkmarks saliendo de la pantalla",
      "El zorro de cuerpo completo como un MECANICO ensamblando un telefono celular grande pieza por pieza con herramientas, con engranajes y tuercas flotando",
      "El zorro de cuerpo completo mostrando DOS TELEFONOS grandes lado a lado (iOS y Android), con estrellas de calificacion 5 estrellas flotando arriba",
      "El zorro de cuerpo completo junto a un TELEFONO CELULAR gigante como si fuera una puerta abierta, invitando a entrar al mundo de las apps",
    ],
  },
  {
    keywords: /contabilidad|finanz|factura|impuesto|f29|boleta|dinero|pago/,
    scenes: [
      "El zorro de cuerpo completo con LENTES DE CONTADOR y una calculadora gigante, rodeado de monedas doradas, graficos de torta y documentos con checkmarks",
      "El zorro de cuerpo completo sentado en un ESCRITORIO ORDENADO con pilas de monedas doradas crecientes, una calculadora y graficos de barras subiendo en la pared",
      "El zorro de cuerpo completo haciendo MALABARES con monedas doradas, billetes y una calculadora, con graficos positivos flotando arriba",
      "El zorro de cuerpo completo como un MAGO sacando monedas doradas de un sombrero, con graficos de crecimiento y signos de porcentaje flotando",
    ],
  },
  {
    keywords: /agenda|calendario|cita|hora|tiempo|reserva|planifica/,
    scenes: [
      "El zorro de cuerpo completo junto a un CALENDARIO GIGANTE con checkmarks verdes en los dias, sosteniendo un reloj grande en una mano",
      "El zorro de cuerpo completo organizando un TABLERO KANBAN colorido con tarjetas de colores, con un reloj y checkmarks flotando arriba",
      "El zorro de cuerpo completo sentado sobre un RELOJ DE ARENA GIGANTE con una agenda abierta en las manos, con calendarios y relojes flotando",
      "El zorro de cuerpo completo como un DIRECTOR DE ORQUESTA con una batuta, dirigiendo calendarios, relojes y tareas que flotan armoniosamente",
    ],
  },
];

const DEFAULT_SCENES = [
  "El zorro de cuerpo completo con un LAPTOP abierto frente a el, rodeado de iconos de tecnologia flotantes (bombilla, checkmark, estrella, engranaje)",
  "El zorro de cuerpo completo con gesto de presentador mostrando con ambas manos un PANEL grande con graficos coloridos subiendo (sin texto ni numeros), con estrellas flotando",
  "El zorro de cuerpo completo CELEBRANDO con confeti cayendo, los brazos en alto, rodeado de checkmarks verdes y estrellas doradas",
  "El zorro de cuerpo completo como un EXPLORADOR con binoculares, descubriendo un mapa del tesoro digital con iconos de tecnologia marcando los puntos",
  "El zorro de cuerpo completo con una LUPA GIGANTE examinando un engranaje grande, con piezas de puzzle encajando a su alrededor",
  "El zorro de cuerpo completo como un CHEF con gorro blanco, cocinando en una olla de la que salen iconos digitales (engranajes, bombillas, checkmarks) como ingredientes",
  "El zorro de cuerpo completo SURFEANDO sobre una ola hecha de datos y graficos coloridos, con expresion emocionada",
  "El zorro de cuerpo completo como un PILOTO con gafas de aviador en la cabina de un avion/nave, con nubes y estrellas alrededor",
];

function buildIllustrationPrompt(videoDescription: string): string {
  let sceneDescription: string;

  const descLower = videoDescription.toLowerCase();
  const matched = SCENE_TEMPLATES.find(t => t.keywords.test(descLower));
  if (matched) {
    sceneDescription = pickRandom(matched.scenes);
  } else {
    sceneDescription = pickRandom(DEFAULT_SCENES);
  }

  return `Genera una ilustracion VERTICAL en formato 9:16 (1080x1920 pixeles).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, numero, rotulo, etiqueta, titulo, cartel, texto en pantallas, texto en objetos, ni NINGUN tipo de escritura en la imagen. CERO caracteres alfanumericos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores, JAMAS texto legible. Esta regla no tiene excepciones.

PERSONAJE (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomorfico con lentes rectangulares negros gruesos y camiseta/polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible
- El zorro debe ocupar al menos 40% del area visual inferior. Es el PROTAGONISTA, no un elemento secundario
- Debe verse IDENTICO al de la referencia en proporciones, estilo de dibujo y nivel de detalle
- Expresiones faciales variadas segun la escena (confiado, sorprendido, feliz, preocupado, relajado)

ESCENA A ILUSTRAR:
${sceneDescription}

TEMA DEL VIDEO: "${videoDescription}"
Adapta la escena al contexto especifico del video. Los objetos y elementos deben ser RELEVANTES al tema y contar una historia visual clara.

ZONA SUPERIOR VACIA (CRITICO - NO NEGOCIABLE):
- El 35% SUPERIOR de la imagen (de 0px a 670px desde arriba) debe ser UNICAMENTE fondo amarillo solido plano (#FFB800)
- NADA puede existir en esa zona: ni el zorro, ni objetos, ni sombras, ni lineas, ni bordes, ni degradados
- Toda la accion visual comienza DEBAJO del pixel 670

COMPOSICION:
- El zorro y los objetos ocupan el 65% INFERIOR de la imagen
- Composicion LIMPIA: el zorro es el protagonista, los objetos complementan la escena
- Dejar espacio entre elementos, no abarrotar la imagen
- Se pueden incluir 2-4 elementos/objetos ademas del zorro, pero deben ser parte de la escena narrativa

FONDO:
- Color amarillo solido uniforme #FFB800 en TODA la imagen, de borde a borde
- SIN degradados, SIN texturas, SIN patrones, SIN variaciones de tono

ESTILO ARTISTICO:
- Flat vector art / cartoon profesional con lineas de contorno gruesas negras
- Colores planos y vibrantes, SIN degradados, SIN sombras realistas, SIN brillos
- Permitidos hasta 8 colores: amarillo fondo, naranja zorro, verde camiseta, negro contornos, blanco, azul/celeste, rojo/rosado, gris
- Los objetos deben ser estilizados y simples (como iconos grandes), NO fotorealistas

RECUERDA: CERO TEXTO. Ni una sola letra o numero en NINGUNA parte de la imagen.`;
}

function splitTextIntoLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if ((currentLine + " " + word).length <= maxCharsPerLine) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
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

const FONT_PATH = path.join(process.cwd(), "public", "fonts", "LuckiestGuy-Regular.ttf");

async function buildTextOverlay(title: string): Promise<Buffer> {
  const cleanTitle = title
    .replace(/\*\*/g, "")
    .toUpperCase()
    .trim();

  const maxTextWidth = COVER_WIDTH - TEXT_ZONE_SIDE_PADDING * 2;

  const lines = splitTextIntoLines(cleanTitle, 15);
  const lineCount = Math.min(lines.length, 5);
  const finalLines = lines.slice(0, 5);

  let fontSize: number;
  if (lineCount <= 2) fontSize = 115;
  else if (lineCount <= 3) fontSize = 100;
  else if (lineCount <= 4) fontSize = 85;
  else fontSize = 72;

  const approxCharWidth = fontSize * 0.58;
  const maxLineChars = Math.max(...finalLines.map(l => l.length));
  const estimatedWidth = maxLineChars * approxCharWidth;
  if (estimatedWidth > maxTextWidth) {
    fontSize = Math.floor(fontSize * (maxTextWidth / estimatedWidth));
  }

  const lineHeight = fontSize * 1.18;
  const totalTextHeight = lineCount * lineHeight;
  const startY = TEXT_ZONE_TOP + (TEXT_ZONE_HEIGHT - totalTextHeight) / 2 + fontSize * 0.85;

  const fontBuffer = await readFile(FONT_PATH);
  const fontBase64 = fontBuffer.toString("base64");

  const textElements = finalLines.map((line, i) => {
    const y = startY + i * lineHeight;
    const escaped = escapeXml(line);
    const shadowOffset = Math.max(4, Math.round(fontSize * 0.05));
    return [
      `<text x="${COVER_WIDTH / 2 + shadowOffset}" y="${y + shadowOffset}" text-anchor="middle" font-family="LuckiestGuy" font-size="${fontSize}" fill="#E86A30" opacity="0.85">${escaped}</text>`,
      `<text x="${COVER_WIDTH / 2}" y="${y}" text-anchor="middle" font-family="LuckiestGuy" font-size="${fontSize}" fill="white">${escaped}</text>`,
    ].join("\n    ");
  }).join("\n    ");

  const svg = `<svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        @font-face {
          font-family: 'LuckiestGuy';
          src: url('data:font/ttf;base64,${fontBase64}');
        }
      </style>
    </defs>
    ${textElements}
  </svg>`;

  return Buffer.from(svg);
}

async function generateFoxIllustration(videoDescription: string): Promise<Buffer> {
  const { GoogleGenAI, Modality } = await import("@google/genai");
  const ai = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });

  const refImageBuffer = await readFile(REFERENCE_IMAGE_PATH);
  const refImageBase64 = refImageBuffer.toString("base64");
  const prompt = buildIllustrationPrompt(videoDescription);

  console.log(`[CoverGen] Generating fox illustration via Gemini...`);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: refImageBase64,
              mimeType: "image/png",
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: any) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    console.error("[CoverGen] No image data in Gemini response");
    throw new Error("Gemini no devolvio imagen. Intenta de nuevo.");
  }

  console.log(`[CoverGen] Fox illustration generated successfully`);
  return Buffer.from(imagePart.inlineData.data, "base64");
}

const TEXT_ZONE_CLEAR_HEIGHT = TEXT_ZONE_BOTTOM + 40;
const BG_COLOR_RGB = { r: 255, g: 184, b: 0 };

async function ensureCleanTextZone(imageBuffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  const solidBlock = await sharp({
    create: {
      width: COVER_WIDTH,
      height: TEXT_ZONE_CLEAR_HEIGHT,
      channels: 4,
      background: { ...BG_COLOR_RGB, alpha: 1 },
    },
  }).png().toBuffer();

  const cleaned = await sharp(imageBuffer)
    .composite([
      { input: solidBlock, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  console.log(`[CoverGen] Text zone cleaned (solid ${TEXT_ZONE_CLEAR_HEIGHT}px)`);
  return cleaned;
}

async function compositeWithText(illustrationBuffer: Buffer, title: string): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const textSvg = await buildTextOverlay(title);

  const resizedIllustration = await sharp(illustrationBuffer)
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover" })
    .png()
    .toBuffer();

  const cleanedIllustration = await ensureCleanTextZone(resizedIllustration);

  const finalImage = await sharp(cleanedIllustration)
    .composite([
      {
        input: textSvg,
        top: 0,
        left: 0,
      },
    ])
    .png({ quality: 95 })
    .toBuffer();

  console.log(`[CoverGen] Text overlay composited (${(finalImage.length / 1024).toFixed(0)}KB)`);
  return finalImage;
}

const COVERS_DIR = path.join(process.cwd(), "public", "uploads", "covers");

async function ensureCoversDir() {
  await mkdir(COVERS_DIR, { recursive: true });
}

export async function generateCoverImage(videoTitle: string, videoDescription: string): Promise<string>;
export async function generateCoverImage(videoTitle: string, videoDescription: string, returnBuffer: true): Promise<{ servePath: string; imageBuffer: Buffer; mimeType: string }>;
export async function generateCoverImage(videoTitle: string, videoDescription: string, returnBuffer?: boolean): Promise<string | { servePath: string; imageBuffer: Buffer; mimeType: string }> {
  console.log(`[CoverGen] Generating cover for: "${videoTitle}"`);

  const foxIllustration = await generateFoxIllustration(videoDescription);
  const finalImage = await compositeWithText(foxIllustration, videoTitle);

  const mimeType = "image/png";
  const ext = "png";

  await ensureCoversDir();
  const imageId = randomUUID();
  const fileName = `${imageId}.${ext}`;
  const filePath = path.join(COVERS_DIR, fileName);
  await writeFile(filePath, finalImage);

  const servePath = `/uploads/covers/${fileName}`;
  console.log(`[CoverGen] Cover saved: ${servePath}`);

  if (returnBuffer) {
    return { servePath, imageBuffer: finalImage, mimeType };
  }
  return servePath;
}
