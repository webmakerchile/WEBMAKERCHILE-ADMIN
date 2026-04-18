import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { db } from "@workspace/db";
import { communityContent } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { readFile } from "fs/promises";
import path from "path";

const router: IRouter = Router();

const anthropic = new Anthropic({
  apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"]!,
  baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"]!,
});

async function resolveAsset(...segments: string[]): Promise<string> {
  const candidates = [
    path.join(process.cwd(), ...segments),
    path.join(process.cwd(), "artifacts", "api-server", ...segments),
  ];
  for (const p of candidates) {
    try {
      await readFile(p);
      return p;
    } catch {}
  }
  return candidates[0]!;
}

let foxRefBase64Cache: string | null = null;
async function getFoxRefBase64(): Promise<string | null> {
  if (foxRefBase64Cache) return foxRefBase64Cache;
  try {
    const p = await resolveAsset("public", "fox-reference.png");
    foxRefBase64Cache = (await readFile(p)).toString("base64");
    return foxRefBase64Cache;
  } catch {
    return null;
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length <= maxCharsPerLine) {
      current = (current + " " + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ============================================
// SORPRÉNDEME
// ============================================

const SorprendemeBody = z.object({
  contexto: z.string().max(300).optional(),
  tipo_seccion: z.enum(["historia", "descripcion"]),
});

router.post("/community/sorprendeme", async (req, res) => {
  try {
    const body = SorprendemeBody.parse(req.body);
    const ctx = (body.contexto || "").trim();

    const sectionHint = body.tipo_seccion === "historia"
      ? "una HISTORIA corta (story de 9:16 con un solo concepto digerible en 5 segundos)"
      : "una PUBLICACIÓN de feed (carrusel o post único con desarrollo más largo)";

    const userPrompt = ctx
      ? `Genera UN tema concreto y específico para ${sectionHint} de WebMakerLatam (comunidad latina de devs y creadores tech). El tema DEBE estar alineado con este contexto del usuario: "${ctx}". Devuelve SOLO el tema en una línea, sin comillas, sin prefijos, sin explicación. Máximo 90 caracteres.`
      : `Genera UN tema random concreto y específico para ${sectionHint} de WebMakerLatam (comunidad latina de devs y creadores tech). Elige aleatoriamente una de estas categorías: tutoriales, tips rápidos, herramientas, reflexiones de carrera, motivación, frameworks (react/vue/svelte/angular/next), debugging, productividad, buenas prácticas, javascript/typescript, css moderno, git, terminal, vs code, ia para devs. Sé específico y accionable, no genérico. Devuelve SOLO el tema en una línea, sin comillas, sin prefijos, sin explicación. Máximo 90 caracteres.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: "Eres un generador de ideas de contenido para devs latinos. Devuelves SOLO el tema pedido, sin formato, sin comillas, sin prefijos.",
      messages: [{ role: "user", content: userPrompt }],
    });

    const block = response.content[0];
    let tema = block && block.type === "text" ? block.text.trim() : "";
    tema = tema.replace(/^["'`]+|["'`]+$/g, "").replace(/^[-*•]\s*/, "").trim();
    if (tema.length > 120) tema = tema.slice(0, 117) + "...";

    res.json({ success: true, data: { tema } });
  } catch (err: any) {
    console.error("[Sorpréndeme] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

// ============================================
// HISTORIAS
// ============================================

const POSES_HISTORIA: Record<string, string[]> = {
  tip_tech: [
    "apuntando con el dedo índice hacia arriba con expresión de '¡importante!', cejas levantadas",
    "con una bombilla de idea flotando sobre su cabeza, sonrisa de descubrimiento",
    "tecleando en una laptop con cara concentrada, lentes brillando",
    "sosteniendo un engranaje con mirada analítica, postura de experto",
    "señalando un código flotante abstracto con el dedo, expresión explicativa",
  ],
  motivacional: [
    "con los dos brazos levantados en pose de victoria, sonrisa enorme",
    "en pose de superhéroe con manos en la cintura, mirada confiada",
    "corriendo hacia adelante con sonrisa determinada, cola ondeando",
    "saltando con un puño al aire, expresión de triunfo",
    "meditando sentado con piernas cruzadas, aura de calma y enfoque",
  ],
  comunidad: [
    "saludando con la pata levantada, sonrisa amigable tipo 'hola'",
    "sosteniendo una taza de café humeante, relajado y acogedor",
    "con audífonos grandes puestos frente a un micrófono, grabando contenido",
    "riéndose con las dos patas en el estómago, expresión genuina",
    "dando un abrazo al aire con brazos abiertos, cara de cariño",
  ],
};

function buildHistoriaPrompt(tipoHistoria: string, concepto: string, poseOverride?: string): string {
  const posesDisponibles = POSES_HISTORIA[tipoHistoria] || POSES_HISTORIA.comunidad!;
  const pose = poseOverride || posesDisponibles[Math.floor(Math.random() * posesDisponibles.length)];

  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles) para una HISTORIA de red social de WebMakerLatam.

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores o gráficos abstractos, JAMÁS texto legible. Esta regla no tiene excepciones.

PERSONAJE - ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta/polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible
- El zorro debe ocupar al menos 35% del área visual CENTRAL. Es el PROTAGONISTA absoluto
- Debe verse IDÉNTICO al de la referencia en proporciones, estilo de dibujo y nivel de detalle
- El zorro DEBE mantener el estilo FLAT CARTOON: líneas de contorno GRUESAS negras, colores PLANOS y sólidos (naranja puro, verde sólido), SIN degradados en el personaje, SIN texturas, SIN sombras realistas
- POSE Y EXPRESIÓN OBLIGATORIA para esta historia: ${pose}

CONTEXTO DE LA HISTORIA:
TIPO: "${tipoHistoria}"
CONCEPTO CLAVE: "${concepto}"
Adapta los objetos/iconos de la escena al concepto clave, pero NUNCA escribas el concepto como texto en la imagen.

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
- El 20% SUPERIOR (0px a 384px) debe ser fondo limpio SIN elementos - reservado para logo/handle
- El 25% INFERIOR (1440px a 1920px) debe ser fondo limpio SIN elementos - reservado para CTA/sticker
- Toda la acción visual se concentra entre el píxel 384 y 1440 (zona central)
- NADA puede existir en las zonas reservadas: ni el zorro, ni objetos, ni sombras, ni líneas

COMPOSICIÓN:
- El zorro ocupa el centro vertical de la imagen (entre píxeles 500 y 1400 aprox.)
- 1-3 objetos/iconos flotantes acompañan al zorro, relacionados al tipo de contenido
- Composición LIMPIA y respirable, estilo "sticker premium"

FONDO PREMIUM:
- Color base: gradiente radial desde el centro con #1E293B (slate 800) hacia #0F172A (slate 900) en los bordes
- Grid geométrico muy sutil (líneas blancas al 3-5% de opacidad)
- Glow ambiental naranja (#E86A30 al 20% de opacidad) con blur amplio detrás del zorro como halo
- Pequeñas partículas de luz flotantes (3-5 puntitos blancos difusos)
- Las zonas superior (20%) e inferior (25%) mantienen el tono oscuro limpio sin elementos

PALETA:
- Fondo: slate oscuros (#0F172A, #1E293B) con glow naranja difuso
- Zorro: naranja vibrante PLANO, verde sólido en camiseta, líneas gruesas negras
- Objetos: colores planos vibrantes, contornos gruesos negros

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte.`;
}

const SYSTEM_PROMPT_HISTORIA_TEXTO = `Eres el Community Manager de WebMakerLatam, comunidad latina de devs. Tu mascota es Webi (zorro naranja con lentes).

Genera el TEXTO que va a acompañar una HISTORIA (story 9:16) en redes. Reglas estrictas:

- copy_principal: 1-2 líneas, MÁXIMO 80 caracteres totales, hook potente para la zona superior
- sub_copy: 1 línea de contexto, MÁXIMO 100 caracteres, para la zona inferior
- cta: llamada a acción corta y específica, MÁXIMO 35 caracteres (ej: "Guarda este tip", "Comenta tu fav")
- hashtags: 3-5 hashtags relevantes incluyendo al menos 1 de marca (#WebMakerLatam, #WebMaker, #ComunidadWebMaker)

Tono: cercano, latino, entusiasta, sin cringe. Habla de "tú". Emojis con moderación (0-2 totales).

FORMATO DE SALIDA: SOLO un objeto JSON válido, sin markdown, sin texto adicional. Estructura:
{ "copy_principal": "...", "sub_copy": "...", "cta": "...", "hashtags": "#... #..." }`;

async function generarTextoHistoria(tipoHistoria: string, concepto: string): Promise<{
  copy_principal: string;
  sub_copy: string;
  cta: string;
  hashtags: string;
}> {
  const userMessage = `TIPO de historia: ${tipoHistoria}
CONCEPTO: ${concepto}

Genera el JSON con copy_principal, sub_copy, cta y hashtags. Solo el JSON.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT_HISTORIA_TEXTO,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content[0];
  const raw = block && block.type === "text" ? block.text.trim() : "";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    copy_principal: String(parsed.copy_principal || "").slice(0, 90),
    sub_copy: String(parsed.sub_copy || "").slice(0, 110),
    cta: String(parsed.cta || "").slice(0, 40),
    hashtags: String(parsed.hashtags || ""),
  };
}

async function renderTextoEnHistoria(
  imagenBase64: string,
  texto: { copy_principal: string; sub_copy: string; cta: string; hashtags: string },
): Promise<string> {
  const imgBuffer = Buffer.from(imagenBase64, "base64");
  const meta = await sharp(imgBuffer).metadata();
  const w = meta.width || 1080;
  const h = meta.height || 1920;

  const principalLines = wrapText(texto.copy_principal, 18);
  const subLines = wrapText(texto.sub_copy, 26);

  const principalFontSize = principalLines.length === 1 ? 92 : 76;
  const principalLineHeight = principalFontSize * 1.15;
  const principalStartY = 130 + (principalLines.length === 1 ? 60 : 30);

  const subFontSize = 38;
  const ctaFontSize = 44;
  const hashFontSize = 28;

  const bottomZoneTop = h * 0.78;
  const subStartY = bottomZoneTop + 40;
  const ctaY = subStartY + (subLines.length * subFontSize * 1.2) + 50;
  const hashY = ctaY + 60;

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
        <feOffset dx="0" dy="3" result="offsetblur"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.85"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <style>
      .principal { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 900; fill: #ffffff; }
      .sub { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 600; fill: #f1f5f9; }
      .cta { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 800; fill: #ffffff; }
      .hash { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 500; fill: #fb923c; }
    </style>
    ${principalLines.map((line, i) => `
      <text x="${w / 2}" y="${principalStartY + i * principalLineHeight}" text-anchor="middle"
        class="principal" font-size="${principalFontSize}" filter="url(#ds)">${escapeXml(line)}</text>
    `).join("")}
    ${subLines.map((line, i) => `
      <text x="${w / 2}" y="${subStartY + i * subFontSize * 1.2}" text-anchor="middle"
        class="sub" font-size="${subFontSize}" filter="url(#ds)">${escapeXml(line)}</text>
    `).join("")}
    ${texto.cta ? `<rect x="${w / 2 - 230}" y="${ctaY - 50}" width="460" height="72" rx="36" fill="#E86A30" filter="url(#ds)"/>
    <text x="${w / 2}" y="${ctaY}" text-anchor="middle" class="cta" font-size="${ctaFontSize}">${escapeXml(texto.cta)}</text>` : ""}
    ${texto.hashtags ? `<text x="${w / 2}" y="${hashY + 40}" text-anchor="middle" class="hash" font-size="${hashFontSize}">${escapeXml(texto.hashtags)}</text>` : ""}
  </svg>`;

  const composed = await sharp(imgBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return composed.toString("base64");
}

const GenerarHistoriaBody = z.object({
  tipo_historia: z.enum(["tip_tech", "motivacional", "comunidad"]),
  concepto: z.string().min(1).max(200),
  pose_override: z.string().optional(),
  texto_en_imagen: z.boolean().optional().default(false),
});

router.post("/community/historias/generar", async (req, res) => {
  try {
    const body = GenerarHistoriaBody.parse(req.body);
    const prompt = buildHistoriaPrompt(body.tipo_historia, body.concepto, body.pose_override);
    const referenceBase64 = await getFoxRefBase64();

    const contents = referenceBase64
      ? [{
          role: "user" as const,
          parts: [
            { inlineData: { data: referenceBase64, mimeType: "image/png" } },
            { text: prompt },
          ],
        }]
      : [{ role: "user" as const, parts: [{ text: prompt }] }];

    const [imageResp, texto] = await Promise.all([
      ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents,
        config: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      generarTextoHistoria(body.tipo_historia, body.concepto),
    ]);

    const imagePart = imageResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imagePart?.inlineData?.data) {
      res.status(502).json({ success: false, error: "Gemini no devolvió imagen" });
      return;
    }

    let imgBase64 = imagePart.inlineData.data as string;
    const mime = imagePart.inlineData.mimeType || "image/png";

    if (body.texto_en_imagen) {
      try {
        imgBase64 = await renderTextoEnHistoria(imgBase64, texto);
      } catch (e) {
        console.error("[Historias] render texto fallo:", e);
      }
    }

    const imagenDataUrl = `data:${body.texto_en_imagen ? "image/png" : mime};base64,${imgBase64}`;

    const [row] = await db
      .insert(communityContent)
      .values({
        kind: "historia",
        subtype: body.tipo_historia,
        topic: body.concepto,
        data: {
          tipo_historia: body.tipo_historia,
          concepto: body.concepto,
          pose: body.pose_override || "aleatoria",
          texto,
          texto_en_imagen: body.texto_en_imagen,
        },
        imageUrl: imagenDataUrl,
      })
      .returning();

    res.json({
      success: true,
      data: {
        id: row!.id,
        imagen: imagenDataUrl,
        tipo_historia: body.tipo_historia,
        concepto: body.concepto,
        texto,
        texto_en_imagen: body.texto_en_imagen,
        fecha: row!.createdAt,
      },
    });
  } catch (err: any) {
    console.error("[Historias] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.get("/community/historias", async (_req, res) => {
  const rows = await db.select().from(communityContent)
    .where(eq(communityContent.kind, "historia"))
    .orderBy(desc(communityContent.createdAt));
  res.json({ success: true, data: rows });
});

router.delete("/community/historias/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ success: false, error: "id inválido" }); return; }
  await db.delete(communityContent).where(eq(communityContent.id, id));
  res.json({ success: true });
});

// ============================================
// DESCRIPCIONES (Claude + imágenes)
// ============================================

const SYSTEM_PROMPT_DESC = `Eres el Community Manager oficial de WebMakerLatam, una comunidad de desarrolladores y creadores de contenido tech en Latinoamérica. Tu mascota es un zorro naranja con lentes llamado "Webi".

TU TAREA:
Generar descripciones para publicaciones en redes sociales que mantengan VIVA la comunidad, generen engagement y refuercen la identidad de marca. Cuando se solicite carrusel, también generar los textos para cada slide.

REGLAS DE ESCRITURA (NO NEGOCIABLES):
1. MÁXIMO 5 LÍNEAS por descripción
2. Tono cercano, entusiasta, latino, sin cringe
3. SIEMPRE incluir pregunta o CTA al final para generar comentarios
4. Emojis con moderación (máximo 3-4)
5. Evitar frases genéricas tipo "dale like y suscríbete"
6. Hablar de "tú"

ESTRUCTURA POR RED:
📱 TIKTOK: hook + 1-2 líneas + CTA + 5-7 hashtags (mezcla nicho+trending+marca)
📸 INSTAGRAM: hook emocional + 3-4 líneas con valor + pregunta + 8-12 hashtags
▶️ YOUTUBE SHORTS: keyword en línea 1 + descripción clara + CTA + 4-6 hashtags (#shorts obligatorio)
🐦 X/TWITTER: MÁX 280 caracteres totales incluyendo hashtags. Hook punzante + insight + 2-3 hashtags

HASHTAGS DE MARCA: #WebMakerLatam #WebMaker #ComunidadWebMaker (al menos 2 excepto Twitter donde es opcional)

SLIDES DEL CARRUSEL (cuando se solicite):
- Slide 1 (rol "portada"): hook visual potente. titulo: máx 50 chars. subtitulo: máx 70 chars
- Slides intermedias (rol "desarrollo"): cada una con UN punto/paso/idea concreto. titulo: máx 50 chars. subtitulo: máx 90 chars
- Slide final (rol "cta"): invita a comentar/guardar/seguir. titulo: máx 40 chars. subtitulo: máx 80 chars
- Para post único (rol "unica"): 1 sola slide con titulo+subtitulo

FORMATO DE SALIDA (JSON ESTRICTO, sin markdown, sin texto adicional):
{
  "redes": {
    "tiktok": { "descripcion": "...", "hashtags": "#... #..." },
    "instagram": { "descripcion": "...", "hashtags": "#... #..." },
    "youtube_shorts": { "descripcion": "...", "hashtags": "#... #..." },
    "twitter": { "post_completo": "..." }
  },
  "slides": [
    { "numero": 1, "rol": "portada", "titulo": "...", "subtitulo": "...", "prompt_visual": "descripción breve del foco visual de esta slide en español, sin texto" }
  ]
}

Solo incluye en "redes" las que fueron solicitadas. Siempre incluye "slides" con la cantidad pedida.`;

const GenerarDescripcionesBody = z.object({
  tema: z.string().min(1).max(300),
  tipo_contenido: z.string().min(1),
  redes: z.array(z.enum(["tiktok", "instagram", "youtube_shorts", "twitter"])).min(1),
  tipo_publicacion: z.enum(["unica", "carrusel"]).default("unica"),
  cantidad_slides: z.number().int().min(1).max(5).default(1),
  texto_en_imagen: z.boolean().optional().default(false),
});

type SlideRol = "portada" | "desarrollo" | "cta" | "unica";
interface SlidePlan {
  numero: number;
  rol: SlideRol;
  titulo: string;
  subtitulo: string;
  prompt_visual?: string;
}

function buildSlidePrompt(
  tema: string,
  tipoContenido: string,
  slide: SlidePlan,
  formato: "1:1" | "4:5",
): string {
  const dims = formato === "1:1" ? "1080x1080 píxeles formato cuadrado 1:1" : "1080x1350 píxeles formato vertical 4:5";

  const rolDescripcion = {
    portada: "PORTADA del carrusel: el zorro Webi es protagonista absoluto, expresión de hook potente que invita a deslizar. El zorro ocupa al menos 40% del área central.",
    desarrollo: "SLIDE DE DESARROLLO: enfocada en el contenido (iconos, diagramas, elementos visuales del tema). El zorro Webi puede estar pequeño en una esquina o ausente. Lo importante es ilustrar el punto del slide.",
    cta: "SLIDE FINAL DE CTA: el zorro Webi es protagonista, invitando a comentar/seguir/guardar con expresión cálida y brazos abiertos o señalando hacia adelante. El zorro ocupa al menos 40% del área central.",
    unica: "PUBLICACIÓN ÚNICA: el zorro Webi es protagonista absoluto en una escena que ilustra el tema. El zorro ocupa al menos 35% del área central.",
  }[slide.rol];

  const enfoqueVisual = slide.prompt_visual || `escena que ilustra: ${slide.titulo}`;

  return `Genera una ilustración en ${dims} para una publicación de WebMakerLatam.

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo ni texto en la imagen. CERO caracteres alfanuméricos. Si hay pantallas, deben mostrar formas abstractas, nunca texto legible.

PERSONAJE - ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico llamado Webi, con lentes rectangulares negros gruesos y polera verde oscuro
- Estilo FLAT CARTOON: líneas de contorno GRUESAS negras, colores PLANOS sólidos (naranja vibrante, verde), SIN degradados ni texturas en el personaje
- Debe verse IDÉNTICO a la referencia en proporciones, estilo y nivel de detalle

ROL DE ESTA SLIDE:
${rolDescripcion}

TEMA GENERAL DE LA PUBLICACIÓN: "${tema}" (${tipoContenido})
ENFOQUE VISUAL DE ESTA SLIDE ESPECÍFICA: ${enfoqueVisual}

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO):
- 22% SUPERIOR: fondo limpio sin elementos (reservado para título)
- 22% INFERIOR: fondo limpio sin elementos (reservado para subtítulo/CTA)
- Toda la acción visual se concentra en el centro

FONDO PREMIUM:
- Gradiente radial desde el centro: #1E293B (slate 800) hacia #0F172A (slate 900) en los bordes
- Grid geométrico muy sutil (líneas blancas al 3-5% opacidad)
- Glow ambiental naranja (#E86A30 al 20% opacidad) detrás del foco como halo
- 3-5 partículas de luz blancas difusas

PALETA: Fondo slate oscuro con glow naranja. Zorro: naranja PLANO + verde sólido + líneas negras gruesas. Objetos: colores planos vibrantes con contornos negros.

CONSISTENCIA: Esta slide debe verse del MISMO universo visual que las demás del carrusel (mismo fondo, paleta, estilo).

RECUERDA: CERO TEXTO. Ni una letra ni número en NINGUNA parte.`;
}

async function generarImagenSlide(
  tema: string,
  tipoContenido: string,
  slide: SlidePlan,
  formato: "1:1" | "4:5",
  referenceBase64: string | null,
): Promise<string> {
  const prompt = buildSlidePrompt(tema, tipoContenido, slide, formato);

  const contents = referenceBase64
    ? [{
        role: "user" as const,
        parts: [
          { inlineData: { data: referenceBase64, mimeType: "image/png" } },
          { text: prompt },
        ],
      }]
    : [{ role: "user" as const, parts: [{ text: prompt }] }];

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents,
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!imagePart?.inlineData?.data) {
    throw new Error(`Gemini no devolvió imagen para slide ${slide.numero}`);
  }
  return imagePart.inlineData.data as string;
}

async function generarImagenSlideConRetry(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null,
): Promise<string> {
  try {
    return await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64);
  } catch (e) {
    console.warn(`[Descripciones] retry slide ${slide.numero}:`, (e as Error).message);
    return await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64);
  }
}

async function renderTextoEnSlide(
  imagenBase64: string,
  slide: SlidePlan,
): Promise<string> {
  const imgBuffer = Buffer.from(imagenBase64, "base64");
  const meta = await sharp(imgBuffer).metadata();
  const w = meta.width || 1080;
  const h = meta.height || 1350;

  const tituloLines = wrapText(slide.titulo, 22);
  const subLines = wrapText(slide.subtitulo, 30);

  const tituloFontSize = tituloLines.length === 1 ? 72 : 60;
  const tituloLineHeight = tituloFontSize * 1.15;
  const tituloStartY = 90 + tituloFontSize;

  const subFontSize = 36;
  const subLineHeight = subFontSize * 1.25;
  const subStartY = h - (h * 0.18) + 20;

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ds2" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="5"/>
        <feOffset dx="0" dy="3" result="offsetblur"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.85"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <style>
      .titulo { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 900; fill: #ffffff; }
      .sub { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 600; fill: #f1f5f9; }
    </style>
    ${tituloLines.map((line, i) => `
      <text x="${w / 2}" y="${tituloStartY + i * tituloLineHeight}" text-anchor="middle"
        class="titulo" font-size="${tituloFontSize}" filter="url(#ds2)">${escapeXml(line)}</text>
    `).join("")}
    ${subLines.map((line, i) => `
      <text x="${w / 2}" y="${subStartY + i * subLineHeight}" text-anchor="middle"
        class="sub" font-size="${subFontSize}" filter="url(#ds2)">${escapeXml(line)}</text>
    `).join("")}
  </svg>`;

  const composed = await sharp(imgBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toBuffer();
  return composed.toString("base64");
}

router.post("/community/descripciones/generar", async (req, res) => {
  try {
    const body = GenerarDescripcionesBody.parse(req.body);
    const cantidad = body.tipo_publicacion === "carrusel"
      ? Math.max(3, Math.min(5, body.cantidad_slides))
      : 1;
    const formato: "1:1" | "4:5" = body.tipo_publicacion === "carrusel" ? "4:5" : "1:1";

    const userMessage = `TEMA: ${body.tema}
TIPO de contenido: ${body.tipo_contenido}
REDES solicitadas: ${body.redes.join(", ")}
TIPO de publicación: ${body.tipo_publicacion}
CANTIDAD de slides: ${cantidad}

Genera el JSON con "redes" (solo las solicitadas) y "slides" (${cantidad} slide${cantidad > 1 ? "s" : ""}).
${body.tipo_publicacion === "carrusel"
  ? `La slide 1 debe ser rol "portada", la última rol "cta", las del medio rol "desarrollo".`
  : `La única slide debe ser rol "unica".`}
Solo el JSON.`;

    const claudeResp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT_DESC,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = claudeResp.content[0];
    const raw = block && block.type === "text" ? block.text.trim() : "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let claudeData: any;
    try {
      claudeData = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ success: false, error: "La IA no devolvió JSON válido. Intenta de nuevo.", raw: cleaned });
      return;
    }

    const slidesPlan: SlidePlan[] = Array.isArray(claudeData.slides) && claudeData.slides.length > 0
      ? claudeData.slides.slice(0, cantidad).map((s: any, i: number): SlidePlan => ({
          numero: s.numero || i + 1,
          rol: (s.rol as SlideRol) || (cantidad === 1 ? "unica" : (i === 0 ? "portada" : i === cantidad - 1 ? "cta" : "desarrollo")),
          titulo: String(s.titulo || "").slice(0, 70),
          subtitulo: String(s.subtitulo || "").slice(0, 110),
          prompt_visual: s.prompt_visual ? String(s.prompt_visual).slice(0, 200) : undefined,
        }))
      : Array.from({ length: cantidad }, (_, i): SlidePlan => ({
          numero: i + 1,
          rol: cantidad === 1 ? "unica" : (i === 0 ? "portada" : i === cantidad - 1 ? "cta" : "desarrollo"),
          titulo: body.tema.slice(0, 70),
          subtitulo: "",
        }));

    const referenceBase64 = await getFoxRefBase64();

    const settled = await Promise.allSettled(
      slidesPlan.map((s) => generarImagenSlideConRetry(body.tema, body.tipo_contenido, s, formato, referenceBase64)),
    );

    const imagenes = await Promise.all(
      slidesPlan.map(async (slide, idx) => {
        const r = settled[idx]!;
        if (r.status === "rejected") {
          return {
            numero_slide: slide.numero,
            rol: slide.rol,
            titulo: slide.titulo,
            subtitulo: slide.subtitulo,
            imagen: null,
            error: (r.reason as Error)?.message || "Falló la generación",
          };
        }
        let imgBase64 = r.value;
        if (body.texto_en_imagen) {
          try {
            imgBase64 = await renderTextoEnSlide(imgBase64, slide);
          } catch (e) {
            console.error("[Descripciones] render texto fallo slide", slide.numero, e);
          }
        }
        return {
          numero_slide: slide.numero,
          rol: slide.rol,
          titulo: slide.titulo,
          subtitulo: slide.subtitulo,
          imagen: `data:image/png;base64,${imgBase64}`,
        };
      }),
    );

    const descripciones = claudeData.redes || {};

    const [row] = await db.insert(communityContent).values({
      kind: "descripcion",
      subtype: body.tipo_contenido,
      topic: body.tema,
      data: {
        tema: body.tema,
        tipo_contenido: body.tipo_contenido,
        redes: body.redes,
        tipo_publicacion: body.tipo_publicacion,
        cantidad_slides: cantidad,
        texto_en_imagen: body.texto_en_imagen,
        descripciones,
        slides_textos: slidesPlan,
      },
      imageUrl: imagenes.find((i) => i.imagen)?.imagen || null,
    }).returning();

    res.json({
      success: true,
      data: {
        id: row!.id,
        fecha: row!.createdAt,
        tema: body.tema,
        tipo_contenido: body.tipo_contenido,
        tipo_publicacion: body.tipo_publicacion,
        texto_en_imagen: body.texto_en_imagen,
        imagenes,
        descripciones,
      },
    });
  } catch (err: any) {
    console.error("[Descripciones] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

// Reintentar UNA slide específica del carrusel
const ReintentarSlideBody = z.object({
  tema: z.string().min(1).max(300),
  tipo_contenido: z.string().min(1),
  numero_slide: z.number().int().min(1).max(5),
  rol: z.enum(["portada", "desarrollo", "cta", "unica"]),
  titulo: z.string().max(120),
  subtitulo: z.string().max(200),
  prompt_visual: z.string().max(300).optional(),
  formato: z.enum(["1:1", "4:5"]).default("4:5"),
  texto_en_imagen: z.boolean().optional().default(false),
});

router.post("/community/descripciones/reintentar-slide", async (req, res) => {
  try {
    const body = ReintentarSlideBody.parse(req.body);
    const slide: SlidePlan = {
      numero: body.numero_slide,
      rol: body.rol,
      titulo: body.titulo,
      subtitulo: body.subtitulo,
      prompt_visual: body.prompt_visual,
    };
    const referenceBase64 = await getFoxRefBase64();
    let imgBase64 = await generarImagenSlideConRetry(body.tema, body.tipo_contenido, slide, body.formato, referenceBase64);
    if (body.texto_en_imagen) {
      try { imgBase64 = await renderTextoEnSlide(imgBase64, slide); } catch {}
    }
    res.json({
      success: true,
      data: {
        numero_slide: slide.numero,
        rol: slide.rol,
        titulo: slide.titulo,
        subtitulo: slide.subtitulo,
        imagen: `data:image/png;base64,${imgBase64}`,
      },
    });
  } catch (err: any) {
    console.error("[Reintentar slide] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.get("/community/descripciones", async (_req, res) => {
  const rows = await db.select().from(communityContent)
    .where(eq(communityContent.kind, "descripcion"))
    .orderBy(desc(communityContent.createdAt));
  res.json({ success: true, data: rows });
});

router.delete("/community/descripciones/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ success: false, error: "id inválido" }); return; }
  await db.delete(communityContent).where(eq(communityContent.id, id));
  res.json({ success: true });
});

export default router;
