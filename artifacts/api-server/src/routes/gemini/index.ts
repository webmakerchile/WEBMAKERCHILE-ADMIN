import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversations, messages, communityContent } from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import sharp from "sharp";
import { ai, imageModel } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import {
  CreateGeminiConversationBody,
  SendGeminiMessageBody,
  GenerateGeminiImageBody,
  GenerateCoverBody,
  GenerateYoutubeCoverBody,
  ImproveCoverIdeaBody,
  AdjustCoverBody,
  ImproveAdjustInstructionBody,
  CreateCoverDraftBody,
  UpdateCoverDraftBody,
} from "@workspace/api-zod";
import { toFile } from "openai";
import { prepararPortada, generateFoxIllustration, composeVerticalCover, esErrorRateLimit, listarOpcionesPortada } from "../../lib/cover-style.js";
import { buildImproveIdeaPrompt, parseImprovedIdea } from "../../lib/improve-cover-idea.js";
import { prepararMiniaturaYoutube, composeYoutubeCover, validarFotoPersona, validarFotosPersona } from "../../lib/youtube-cover.js";
import { buildAdjustPrompt, prepararLienzoAjuste, recortarAjuste, buildImproveAdjustPrompt, parseImprovedInstruction } from "../../lib/adjust-cover.js";

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

// Catálogo de variantes de luz y poses para la UI de personalización.
router.get("/gemini/cover-options", (_req, res) => {
  res.json(listarOpcionesPortada());
});

// El usuario cuenta su idea "a lo bruto" y la IA la redacta: título corto de
// miniatura + brief visual del set (misma dirección de arte del estudio).
// Chat de ajustes: edita la imagen YA generada manteniendo todo lo demás
// intacto (la imagen actual es la referencia del edit, con fidelidad "high").
router.post("/gemini/adjust-cover", async (req, res) => {
  const parsedBody = AdjustCoverBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Ajuste inválido: la instrucción acepta hasta 1000 caracteres y la imagen debe venir en base64." });
    return;
  }
  const body = parsedBody.data;
  if (!body.instruction.trim()) {
    res.status(400).json({ error: "Escribe qué quieres cambiar de la imagen." });
    return;
  }
  const v = validarFotoPersona(body.imageBase64);
  if (!v.ok) {
    res.status(400).json({ error: v.error });
    return;
  }

  try {
    const prompt = buildAdjustPrompt(body.instruction.trim(), body.formato);
    const editSize = body.formato === "youtube" ? ("1536x1024" as const) : ("1024x1536" as const);
    // Letterbox al lienzo exacto del modelo para que NO reencuadre la escena
    // (las franjas negras se recortan después de editar).
    const conFranjas = await prepararLienzoAjuste(Buffer.from(v.base64, "base64"), body.formato);
    const buf = await generateFoxIllustration(prompt, conFranjas.toString("base64"), editSize, "image/png", "high");
    const final = await recortarAjuste(buf, body.formato);
    console.log(`[AjusteCover] Ajuste aplicado (${body.formato}): "${body.instruction.trim().slice(0, 80)}"`);
    res.json({ b64_json: final.toString("base64"), mimeType: "image/png" });
  } catch (error: any) {
    console.error(`[AjusteCover] Falló el ajuste: ${error?.message}`);
    if (esErrorRateLimit(error)) {
      res.status(429).json({ error: "La IA de imágenes está saturada en este momento. Espera un minuto y vuelve a intentarlo." });
      return;
    }
    res.status(500).json({ error: "No se pudo aplicar el ajuste a la imagen. Intenta de nuevo." });
  }
});

// Redacta la instrucción cruda del chat de ajustes antes de enviarla.
router.post("/gemini/improve-adjust-instruction", async (req, res) => {
  const parsedBody = ImproveAdjustInstructionBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Instrucción inválida: acepta hasta 1000 caracteres." });
    return;
  }
  const instruction = parsedBody.data.instruction.trim();
  if (!instruction) {
    res.status(400).json({ error: "Escribe primero qué quieres cambiar (aunque sea a lo bruto) para que la IA lo redacte." });
    return;
  }

  try {
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{ text: buildImproveAdjustPrompt(instruction, parsedBody.data.formato, parsedBody.data.title) }],
      }],
      config: { maxOutputTokens: 400 },
    });
    const mejorada = parseImprovedInstruction(resp.text ?? "");
    if (!mejorada) {
      res.status(502).json({ error: "La IA no devolvió una redacción válida. Intenta de nuevo." });
      return;
    }
    res.json({ instruction: mejorada });
  } catch (error: any) {
    console.error(`[ImproveAjuste] Falló la redacción: ${error?.message}`);
    if (esErrorRateLimit(error)) {
      res.status(429).json({ error: "La IA está saturada en este momento. Espera un minuto y vuelve a intentarlo." });
      return;
    }
    res.status(500).json({ error: "No se pudo redactar la instrucción. Intenta de nuevo." });
  }
});

router.post("/gemini/improve-cover-idea", async (req, res) => {
  // safeParse: el handler global convierte los ZodError en 500 con el dump
  // crudo — aquí queremos un 400 con mensaje amable para la UI.
  const parsedBody = ImproveCoverIdeaBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Texto demasiado largo o inválido: el título acepta hasta 200 caracteres y la idea hasta 2000." });
    return;
  }
  const title = (parsedBody.data.title ?? "").trim();
  const idea = (parsedBody.data.idea ?? "").trim();
  if (!title && !idea) {
    res.status(400).json({ error: "Cuenta primero tu idea (aunque sea a lo bruto) para que la IA la redacte." });
    return;
  }

  try {
    const catalogo = listarOpcionesPortada();
    const formato = parsedBody.data.formato ?? "vertical";
    const plantillasFormato = catalogo.plantillas.filter((p) => p.formato === formato);
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: buildImproveIdeaPrompt(title, idea, catalogo.direcciones, {
            formato: parsedBody.data.formato,
            conPersona: parsedBody.data.conPersona,
            plantillas: plantillasFormato,
            estilosTitular: catalogo.estilosTitular,
          }),
        }],
      }],
      config: { maxOutputTokens: 900 },
    });
    const parsed = parseImprovedIdea(
      resp.text ?? "",
      catalogo.direcciones.map((d) => d.id),
      plantillasFormato.map((p) => p.id),
      catalogo.estilosTitular.map((e) => e.id),
    );
    if (!parsed) {
      res.status(502).json({ error: "La IA no devolvió una redacción válida. Intenta de nuevo." });
      return;
    }
    res.json(parsed);
  } catch (error: any) {
    console.error(`[ImproveIdea] Falló la redacción: ${error?.message}`);
    if (esErrorRateLimit(error)) {
      res.status(429).json({ error: "El servicio de IA está saturado en este momento. Espera un momento e intenta de nuevo." });
    } else {
      res.status(502).json({ error: "No se pudo redactar la idea. Intenta de nuevo en unos momentos." });
    }
  }
});

router.post("/gemini/generate-cover", async (req, res) => {
  // safeParse: el handler global convierte los ZodError en 500 con el dump
  // crudo — aquí queremos un 400 con mensaje amable para la UI.
  const parsedCover = GenerateCoverBody.safeParse(req.body);
  if (!parsedCover.success) {
    res.status(400).json({ error: "Datos inválidos para la portada: revisa el título, la descripción y los campos del set." });
    return;
  }
  const body = parsedCover.data;

  const catalogo = listarOpcionesPortada();
  if (body.direccionId && !catalogo.direcciones.some(d => d.id === body.direccionId)) {
    res.status(400).json({ error: `direccionId inválido: ${body.direccionId}` });
    return;
  }
  if (body.poseId && !catalogo.poses.some(p => p.id === body.poseId)) {
    res.status(400).json({ error: `poseId inválido: ${body.poseId}` });
    return;
  }
  if (body.plantillaId && !catalogo.plantillas.some(p => p.id === body.plantillaId && p.formato === "vertical")) {
    res.status(400).json({ error: `plantillaId inválido para formato vertical: ${body.plantillaId}` });
    return;
  }
  if (body.estiloTitularId && !catalogo.estilosTitular.some(e => e.id === body.estiloTitularId)) {
    res.status(400).json({ error: `estiloTitularId inválido: ${body.estiloTitularId}` });
    return;
  }

  // Validar la imagen de referencia personalizada antes de gastar IA.
  let refValidada: { base64: string; mime: string } | null = null;
  if (body.referenceImageBase64) {
    const v = validarFotoPersona(body.referenceImageBase64);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }
    refValidada = { base64: v.base64, mime: v.mime };
  }

  const tema = `${body.title} ${body.description || ""}`.trim();
  const { direccion, plantilla, estiloTitular, prompt: basePrompt } = prepararPortada(tema, body.style, {
    direccionId: body.direccionId,
    poseId: body.poseId,
    plantillaId: body.plantillaId,
    estiloTitularId: body.estiloTitularId,
    utileria: body.utileria,
  });

  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [5000, 15000, 30000];

  function isRateLimitError(err: any): boolean {
    const msg = typeof err?.message === "string" ? err.message : "";
    return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Resource exhausted") || msg.includes("rate limit");
  }

  async function attemptGenerate(attempt: number): Promise<{ b64_json: string; mimeType: string }> {
    console.log(`[CoverGen] Attempt ${attempt}/${MAX_RETRIES}...`);
    try {
      if (refValidada) {
        const refBuffer = Buffer.from(refValidada.base64, "base64");
        const ext = refValidada.mime.includes("jpeg") ? "jpg" : refValidada.mime.includes("webp") ? "webp" : "png";
        const imageFile = await toFile(refBuffer, `reference.${ext}`, { type: refValidada.mime });
        const response = await ai.images.edit({
          model: imageModel(),
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
    if (refValidada) {
      result = await attemptGenerate(1);
    } else {
      const buf = await generateFoxIllustration(basePrompt);
      result = { b64_json: buf.toString("base64"), mimeType: "image/png" };
    }
    console.log(`[CoverGen] Cover generado, componiendo titular (${direccion.id}, plantilla ${plantilla.id}, estilo ${estiloTitular.id})...`);
    const composited = await composeVerticalCover(Buffer.from(result.b64_json, "base64"), body.title, direccion, plantilla, estiloTitular);
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

// Miniatura de YouTube: horizontal 16:9, protagonista = persona real de la
// foto (estilo youtuber, rostro idéntico) o Webi si no hay foto.
router.post("/gemini/generate-youtube-cover", async (req, res) => {
  const parsedBody = GenerateYoutubeCoverBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Datos inválidos para la miniatura: revisa el título (máx. 200), la descripción (máx. 2000) y los campos del set.",
    });
    return;
  }
  const body = parsedBody.data;

  const catalogo = listarOpcionesPortada();
  if (body.direccionId && !catalogo.direcciones.some(d => d.id === body.direccionId)) {
    res.status(400).json({ error: `direccionId inválido: ${body.direccionId}` });
    return;
  }
  if (body.plantillaId && !catalogo.plantillas.some(p => p.id === body.plantillaId && p.formato === "youtube")) {
    res.status(400).json({ error: `plantillaId inválido para formato youtube: ${body.plantillaId}` });
    return;
  }
  if (body.estiloTitularId && !catalogo.estilosTitular.some(e => e.id === body.estiloTitularId)) {
    res.status(400).json({ error: `estiloTitularId inválido: ${body.estiloTitularId}` });
    return;
  }

  // Validar las fotos ANTES de gastar una llamada de IA: 400 determinista para
  // base64 corrupto, formato no soportado o fotos de más de 8 MB. Se aceptan
  // hasta MAX_FOTOS_PERSONA fotos de LA MISMA persona (más ángulos = más
  // fidelidad de rostro); `personImageBase64` queda como campo legado.
  const listaFotos = body.personImagesBase64?.length
    ? body.personImagesBase64
    : body.personImageBase64
      ? [body.personImageBase64]
      : [];
  const vFotos = validarFotosPersona(listaFotos);
  if (!vFotos.ok) {
    res.status(400).json({ error: vFotos.error });
    return;
  }
  const fotosPersona = vFotos.fotos;

  const tema = `${body.title} ${body.description || ""}`.trim();
  const conPersona = fotosPersona.length > 0;
  const { direccion, plantilla, estiloTitular, prompt } = prepararMiniaturaYoutube(
    tema,
    body.style,
    {
      direccionId: body.direccionId,
      plantillaId: body.plantillaId,
      estiloTitularId: body.estiloTitularId,
      utileria: body.utileria,
      conPersona,
      numFotosPersona: fotosPersona.length,
    },
    body.title,
  );

  try {
    // Con fotos → la persona es la referencia (todas viajan al modelo); sin
    // foto → master del zorro (lo carga generateFoxIllustration por defecto).
    // Con persona, fidelidad "high" para que el rostro quede igual a la foto.
    const buf = await generateFoxIllustration(
      prompt,
      conPersona ? fotosPersona.map(f => ({ base64: f.base64, mime: f.mime })) : undefined,
      "1536x1024",
      undefined,
      conPersona ? "high" : undefined,
    );
    console.log(`[MiniaturaYT] Ilustración lista, componiendo titular (${direccion.id}, plantilla ${plantilla.id}, estilo ${estiloTitular.id})...`);
    const composited = await composeYoutubeCover(buf, body.title, direccion, plantilla, estiloTitular);
    res.json({ b64_json: composited.toString("base64"), mimeType: "image/png" });
  } catch (error: any) {
    console.error(`[MiniaturaYT] Falló la generación: ${error?.message}`);
    if (esErrorRateLimit(error)) {
      res.status(429).json({ error: "El servicio de IA está saturado en este momento. Espera 1-2 minutos e intenta de nuevo." });
    } else {
      res.status(500).json({ error: "No se pudo generar la miniatura. Intenta de nuevo en unos momentos." });
    }
  }
});


/* ==================== Borradores de portadas ============================= */
// Persistencia sobre community_content (kind "portada_borrador"), el mismo
// patrón que ya usan historias y carruseles: cada generación se auto-guarda
// para que nada se pierda al salir de la página. La lista viaja solo con
// thumbnails webp; la imagen completa se pide al cargar un borrador. Se
// conservan los últimos MAX_BORRADORES (poda automática al guardar).

const KIND_BORRADOR = "portada_borrador";
const MAX_BORRADORES = 60;

async function thumbDeImagen(base64: string): Promise<string> {
  const buf = await sharp(Buffer.from(base64, "base64"))
    .resize(360, undefined, { withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
  return buf.toString("base64");
}

type DatosBorrador = { thumb?: string; settings?: Record<string, unknown> };

router.get("/gemini/cover-drafts", async (_req, res) => {
  const rows = await db
    .select({
      id: communityContent.id,
      subtype: communityContent.subtype,
      topic: communityContent.topic,
      data: communityContent.data,
      createdAt: communityContent.createdAt,
    })
    .from(communityContent)
    .where(eq(communityContent.kind, KIND_BORRADOR))
    .orderBy(desc(communityContent.createdAt))
    .limit(MAX_BORRADORES);
  res.json({
    drafts: rows.map((r) => {
      const d = (r.data ?? {}) as DatosBorrador;
      return {
        id: r.id,
        formato: r.subtype === "youtube" ? "youtube" : "vertical",
        title: r.topic,
        thumb: d.thumb ?? "",
        settings: d.settings ?? {},
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
});

router.get("/gemini/cover-drafts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [row] = await db
    .select()
    .from(communityContent)
    .where(and(eq(communityContent.id, id), eq(communityContent.kind, KIND_BORRADOR)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Borrador no encontrado" });
    return;
  }
  const d = (row.data ?? {}) as DatosBorrador;
  res.json({
    id: row.id,
    formato: row.subtype === "youtube" ? "youtube" : "vertical",
    title: row.topic,
    imageBase64: row.imageUrl ?? "",
    settings: d.settings ?? {},
    createdAt: row.createdAt.toISOString(),
  });
});

router.post("/gemini/cover-drafts", async (req, res) => {
  const parsed = CreateCoverDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Borrador inválido: revisa el formato, el título (máx. 200) y la imagen." });
    return;
  }
  const body = parsed.data;
  const v = validarFotoPersona(body.imageBase64);
  if (!v.ok) {
    res.status(400).json({ error: v.error });
    return;
  }

  let thumb = "";
  try {
    thumb = await thumbDeImagen(v.base64);
  } catch (e) {
    console.warn(`[Borradores] No se pudo generar thumbnail: ${(e as Error).message}`);
  }

  const [row] = await db
    .insert(communityContent)
    .values({
      kind: KIND_BORRADOR,
      subtype: body.formato,
      topic: body.title,
      data: { thumb, settings: body.settings ?? {} },
      imageUrl: v.base64,
    })
    .returning({ id: communityContent.id, createdAt: communityContent.createdAt });

  // Poda: conservar solo los MAX_BORRADORES más recientes.
  try {
    const sobrantes = await db
      .select({ id: communityContent.id })
      .from(communityContent)
      .where(eq(communityContent.kind, KIND_BORRADOR))
      .orderBy(desc(communityContent.createdAt))
      .offset(MAX_BORRADORES);
    if (sobrantes.length > 0) {
      await db.delete(communityContent).where(
        and(eq(communityContent.kind, KIND_BORRADOR), inArray(communityContent.id, sobrantes.map((r) => r.id))),
      );
    }
  } catch (e) {
    console.warn(`[Borradores] Poda falló: ${(e as Error).message}`);
  }

  console.log(`[Borradores] Guardado #${row!.id} (${body.formato}): "${body.title.slice(0, 60)}"`);
  res.status(201).json({ id: row!.id, createdAt: row!.createdAt.toISOString() });
});

router.put("/gemini/cover-drafts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const parsed = UpdateCoverDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Imagen inválida para actualizar el borrador." });
    return;
  }
  const v = validarFotoPersona(parsed.data.imageBase64);
  if (!v.ok) {
    res.status(400).json({ error: v.error });
    return;
  }
  const [existente] = await db
    .select({ id: communityContent.id, data: communityContent.data })
    .from(communityContent)
    .where(and(eq(communityContent.id, id), eq(communityContent.kind, KIND_BORRADOR)))
    .limit(1);
  if (!existente) {
    res.status(404).json({ error: "Borrador no encontrado" });
    return;
  }
  let thumb = "";
  try {
    thumb = await thumbDeImagen(v.base64);
  } catch { /* thumbnail es best-effort */ }
  const dPrev = (existente.data ?? {}) as DatosBorrador;
  const [row] = await db
    .update(communityContent)
    .set({ imageUrl: v.base64, data: { ...dPrev, thumb: thumb || dPrev.thumb } })
    .where(eq(communityContent.id, id))
    .returning({ id: communityContent.id, createdAt: communityContent.createdAt });
  res.json({ id: row!.id, createdAt: row!.createdAt.toISOString() });
});

router.delete("/gemini/cover-drafts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  await db
    .delete(communityContent)
    .where(and(eq(communityContent.id, id), eq(communityContent.kind, KIND_BORRADOR)));
  res.status(204).send();
});

export default router;
