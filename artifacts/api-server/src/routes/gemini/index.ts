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
import { toFile } from "openai";
import { prepararPortada, generateFoxIllustration, composeVerticalCover, esErrorRateLimit } from "../../lib/cover-style.js";

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

  await db
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
    const stream = ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: chatHistory.map((m) => ({
        role: m.role === "assistant" ? "model" : "user" as "model" | "user",
        parts: [{ text: m.content }],
      })),
      config: { maxOutputTokens: 8192 },
    });

    for await (const chunk of await stream) {
      const text = chunk.text || "";
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

  const tema = `${body.title} ${body.description || ""}`.trim();
  const { direccion, prompt: basePrompt } = prepararPortada(tema, body.style);

  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [5000, 15000, 30000];

  function isRateLimitError(err: any): boolean {
    const msg = typeof err?.message === "string" ? err.message : "";
    return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Resource exhausted") || msg.includes("rate limit");
  }

  async function attemptGenerate(attempt: number): Promise<{ b64_json: string; mimeType: string }> {
    console.log(`[CoverGen] Attempt ${attempt}/${MAX_RETRIES}...`);
    try {
      if (body.referenceImageBase64) {
        const refBuffer = Buffer.from(body.referenceImageBase64, "base64");
        const imageFile = await toFile(refBuffer, "reference.png", { type: "image/png" });
        const response = await ai.images.edit({
          model: "gpt-image-1",
          image: imageFile,
          prompt: basePrompt,
          size: "1024x1536",
        });
        const b64_json = response.data?.[0]?.b64_json ?? "";
        if (!b64_json) throw new Error("No se recibió imagen en la respuesta");
        return { b64_json, mimeType: "image/png" };
      }
      throw new Error("attemptGenerate requiere imagen de referencia");
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
      if (rateLimited) throw new Error("RATE_LIMIT");
      throw err;
    }
  }

  try {
    // Con referencia del usuario → gpt-image-1 (edit). Sin referencia →
    // pipeline compartido Gemini con el master del zorro (reintentos internos).
    let result: { b64_json: string; mimeType: string };
    if (body.referenceImageBase64) {
      result = await attemptGenerate(1);
    } else {
      const buf = await generateFoxIllustration(basePrompt);
      result = { b64_json: buf.toString("base64"), mimeType: "image/png" };
    }
    console.log(`[CoverGen] Cover generado, componiendo titular (${direccion.id})...`);
    const composited = await composeVerticalCover(Buffer.from(result.b64_json, "base64"), body.title, direccion);
    res.json({ b64_json: composited.toString("base64"), mimeType: "image/png" });
  } catch (error: any) {
    console.error(`[CoverGen] All ${MAX_RETRIES} attempts failed: ${error.message}`);
    if (esErrorRateLimit(error)) {
      res.status(429).json({ error: "El servicio de IA está saturado en este momento. Espera 1-2 minutos e intenta de nuevo." });
    } else {
      res.status(500).json({ error: "No se pudo generar la portada. Intenta de nuevo en unos momentos." });
    }
  }
});

export default router;
