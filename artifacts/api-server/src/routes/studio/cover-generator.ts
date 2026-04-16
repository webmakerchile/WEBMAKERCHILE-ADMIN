import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __filename_cg = fileURLToPath(import.meta.url);
const __dirname_cg = path.dirname(__filename_cg);

const REFERENCE_IMAGE_PATH = path.resolve(__dirname_cg, "..", "..", "public", "fox-reference.png");

const COVER_WIDTH = 1080;
const COVER_HEIGHT = 1920;

const TEXT_ZONE_TOP = 60;
const TEXT_ZONE_BOTTOM = 630;
const TEXT_ZONE_HEIGHT = TEXT_ZONE_BOTTOM - TEXT_ZONE_TOP;
const TEXT_ZONE_SIDE_PADDING = 60;

function buildIllustrationPrompt(videoDescription: string): string {
  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores o gráficos abstractos, JAMÁS texto legible. Esta regla no tiene excepciones.

PERSONAJE - ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta/polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible
- El zorro debe ocupar al menos 40% del área visual inferior. Es el PROTAGONISTA, no un elemento secundario
- Debe verse IDÉNTICO al de la referencia en proporciones, estilo de dibujo y nivel de detalle
- El zorro DEBE mantener el estilo FLAT CARTOON de la referencia: líneas de contorno GRUESAS negras, colores PLANOS y sólidos (naranja puro, verde sólido), SIN degradados en el personaje, SIN texturas, SIN sombras realistas. El zorro es un cartoon simple y limpio
- Expresiones faciales variadas según la escena (confiado, sorprendido, feliz, preocupado, relajado)

ESCENA A ILUSTRAR:
TEMA DEL VIDEO: "${videoDescription}"
Adapta la escena al contexto específico del video. Los objetos y elementos deben ser RELEVANTES al tema y contar una historia visual clara.

ZONA SUPERIOR VACÍA (CRÍTICO - NO NEGOCIABLE):
- El 35% SUPERIOR de la imagen (de 0px a 670px desde arriba) debe ser ÚNICAMENTE fondo oscuro limpio sin elementos
- NADA puede existir en esa zona: ni el zorro, ni objetos, ni sombras, ni líneas, ni bordes
- Toda la acción visual comienza DEBAJO del píxel 670

COMPOSICIÓN:
- El zorro y los objetos ocupan el 65% INFERIOR de la imagen
- Composición LIMPIA: el zorro es el protagonista, los objetos complementan la escena
- Dejar espacio entre elementos, no abarrotar la imagen
- Se pueden incluir 2-4 elementos/objetos además del zorro, pero deben ser parte de la escena narrativa

CONTRASTE DE ESTILOS (IMPORTANTE):
- El ZORRO y los OBJETOS/ICONOS se dibujan en estilo FLAT CARTOON: líneas de contorno gruesas negras, colores planos y vibrantes, sin degradados, sin sombras realistas. Como iconos grandes y simples, estilizados
- El FONDO es premium y oscuro con efectos de iluminación elegantes (ver abajo)
- Este contraste entre personaje cartoon sobre fondo premium es intencional y crea un look moderno y llamativo

FONDO PREMIUM (solo el fondo, NO el personaje):
- Color base: gradiente vertical muy sutil de #0F172A (slate 900) en la parte inferior a #1E293B (slate 800) en el centro
- Elementos de fondo: grid geométrico muy sutil (líneas blancas al 3-5% de opacidad) como el que usan sitios como Linear.app o Vercel
- Un glow ambiental suave y difuso detrás del zorro en tono naranja cálido (#E86A30 al 15-20% de opacidad) con blur amplio, como un halo de luz
- La zona superior (35%) mantiene el mismo tono oscuro limpio sin elementos

PALETA:
- Fondo: tonos slate oscuros (#0F172A, #1E293B) con glow naranja difuso
- Zorro: naranja vibrante PLANO (como la referencia), verde sólido en la camiseta, líneas gruesas negras
- Objetos: colores planos y vibrantes estilo flat icon (naranja, verde, blanco, azul, rojo), con contornos gruesos negros
- Los objetos tecnológicos pueden tener pequeños acentos brillantes (pantallas con glow verde o naranja)

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte de la imagen. El zorro debe verse EXACTAMENTE como en la referencia (flat cartoon), pero sobre un fondo oscuro premium elegante.`;
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

const FONT_PATH = path.resolve(__dirname_cg, "..", "..", "public", "fonts", "LuckiestGuy-Regular.ttf");

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

  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [5000, 15000, 30000];

  function isRateLimitError(err: any): boolean {
    const msg = typeof err?.message === "string" ? err.message : "";
    return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Resource exhausted");
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[CoverGen] Generating fox illustration via Gemini (attempt ${attempt}/${MAX_RETRIES})...`);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
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
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find(
        (part: any) => part.inlineData
      );

      if (!imagePart?.inlineData?.data) {
        throw new Error("Gemini no devolvió imagen en este intento");
      }

      console.log(`[CoverGen] Fox illustration generated successfully`);
      return Buffer.from(imagePart.inlineData.data, "base64");
    } catch (err: any) {
      const rateLimited = isRateLimitError(err);
      console.warn(`[CoverGen] Attempt ${attempt} failed (rate_limit=${rateLimited}): ${err.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = rateLimited
          ? RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]
          : 2000 * attempt;
        console.log(`[CoverGen] Waiting ${delay / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        if (rateLimited) {
          throw new Error("El servicio de IA está saturado. Espera 1-2 minutos e intenta de nuevo.");
        }
        throw new Error("No se pudo generar la imagen después de varios intentos. Intenta de nuevo.");
      }
    }
  }
  throw new Error("No se pudo generar la imagen");
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
