import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { videos } from "@workspace/db/schema";
import { eq, desc, lte, and } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  CreateVideoBody,
  UpdateVideoBody,
  ScheduleVideoBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getConnectors() {
  return new ReplitConnectors();
}

router.get("/content/videos", async (_req, res) => {
  const rows = await db
    .select()
    .from(videos)
    .orderBy(desc(videos.createdAt));
  res.json(rows);
});

router.post("/content/videos", async (req, res) => {
  const body = CreateVideoBody.parse(req.body);
  const [row] = await db
    .insert(videos)
    .values({
      title: body.title,
      description: body.description,
      coverPrompt: body.coverPrompt || null,
      month: body.month || null,
      week: body.week || null,
      day: body.day || null,
      videoNumber: body.videoNumber || null,
      status: "draft",
    })
    .returning();
  res.status(201).json(row);
});

router.get("/content/videos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.json(row);
});

router.patch("/content/videos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = UpdateVideoBody.parse(req.body);

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.coverPrompt !== undefined) updateData.coverPrompt = body.coverPrompt;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.month !== undefined) updateData.month = body.month;
  if (body.week !== undefined) updateData.week = body.week;
  if (body.day !== undefined) updateData.day = body.day;
  if (body.videoNumber !== undefined) updateData.videoNumber = body.videoNumber;

  const [row] = await db
    .update(videos)
    .set(updateData)
    .where(eq(videos.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.json(row);
});

router.delete("/content/videos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await db
    .delete(videos)
    .where(eq(videos.id, id))
    .returning();
  if (!deleted.length) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.status(204).send();
});

router.post("/content/videos/:id/generate-cover", async (req, res) => {
  const id = Number(req.params.id);
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  const titleText = video.title.toUpperCase();
  const titleLetterByLetter = titleText.split("").join("-");

  const prompt =
    video.coverPrompt ||
    `Genera una ilustración en formato vertical (9:16) con estilo flat vector art, fondo amarillo sólido, con un personaje zorro.

Título: "${video.title}"
Descripción: "${video.description}"

TEXTO OBLIGATORIO EN LA IMAGEN (tercio superior, blanco, mayúsculas, sans-serif gruesa y negrita, centrado):

TEXTO EXACTO: "${titleText}"
LETRA POR LETRA: ${titleLetterByLetter}

ADVERTENCIA CRÍTICA SOBRE ORTOGRAFÍA:
- El texto DEBE escribirse EXACTAMENTE como se muestra arriba, sin alterar NINGUNA letra.
- NO inventes, NO reorganices, NO intercambies letras. Copia carácter por carácter.
- Verifica que cada palabra esté escrita correctamente ANTES de renderizar.
- Cada letra en su posición EXACTA. La precisión ortográfica es OBLIGATORIA.
- Antes de generar, re-lee el texto letra por letra y confirma que cada carácter está en el orden correcto.

Estilo minimalista, líneas limpias, colores planos.`;

  try {
    const { b64_json, mimeType } = await generateImage(prompt);
    const [updated] = await db
      .update(videos)
      .set({
        coverImageBase64: b64_json,
        coverMimeType: mimeType,
        status: "cover_generated",
        updatedAt: new Date(),
      })
      .where(eq(videos.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Cover generation failed" });
  }
});

router.post("/content/videos/:id/schedule", async (req, res) => {
  const id = Number(req.params.id);
  const body = ScheduleVideoBody.parse(req.body);

  const [updated] = await db
    .update(videos)
    .set({
      scheduledAt: new Date(body.scheduledAt),
      driveFolderId: body.driveFolderId,
      status: "scheduled",
      updatedAt: new Date(),
    })
    .where(eq(videos.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.json(updated);
});

router.post("/content/schedule/check", async (_req, res) => {
  const now = new Date();
  const due = await db
    .select()
    .from(videos)
    .where(and(eq(videos.status, "scheduled"), lte(videos.scheduledAt, now)));

  const details: Array<{
    videoId: number;
    status: string;
    error?: string;
  }> = [];
  let processed = 0;
  let errors = 0;

  for (const video of due) {
    try {
      if (video.coverImageBase64 && video.driveFolderId) {
        const connectors = getConnectors();

        const metadata = {
          name: `${video.title}_cover.png`,
          parents: [video.driveFolderId],
        };

        const boundary = "upload_boundary";
        const multipartBody =
          `--${boundary}\r\n` +
          `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
          `${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: ${video.coverMimeType || "image/png"}\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n` +
          `${video.coverImageBase64}\r\n` +
          `--${boundary}--`;

        const uploadRes = await connectors.proxy(
          "google-drive",
          "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
          {
            method: "POST",
            headers: {
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
          }
        );
        const uploadData = await uploadRes.json();

        await db
          .update(videos)
          .set({
            driveFileId: uploadData.id,
            status: "published",
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(videos.id, video.id));

        details.push({ videoId: video.id, status: "published" });
        processed++;
      } else {
        details.push({
          videoId: video.id,
          status: "skipped",
          error: "Missing cover image or folder ID",
        });
        errors++;
      }
    } catch (error: any) {
      details.push({
        videoId: video.id,
        status: "error",
        error: error.message,
      });
      errors++;
    }
  }

  res.json({ processed, errors, details });
});

export default router;
