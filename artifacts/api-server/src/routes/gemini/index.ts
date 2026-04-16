import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import {
  CreateGeminiConversationBody,
  SendGeminiMessageBody,
  GenerateGeminiImageBody,
  GenerateCoverBody,
} from "@workspace/api-zod";
import { readFile } from "fs/promises";
import path from "path";

const router: IRouter = Router();

router.get("/gemini/conversations", async (_req, res) => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  res.json(rows);
});

router.post("/gemini/conversations", async (req, res) => {
  const body = CreateGeminiConversationBody.parse(req.body);
  const [row] = await db
    .insert(conversations)
    .values({ title: body.title })
    .returning();
  res.status(201).json(row);
});

router.get("/gemini/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conv.length) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json({ ...conv[0], messages: msgs });
});

router.delete("/gemini/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning();
  if (!deleted.length) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.status(204).send();
});

router.get("/gemini/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json(msgs);
});

router.post("/gemini/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const body = SendGeminiMessageBody.parse(req.body);

  const [userMsg] = await db
    .insert(messages)
    .values({ conversationId: id, role: "user", content: body.content })
    .returning();

  const chatHistory = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: chatHistory.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: { maxOutputTokens: 8192 },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    await db
      .insert(messages)
      .values({
        conversationId: id,
        role: "assistant",
        content: fullResponse,
      });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(
      `data: ${JSON.stringify({ error: error.message || "Stream error" })}\n\n`
    );
    res.end();
  }
});

router.post("/gemini/generate-image", async (req, res) => {
  const body = GenerateGeminiImageBody.parse(req.body);
  try {
    const { b64_json, mimeType } = await generateImage(body.prompt);
    res.json({ b64_json, mimeType });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Image generation failed" });
  }
});

router.post("/gemini/generate-cover", async (req, res) => {
  const body = GenerateCoverBody.parse(req.body);

  const basePrompt = `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores o gráficos abstractos, JAMÁS texto legible. Esta regla no tiene excepciones.

PERSONAJE - ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta/polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible
- El zorro debe ocupar al menos 40% del área visual inferior. Es el PROTAGONISTA, no un elemento secundario
- Debe verse IDÉNTICO al de la referencia en proporciones, estilo de dibujo y nivel de detalle
- El zorro DEBE mantener el estilo FLAT CARTOON de la referencia: líneas de contorno GRUESAS negras, colores PLANOS y sólidos (naranja puro, verde sólido), SIN degradados en el personaje, SIN texturas, SIN sombras realistas. El zorro es un cartoon simple y limpio
- Expresiones faciales variadas según la escena (confiado, sorprendido, feliz, preocupado, relajado)

CONTEXTO DE LA ESCENA (usar como referencia visual, NO como texto):
TÍTULO: "${body.title}"
${body.description ? `DESCRIPCIÓN: "${body.description}"` : ""}
${body.style ? `ESTILO ADICIONAL: ${body.style}` : ""}
Adapta la escena al contexto del título y descripción. Los objetos y elementos deben ser RELEVANTES al tema y contar una historia visual clara. NO escribas el título ni la descripción como texto en la imagen.

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
- El ZORRO y los OBJETOS/ICONOS se dibujan en estilo FLAT CARTOON: líneas de contorno gruesas negras, colores planos y vibrantes, sin degradados, sin sombras realistas
- El FONDO es premium y oscuro con efectos de iluminación elegantes (ver abajo)
- Este contraste entre personaje cartoon sobre fondo premium es intencional y crea un look moderno y llamativo

FONDO PREMIUM (solo el fondo, NO el personaje):
- Color base: gradiente vertical muy sutil de #0F172A (slate 900) en la parte inferior a #1E293B (slate 800) en el centro
- Elementos de fondo: grid geométrico muy sutil (líneas blancas al 3-5% de opacidad)
- Un glow ambiental suave y difuso detrás del zorro en tono naranja cálido (#E86A30 al 15-20% de opacidad) con blur amplio, como un halo de luz
- La zona superior (35%) mantiene el mismo tono oscuro limpio sin elementos

PALETA:
- Fondo: tonos slate oscuros (#0F172A, #1E293B) con glow naranja difuso
- Zorro: naranja vibrante PLANO (como la referencia), verde sólido en la camiseta, líneas gruesas negras
- Objetos: colores planos y vibrantes estilo flat icon (naranja, verde, blanco, azul, rojo), con contornos gruesos negros

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte de la imagen. El zorro debe verse EXACTAMENTE como en la referencia (flat cartoon), pero sobre un fondo oscuro premium elegante.`;

  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [5000, 15000, 30000];

  function isRateLimitError(err: any): boolean {
    const msg = typeof err?.message === "string" ? err.message : "";
    return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Resource exhausted");
  }

  async function attemptGenerate(attempt: number): Promise<{ b64_json: string; mimeType: string }> {
    console.log(`[CoverGen] Attempt ${attempt}/${MAX_RETRIES}...`);
    try {
      if (body.referenceImageBase64) {
        const response = await ai.models.generateContent({
          model: "gemini-3-pro-image-preview",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: body.referenceImageBase64,
                    mimeType: "image/png",
                  },
                },
                { text: basePrompt },
              ],
            },
          ],
          config: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        });

        const candidate = response.candidates?.[0];
        const imagePart = candidate?.content?.parts?.find(
          (part: any) => part.inlineData
        );

        if (!imagePart?.inlineData?.data) {
          throw new Error("Gemini no devolvió imagen en este intento");
        }

        return {
          b64_json: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType || "image/png",
        };
      } else {
        return await generateImage(basePrompt);
      }
    } catch (err: any) {
      const rateLimited = isRateLimitError(err);
      console.warn(`[CoverGen] Attempt ${attempt} failed (rate_limit=${rateLimited}): ${err.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = rateLimited
          ? RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]
          : 2000 * attempt;
        console.log(`[CoverGen] Waiting ${delay / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, delay));
        return attemptGenerate(attempt + 1);
      }
      if (rateLimited) {
        throw new Error("RATE_LIMIT");
      }
      throw err;
    }
  }

  try {
    const result = await attemptGenerate(1);
    console.log(`[CoverGen] Cover generated, compositing title overlay...`);

    const sharp = (await import("sharp")).default;

    const COVER_WIDTH = 1080;
    const COVER_HEIGHT = 1920;
    const TEXT_ZONE_TOP = 60;
    const TEXT_ZONE_BOTTOM = 630;
    const TEXT_ZONE_HEIGHT = TEXT_ZONE_BOTTOM - TEXT_ZONE_TOP;
    const TEXT_ZONE_SIDE_PADDING = 60;

    function splitLines(text: string, max: number): string[] {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        if (!cur) cur = w;
        else if ((cur + " " + w).length <= max) cur += " " + w;
        else { lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      return lines;
    }

    function escXml(s: string) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    }

    const cleanTitle = body.title.replace(/\*\*/g, "").toUpperCase().trim();
    const lines = splitLines(cleanTitle, 15).slice(0, 5);
    const lineCount = lines.length;

    let fontSize = lineCount <= 2 ? 115 : lineCount <= 3 ? 100 : lineCount <= 4 ? 85 : 72;
    const maxTextWidth = COVER_WIDTH - TEXT_ZONE_SIDE_PADDING * 2;
    const maxLineChars = Math.max(...lines.map(l => l.length));
    const estimatedWidth = maxLineChars * fontSize * 0.58;
    if (estimatedWidth > maxTextWidth) fontSize = Math.floor(fontSize * (maxTextWidth / estimatedWidth));

    const lineHeight = fontSize * 1.18;
    const totalTextHeight = lineCount * lineHeight;
    const startY = TEXT_ZONE_TOP + (TEXT_ZONE_HEIGHT - totalTextHeight) / 2 + fontSize * 0.85;

    const fontPath = path.join(process.cwd(), "public", "fonts", "LuckiestGuy-Regular.ttf");
    const fontBuffer = await readFile(fontPath);
    const fontBase64 = fontBuffer.toString("base64");

    const shadowOff = Math.max(4, Math.round(fontSize * 0.05));
    const textEls = lines.map((line, i) => {
      const y = startY + i * lineHeight;
      const esc = escXml(line);
      return `<text x="${COVER_WIDTH / 2 + shadowOff}" y="${y + shadowOff}" text-anchor="middle" font-family="LuckiestGuy" font-size="${fontSize}" fill="#E86A30" opacity="0.85">${esc}</text>
    <text x="${COVER_WIDTH / 2}" y="${y}" text-anchor="middle" font-family="LuckiestGuy" font-size="${fontSize}" fill="white">${esc}</text>`;
    }).join("\n    ");

    const svgOverlay = `<svg width="${COVER_WIDTH}" height="${COVER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>@font-face { font-family: 'LuckiestGuy'; src: url('data:font/ttf;base64,${fontBase64}'); }</style></defs>
    ${textEls}
  </svg>`;

    const baseImgBuf = Buffer.from(result.b64_json, "base64");
    const composited = await sharp(baseImgBuf)
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover" })
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .png()
      .toBuffer();

    const finalB64 = composited.toString("base64");
    console.log(`[CoverGen] Cover with title overlay generated successfully`);
    res.json({ b64_json: finalB64, mimeType: "image/png" });
  } catch (error: any) {
    console.error(`[CoverGen] All ${MAX_RETRIES} attempts failed: ${error.message}`);
    if (error.message === "RATE_LIMIT") {
      res.status(429).json({ error: "El servicio de IA está saturado en este momento. Espera 1-2 minutos e intenta de nuevo." });
    } else {
      res.status(500).json({ error: "No se pudo generar la portada. Intenta de nuevo en unos momentos." });
    }
  }
});

export default router;
