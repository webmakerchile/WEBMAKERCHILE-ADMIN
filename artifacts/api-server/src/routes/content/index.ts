import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { videos } from "@workspace/db/schema";
import { eq, desc, lte, and } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  CreateVideoBody,
  ScheduleVideoBody,
} from "@workspace/api-zod";
import * as fs from "fs";
import * as path from "path";

const router: IRouter = Router();

function getConnectors() {
  return new ReplitConnectors();
}

function findReferenceImage(): string {
  const candidates = [
    path.resolve("artifacts/api-server/assets/reference-cover.jpg"),
    path.resolve("assets/reference-cover.jpg"),
    path.join(process.cwd(), "assets/reference-cover.jpg"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Reference cover image not found. Searched: ${candidates.join(", ")}`);
}

let _refImageCache: string | null = null;
function getReferenceImageBase64(): string {
  if (_refImageCache) return _refImageCache;
  const imagePath = findReferenceImage();
  _refImageCache = fs.readFileSync(imagePath).toString("base64");
  return _refImageCache;
}

function buildCoverPrompt(title: string, description: string, customPrompt?: string | null): string {
  const titleText = title.toUpperCase();
  const titleLetterByLetter = titleText.split("").join("-");

  return customPrompt || `Genera una imagen para portada de video en formato vertical (9:16) BASÁNDOTE EN LA IMAGEN DE REFERENCIA adjunta.

INSTRUCCIONES DE ESTILO:
- Usa el MISMO estilo visual de la imagen de referencia: flat vector art, fondo amarillo sólido, personaje zorro con lentes.
- Mantén el mismo estilo de ilustración, colores y composición.
- El zorro debe tener una expresión y pose relevante al tema del video.

Título del video: "${title}"
Descripción: "${description}"

TEXTO OBLIGATORIO EN LA IMAGEN (tercio superior, blanco, mayúsculas, sans-serif gruesa y negrita, centrado):

TEXTO EXACTO: "${titleText}"
LETRA POR LETRA: ${titleLetterByLetter}

ADVERTENCIA CRÍTICA SOBRE ORTOGRAFÍA:
- El texto DEBE escribirse EXACTAMENTE como se muestra arriba, sin alterar NINGUNA letra.
- NO inventes, NO reorganices, NO intercambies letras. Copia carácter por carácter.
- Verifica que cada palabra esté escrita correctamente ANTES de renderizar.
- Cada letra en su posición EXACTA. La precisión ortográfica es OBLIGATORIA.
- Antes de generar, re-lee el texto letra por letra y confirma que cada carácter está en el orden correcto.

Estilo minimalista, líneas limpias, colores planos. Formato 9:16 vertical.`;
}

async function generateCoverForVideo(videoId: number) {
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!video) throw new Error("Video not found");

  const prompt = buildCoverPrompt(video.title, video.description || "", video.coverPrompt);
  const referenceImageBase64 = getReferenceImageBase64();

  const { b64_json, mimeType } = await generateImage({
    prompt,
    referenceImageBase64,
    referenceImageMimeType: "image/jpeg",
  });

  const [updated] = await db
    .update(videos)
    .set({
      coverImageBase64: b64_json,
      coverMimeType: mimeType,
      status: "cover_generated",
      updatedAt: new Date(),
    })
    .where(eq(videos.id, videoId))
    .returning();

  return updated;
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
  const body = req.body;

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.coverPrompt !== undefined) updateData.coverPrompt = body.coverPrompt;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.month !== undefined) updateData.month = body.month;
  if (body.week !== undefined) updateData.week = body.week;
  if (body.day !== undefined) updateData.day = body.day;
  if (body.videoNumber !== undefined) updateData.videoNumber = body.videoNumber;
  if (body.tiktokDescription !== undefined) updateData.tiktokDescription = body.tiktokDescription;
  if (body.instagramDescription !== undefined) updateData.instagramDescription = body.instagramDescription;
  if (body.youtubeTitle !== undefined) updateData.youtubeTitle = body.youtubeTitle;
  if (body.youtubeDescription !== undefined) updateData.youtubeDescription = body.youtubeDescription;
  if (body.tiktokStatus !== undefined) updateData.tiktokStatus = body.tiktokStatus;
  if (body.instagramStatus !== undefined) updateData.instagramStatus = body.instagramStatus;
  if (body.youtubeStatus !== undefined) updateData.youtubeStatus = body.youtubeStatus;

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

  try {
    const updated = await generateCoverForVideo(id);
    res.json(updated);
  } catch (error: any) {
    if (error.message === "Video not found") {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.status(500).json({ error: error.message || "Cover generation failed" });
  }
});

router.post("/content/videos/from-studio", async (req, res) => {
  const { title, description, category, hashtags } = req.body;

  try {
    const [video] = await db
      .insert(videos)
      .values({
        title: title || "Sin título",
        description: description || "",
        status: "draft",
      })
      .returning();

    res.status(201).json({ video, coverGenerating: true });

    generateCoverForVideo(video.id).catch((err) => {
      console.error(`[from-studio] Error generating cover for video ${video.id}:`, err.message);
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Error creating video from studio" });
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

        if (!uploadData.id) {
          throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`);
        }

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
