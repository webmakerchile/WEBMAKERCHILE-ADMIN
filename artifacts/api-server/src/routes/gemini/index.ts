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

  const basePrompt = `Basándote en la imagen de referencia, genera una nueva ilustración en formato vertical (relación de aspecto 9:16). Mantén estrictamente el mismo estilo de diseño plano (flat vector art), la misma paleta de colores y el mismo personaje (un zorro).

Título del contenido: "${body.title}"
Descripción: "${body.description}"
${body.style ? `Estilo adicional: ${body.style}` : ""}

La escena debe representar visualmente el tema del título y descripción.

Detalles importantes:
1. Fondo: Amarillo sólido idéntico al de la referencia.
2. Título OBLIGATORIO: En el tercio superior, agrega el texto: "${body.title.toUpperCase()}"
3. Estilo del Texto: El texto debe ser blanco, en mayúsculas, fuente sans-serif gruesa y negrita, centrado.
4. Estilo General: Minimalista, líneas limpias y colores planos.`;

  try {
    let result;
    if (body.referenceImageBase64) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
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
        throw new Error("No image data in response");
      }

      result = {
        b64_json: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType || "image/png",
      };
    } else {
      result = await generateImage(basePrompt);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Cover generation failed" });
  }
});

export default router;
