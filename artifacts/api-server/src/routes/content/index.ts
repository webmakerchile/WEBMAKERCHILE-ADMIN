import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { videos, users, campaigns, templates } from "@workspace/db/schema";
import { eq, desc, lte, and, or, inArray, ilike, sql } from "drizzle-orm";

/**
 * Resolve a finite numeric library reference (campaignId/templateId) to either
 *   - `null`        when the caller passed null/undefined/non-finite,
 *   - the same id   when the row exists and is owned by `userId`,
 *   - `"forbidden"` when the row exists for someone else (or doesn't exist).
 *
 * Used by POST/PATCH /content/videos so users can only attach videos to their
 * own campaigns/templates.
 */
async function resolveOwnedLibraryId(
  raw: unknown,
  table: typeof campaigns | typeof templates,
  userId: number | null,
): Promise<number | null | "forbidden"> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (!userId) return "forbidden";
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, raw), eq(table.userId, userId)))
    .limit(1);
  return row ? raw : "forbidden";
}
import { getValidLinkedInToken } from "../linkedin";
import { getValidXToken } from "../x";
import { retryPlatformForVideo } from "../../scheduler";
import { ai } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { buildBrandToneSuffix } from "../../lib/brand-tone";
import { generateDescriptionsForVideo } from "../../lib/generate-descriptions";
import { google } from "googleapis";
import { Readable } from "stream";
import {
  CreateVideoBody,
  ScheduleVideoBody,
} from "@workspace/api-zod";
import * as z from "zod/v4";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";

const router: IRouter = Router();
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024 } });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getGoogleAuth(user: any) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  return oauth2Client;
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

function networkToSize(network?: string) {
  switch (network) {
    case "tiktok":
      return "1024x1792" as const;
    case "instagram":
      return "1024x1024" as const;
    case "youtube":
    case "x":
    case "linkedin":
    case "facebook":
      return "1792x1024" as const;
    default:
      return "1024x1536" as const;
  }
}

async function generateCoverForVideo(videoId: number, network?: string) {
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (!video) throw new Error("Video not found");

  const prompt = buildCoverPrompt(video.title, video.description || "", video.coverPrompt);
  const referenceImageBase64 = getReferenceImageBase64();
  const size = networkToSize(network);

  const { b64_json, mimeType } = await generateImage({
    prompt,
    referenceImageBase64,
    referenceImageMimeType: "image/jpeg",
    size,
  });

  type VideoUpdate = Parameters<ReturnType<typeof db.update<typeof videos>>["set"]>[0];

  let setData: VideoUpdate;
  if (network === "tiktok") {
    setData = { tiktokCover: b64_json, updatedAt: new Date() };
  } else if (network === "instagram") {
    setData = { instagramCover: b64_json, updatedAt: new Date() };
  } else if (network === "youtube") {
    setData = { youtubeCover: b64_json, updatedAt: new Date() };
  } else if (network === "linkedin") {
    setData = { linkedinCover: b64_json, updatedAt: new Date() };
  } else if (network === "x") {
    setData = { xCover: b64_json, updatedAt: new Date() };
  } else if (network === "facebook") {
    setData = { facebookCover: b64_json, updatedAt: new Date() };
  } else {
    setData = { coverImageBase64: b64_json, coverMimeType: mimeType, status: "cover_generated", updatedAt: new Date() };
  }

  const [updated] = await db
    .update(videos)
    .set(setData)
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

// Lightweight search used by the command palette. Returns id/title/status/cover
// only, with a small page size, so it stays fast as a live-as-you-type source.
router.get("/content/videos/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? Math.floor(limitRaw) : 12;
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
  if (!q) {
    // `count` is the number of items in this page; consumers should use
    // `hasMore` (and `offset + limit`) to drive pagination, not a total.
    res.json({ items: [], count: 0, limit, offset, hasMore: false });
    return;
  }
  const pattern = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const where = or(
    ilike(videos.title, pattern),
    ilike(videos.description, pattern),
    ilike(videos.tiktokDescription, pattern),
    ilike(videos.instagramDescription, pattern),
    ilike(videos.youtubeTitle, pattern),
    ilike(videos.youtubeDescription, pattern),
    ilike(videos.linkedinDescription, pattern),
    ilike(videos.xDescription, pattern),
    ilike(videos.facebookDescription, pattern),
  );
  // Fetch one extra row to compute hasMore without a second COUNT query.
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      status: videos.status,
      coverImageBase64: videos.coverImageBase64,
      coverMimeType: videos.coverMimeType,
      scheduledAt: videos.scheduledAt,
      month: videos.month,
    })
    .from(videos)
    .where(where)
    .orderBy(desc(videos.updatedAt))
    .limit(limit + 1)
    .offset(offset);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  res.json({ items, count: items.length, limit, offset, hasMore });
});

// Bulk update arbitrary safe fields across many videos. Used by the
// multi-select action bar in /videos. Accepts only an explicit allow-list.
router.post("/content/videos/bulk-update", async (req, res) => {
  const idsRaw = req.body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    res.status(400).json({ error: "Se requiere al menos un ID" });
    return;
  }
  const ids = idsRaw
    .map((v: unknown) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    res.status(400).json({ error: "IDs inválidos" });
    return;
  }
  if (ids.length > 200) {
    res.status(400).json({ error: "Máximo 200 videos por operación" });
    return;
  }
  const patch = (req.body?.patch ?? {}) as Record<string, unknown>;
  const ALLOWED_STATUSES = new Set([
    "draft",
    "cover_generated",
    "scheduled",
    "published",
    "partial",
    "error",
  ]);
  // month/week/day/etc. are short labels — restrict to a safe character set.
  // Unicode-aware so acentos (Miércoles, día) y ñ pasan; sigue bloqueando
  // caracteres potencialmente peligrosos (<, >, ;, etc.).
  const isSafeLabel = (v: string) => /^[\p{L}\p{N}_\-./# ]{1,80}$/u.test(v);
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.status !== undefined) {
    if (patch.status === null) {
      res.status(400).json({ error: "El estado no puede ser nulo" });
      return;
    }
    const s = String(patch.status);
    if (!ALLOWED_STATUSES.has(s)) {
      res.status(400).json({ error: `Estado inválido: ${s}` });
      return;
    }
    update.status = s;
  }
  for (const key of ["month", "week", "day"] as const) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) {
      update[key] = null;
      continue;
    }
    const v = String(patch[key]);
    if (!isSafeLabel(v)) {
      res.status(400).json({ error: `Valor inválido para ${key}` });
      return;
    }
    update[key] = v;
  }

  if (Object.keys(update).length === 1) {
    res.status(400).json({ error: "No hay campos para actualizar" });
    return;
  }
  const updated = await db
    .update(videos)
    .set(update)
    .where(inArray(videos.id, ids))
    .returning({ id: videos.id });
  res.json({ updated: updated.length, ids: updated.map((u) => u.id) });
});

// Bulk schedule: marks N videos as scheduled at the same datetime.
router.post("/content/videos/bulk-schedule", async (req, res) => {
  const idsRaw = req.body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    res.status(400).json({ error: "Se requiere al menos un ID" });
    return;
  }
  const ids = idsRaw
    .map((v: unknown) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    res.status(400).json({ error: "IDs inválidos" });
    return;
  }
  if (ids.length > 200) {
    res.status(400).json({ error: "Máximo 200 videos por operación" });
    return;
  }
  const scheduledAtRaw = req.body?.scheduledAt;
  if (typeof scheduledAtRaw !== "string") {
    res.status(400).json({ error: "Falta scheduledAt" });
    return;
  }
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    res.status(400).json({ error: "Fecha inválida" });
    return;
  }
  const updated = await db
    .update(videos)
    .set({ scheduledAt, status: "scheduled", workflowStatus: "programado", updatedAt: new Date() })
    .where(inArray(videos.id, ids))
    .returning({ id: videos.id });
  res.json({ scheduled: updated.length, ids: updated.map((u) => u.id) });
});

// Bulk generate descriptions: validates the selection and returns the list
// of queued ids. The actual generation runs per-video in the existing
// /:id/generate-descriptions endpoint; the frontend chains those calls so
// long Gemini requests don't tie up a single connection. We deliberately do
// not mutate the rows here — the per-video endpoint owns the write.
router.post("/content/videos/bulk-generate-descriptions", async (req, res) => {
  const idsRaw = req.body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    res.status(400).json({ error: "Se requiere al menos un ID" });
    return;
  }
  const ids = idsRaw
    .map((v: unknown) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    res.status(400).json({ error: "IDs inválidos" });
    return;
  }
  if (ids.length > 50) {
    res.status(400).json({ error: "Máximo 50 videos por operación" });
    return;
  }
  // We only return the queued ids; the frontend triggers the per-video
  // generator one by one to avoid blocking on long Gemini calls.
  res.json({ queued: ids.length, ids });
});

router.delete("/content/videos/bulk", async (req, res) => {
  const idsRaw = req.body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    res.status(400).json({ error: "Se requiere al menos un ID" });
    return;
  }
  const ids = idsRaw
    .map((v: unknown) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    res.status(400).json({ error: "IDs inválidos" });
    return;
  }
  if (ids.length > 200) {
    res.status(400).json({ error: "Máximo 200 videos por operación" });
    return;
  }
  const deleted = await db
    .delete(videos)
    .where(inArray(videos.id, ids))
    .returning({ id: videos.id });
  res.json({ deleted: deleted.length, ids: deleted.map((d) => d.id) });
});

// Bulk import N videos from a parsed CSV. The frontend parses the file and
// posts the validated rows here; we re-validate row by row and insert in a
// single transaction so the user gets all-or-nothing semantics per chunk.
// Returns per-row errors so the UI can highlight bad lines, and the list of
// created ids so the caller can refresh / link to them.
router.post("/content/videos/import-csv", async (req, res) => {
  const userId = (req.user as { id?: number } | undefined)?.id ?? null;
  const rowsRaw = (req.body as any)?.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
    res.status(400).json({ error: "Faltan filas para importar" });
    return;
  }
  if (rowsRaw.length > 200) {
    res.status(400).json({ error: "Máximo 200 filas por importación" });
    return;
  }
  // Unicode-aware so acentos (Miércoles, día) y ñ pasan; sigue bloqueando
  // caracteres potencialmente peligrosos (<, >, ;, etc.).
  const isSafeLabel = (v: string) => /^[\p{L}\p{N}_\-./# ]{1,80}$/u.test(v);
  // HH:MM (24h) or HH:MM:SS — the wizard usually stores HH:MM, but tolerate
  // seconds for paste-from-spreadsheet flows.
  const isValidHour = (v: string) => /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);
  const text = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };
  type NumResult = { ok: true; value: number | null } | { ok: false; raw: string };
  const parseId = (v: unknown): NumResult => {
    if (v === null || v === undefined || v === "") return { ok: true, value: null };
    const raw = String(v).trim();
    if (raw === "") return { ok: true, value: null };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, raw };
    return { ok: true, value: n };
  };

  type Prepared = {
    title: string;
    description: string;
    month: string | null;
    week: string | null;
    day: string | null;
    videoNumber: string | null;
    scheduleHour: string | null;
    campaignId: number | null;
    templateId: number | null;
  };

  const prepared: Prepared[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rowsRaw.length; i++) {
    const r = rowsRaw[i] || {};
    const title = text(r.title);
    const description = text(r.description);
    if (!title) { errors.push({ row: i, error: "Falta el título" }); continue; }
    if (!description) { errors.push({ row: i, error: "Falta la descripción" }); continue; }
    if (title.length > 240) { errors.push({ row: i, error: "Título demasiado largo (máx 240)" }); continue; }
    const month = text(r.month);
    const week = text(r.week);
    const day = text(r.day);
    const videoNumber = text(r.videoNumber);
    const scheduleHour = text(r.scheduleHour);
    let labelError: string | null = null;
    for (const [k, v] of [["mes", month], ["semana", week], ["día", day], ["videoNumber", videoNumber]] as const) {
      if (v && !isSafeLabel(v)) { labelError = `Valor inválido para ${k}`; break; }
    }
    if (labelError) { errors.push({ row: i, error: labelError }); continue; }
    if (scheduleHour && !isValidHour(scheduleHour)) {
      errors.push({ row: i, error: `Hora inválida (usa HH:MM, ej. 09:00): "${scheduleHour}"` });
      continue;
    }
    const campaignParsed = parseId(r.campaignId);
    if (!campaignParsed.ok) { errors.push({ row: i, error: `campaignId inválido: "${campaignParsed.raw}"` }); continue; }
    const templateParsed = parseId(r.templateId);
    if (!templateParsed.ok) { errors.push({ row: i, error: `templateId inválido: "${templateParsed.raw}"` }); continue; }
    const campaignId = campaignParsed.value;
    const templateId = templateParsed.value;
    if (campaignId !== null) {
      const ok = await resolveOwnedLibraryId(campaignId, campaigns, userId);
      if (ok === "forbidden") { errors.push({ row: i, error: `Campaña ${campaignId} no encontrada` }); continue; }
    }
    if (templateId !== null) {
      const ok = await resolveOwnedLibraryId(templateId, templates, userId);
      if (ok === "forbidden") { errors.push({ row: i, error: `Plantilla ${templateId} no encontrada` }); continue; }
    }
    prepared.push({ title, description, month, week, day, videoNumber, scheduleHour, campaignId, templateId });
  }

  if (errors.length > 0) {
    res.status(400).json({ created: 0, ids: [], errors });
    return;
  }

  // All-or-nothing: a single transaction so a partial failure doesn't leave
  // half the import committed. If anything throws, drizzle rolls everything
  // back and we surface the error to the caller.
  try {
    const inserted = await db.transaction(async (tx) => {
      const out: { id: number }[] = [];
      for (const p of prepared) {
        const [row] = await tx.insert(videos).values({
          title: p.title,
          description: p.description,
          status: "draft",
          month: p.month,
          week: p.week,
          day: p.day,
          videoNumber: p.videoNumber,
          scheduleHour: p.scheduleHour,
          campaignId: p.campaignId,
          templateId: p.templateId,
        }).returning({ id: videos.id });
        out.push(row);
      }
      return out;
    });
    res.status(201).json({ created: inserted.length, ids: inserted.map((r) => r.id), errors: [] });
  } catch (err: any) {
    console.error("[import-csv] transaction failed:", err?.message);
    res.status(500).json({ error: err?.message || "Error en la importación" });
  }
});

// Duplicate an existing video as a "remix": copies the cover, the linked
// video file and the template/campaign so the user keeps the same visual
// identity, but blanks per-network descriptions and publish state so it's
// truly a fresh draft they can iterate on. Returns the new row.
router.post("/content/videos/:id/duplicate", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const [src] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!src) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }
  const baseTitle = src.title.endsWith(" v2") ? src.title : `${src.title} v2`;
  // Re-validate library ownership: the source video may reference a campaign
  // or template the current caller doesn't own (e.g. legacy data, role
  // changes). Drop the link in that case instead of silently propagating it,
  // matching the policy of POST/PATCH/import-csv.
  const userId = (req.user as { id?: number } | undefined)?.id ?? null;
  const campaignSafe = src.campaignId == null
    ? null
    : (await resolveOwnedLibraryId(src.campaignId, campaigns, userId)) === src.campaignId
      ? src.campaignId
      : null;
  const templateSafe = src.templateId == null
    ? null
    : (await resolveOwnedLibraryId(src.templateId, templates, userId)) === src.templateId
      ? src.templateId
      : null;
  const [row] = await db.insert(videos).values({
    title: baseTitle,
    description: src.description,
    coverPrompt: src.coverPrompt,
    coverImageBase64: src.coverImageBase64,
    coverMimeType: src.coverMimeType,
    videoFileDriveId: src.videoFileDriveId,
    videoFileName: src.videoFileName,
    driveFileId: src.driveFileId,
    driveFolderId: src.driveFolderId,
    status: "draft",
    workflowStatus: "borrador",
    month: src.month,
    week: src.week,
    day: src.day,
    videoNumber: src.videoNumber,
    scheduleHour: src.scheduleHour,
    campaignId: campaignSafe,
    templateId: templateSafe,
    // Per-network text/IDs/status are deliberately left at defaults (null /
    // "pending") so the remix is a clean draft.
  }).returning();
  res.status(201).json(row);
});

router.post("/content/videos", async (req, res) => {
  const body = CreateVideoBody.parse(req.body);
  const userId = (req.user as { id?: number } | undefined)?.id ?? null;
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const campaignResolved = await resolveOwnedLibraryId(raw.campaignId, campaigns, userId);
  if (campaignResolved === "forbidden") {
    res.status(403).json({ error: "Campaña no encontrada o no autorizada" });
    return;
  }
  const templateResolved = await resolveOwnedLibraryId(raw.templateId, templates, userId);
  if (templateResolved === "forbidden") {
    res.status(403).json({ error: "Plantilla no encontrada o no autorizada" });
    return;
  }
  // Per-network description fields can arrive via the create payload when
  // the user applies a template in the wizard's Información step. Keep them
  // optional so the legacy "create then patch" flow keeps working.
  const optionalText = (key: string): string | null => {
    const v = raw[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
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
      campaignId: campaignResolved,
      templateId: templateResolved,
      tiktokDescription: optionalText("tiktokDescription"),
      instagramDescription: optionalText("instagramDescription"),
      youtubeTitle: optionalText("youtubeTitle"),
      youtubeDescription: optionalText("youtubeDescription"),
      linkedinDescription: optionalText("linkedinDescription"),
      xDescription: optionalText("xDescription"),
      facebookDescription: optionalText("facebookDescription"),
    })
    .returning();
  res.status(201).json(row);
});

router.get("/content/videos/recent-activity", async (_req, res) => {
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      status: videos.status,
      publishedAt: videos.publishedAt,
      updatedAt: videos.updatedAt,
      youtubeStatus: videos.youtubeStatus,
      youtubeError: videos.youtubeError,
      tiktokStatus: videos.tiktokStatus,
      tiktokError: videos.tiktokError,
      instagramStatus: videos.instagramStatus,
      instagramError: videos.instagramError,
      linkedinStatus: videos.linkedinStatus,
      linkedinError: videos.linkedinError,
      xStatus: videos.xStatus,
      xError: videos.xError,
      facebookStatus: videos.facebookStatus,
      facebookError: videos.facebookError,
    })
    .from(videos)
    .where(
      or(
        inArray(videos.status, ["published", "partial", "error"]),
        eq(videos.linkedinStatus, "error"),
        eq(videos.xStatus, "error"),
        eq(videos.facebookStatus, "error"),
        eq(videos.youtubeStatus, "error"),
        eq(videos.tiktokStatus, "error"),
        eq(videos.instagramStatus, "error"),
      ),
    )
    .orderBy(desc(videos.updatedAt))
    .limit(20);
  res.json(rows);
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

  // Guard: scheduling/publish state can only be set via the dedicated
  // /schedule endpoint or by reviewers, so the approval workflow is the
  // single source of truth for transitions to scheduled/published.
  const wantsScheduleField =
    body.status === "scheduled" ||
    body.status === "published" ||
    body.scheduledAt !== undefined ||
    body.workflowStatus !== undefined;
  if (wantsScheduleField) {
    const meId = (req.user as { id?: number } | undefined)?.id;
    const meRow = meId
      ? (await db.select({ teamRole: users.teamRole }).from(users).where(eq(users.id, meId)).limit(1))[0]
      : null;
    if (meRow?.teamRole !== "reviewer") {
      res.status(403).json({ error: "Usa el flujo de aprobación: programa desde el endpoint /schedule tras aprobar el video" });
      return;
    }
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.coverPrompt !== undefined) updateData.coverPrompt = body.coverPrompt;
  // Allow uploading/clearing a custom cover from the wizard. The same fields
  // are written by `/generate-cover`; here we let the user override with their
  // own image (base64) or remove it (null).
  if (body.coverImageBase64 !== undefined) updateData.coverImageBase64 = body.coverImageBase64;
  if (body.coverMimeType !== undefined) updateData.coverMimeType = body.coverMimeType;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.workflowStatus !== undefined) updateData.workflowStatus = body.workflowStatus;
  if (body.month !== undefined) updateData.month = body.month;
  if (body.week !== undefined) updateData.week = body.week;
  if (body.day !== undefined) updateData.day = body.day;
  if (body.videoNumber !== undefined) updateData.videoNumber = body.videoNumber;
  if (body.tiktokDescription !== undefined) updateData.tiktokDescription = body.tiktokDescription;
  if (body.instagramDescription !== undefined) updateData.instagramDescription = body.instagramDescription;
  if (body.youtubeTitle !== undefined) updateData.youtubeTitle = body.youtubeTitle;
  if (body.youtubeDescription !== undefined) updateData.youtubeDescription = body.youtubeDescription;
  if (body.linkedinDescription !== undefined) updateData.linkedinDescription = body.linkedinDescription;
  if (body.xDescription !== undefined) updateData.xDescription = body.xDescription;
  if (body.facebookDescription !== undefined) updateData.facebookDescription = body.facebookDescription;
  if (body.tiktokStatus !== undefined) updateData.tiktokStatus = body.tiktokStatus;
  if (body.instagramStatus !== undefined) updateData.instagramStatus = body.instagramStatus;
  if (body.youtubeStatus !== undefined) updateData.youtubeStatus = body.youtubeStatus;
  if (body.linkedinStatus !== undefined) updateData.linkedinStatus = body.linkedinStatus;
  if (body.linkedinPostId !== undefined) updateData.linkedinPostId = body.linkedinPostId;
  if (body.linkedinError !== undefined) updateData.linkedinError = body.linkedinError;
  if (body.xStatus !== undefined) updateData.xStatus = body.xStatus;
  if (body.xPostId !== undefined) updateData.xPostId = body.xPostId;
  if (body.xError !== undefined) updateData.xError = body.xError;
  if (body.facebookStatus !== undefined) updateData.facebookStatus = body.facebookStatus;
  if (body.facebookPostId !== undefined) updateData.facebookPostId = body.facebookPostId;
  if (body.facebookError !== undefined) updateData.facebookError = body.facebookError;
  if (body.scheduleHour !== undefined) updateData.scheduleHour = body.scheduleHour;
  if (body.scheduledAt !== undefined) updateData.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (body.campaignId !== undefined) {
    const userId = (req.user as { id?: number } | undefined)?.id ?? null;
    const resolved = await resolveOwnedLibraryId(body.campaignId, campaigns, userId);
    if (resolved === "forbidden") {
      res.status(403).json({ error: "Campaña no encontrada o no autorizada" });
      return;
    }
    updateData.campaignId = resolved;
  }
  if (body.templateId !== undefined) {
    const userId = (req.user as { id?: number } | undefined)?.id ?? null;
    const resolved = await resolveOwnedLibraryId(body.templateId, templates, userId);
    if (resolved === "forbidden") {
      res.status(403).json({ error: "Plantilla no encontrada o no autorizada" });
      return;
    }
    updateData.templateId = resolved;
  }

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

router.post("/content/videos/:id/upload-video", videoUpload.single("video"), async (req, res) => {
  const id = Number(req.params.id);
  const videoFile = (req as any).file;

  if (!videoFile) {
    res.status(400).json({ error: "No se adjuntó archivo de video" });
    return;
  }

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  try {
    const user = req.user as any;
    const auth = getGoogleAuth(user);
    const drive = google.drive({ version: "v3", auth });
    const folderId = process.env.DRIVE_FOLDER_ID || "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB";

    const fileName = videoFile.originalname || `video_${id}_${Date.now()}.mp4`;

    const driveRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: videoFile.mimetype || "video/mp4",
        parents: [folderId],
      },
      media: {
        mimeType: videoFile.mimetype || "video/mp4",
        body: Readable.from(videoFile.buffer),
      },
      fields: "id,name",
    });

    if (!driveRes.data || !driveRes.data.id) {
      console.error("[Upload] Drive response invalid:", driveRes.data);
      res.status(500).json({ error: "Error al subir a Google Drive" });
      return;
    }

    const driveFileId = driveRes.data.id;

    const [updated] = await db
      .update(videos)
      .set({
        videoFileDriveId: driveFileId,
        videoFileName: fileName,
        updatedAt: new Date(),
      })
      .where(eq(videos.id, id))
      .returning();

    console.log(`[Upload] Video file uploaded to Drive: ${driveFileId} for video ${id}`);
    res.json({
      success: true,
      driveFileId: driveFileId,
      fileName,
      video: updated,
    });
  } catch (err: any) {
    console.error("[Upload] Error:", err.message);
    res.status(500).json({ error: err.message || "Error al subir archivo de video" });
  }
});

router.post("/content/videos/:id/link-drive-video", async (req, res) => {
  const id = Number(req.params.id);
  const { driveFileId, fileName } = req.body;

  if (!driveFileId) {
    res.status(400).json({ error: "Falta el ID del archivo de Drive" });
    return;
  }

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  const [updated] = await db
    .update(videos)
    .set({
      videoFileDriveId: driveFileId,
      videoFileName: fileName || "video.mp4",
      updatedAt: new Date(),
    })
    .where(eq(videos.id, id))
    .returning();

  res.json({ success: true, driveFileId, fileName: updated.videoFileName, video: updated });
});

// Streams the linked Drive video back to the client with `inline` disposition
// so it can be embedded in a <video> tag for in-wizard preview. Supports HTTP
// Range requests so the user can scrub the timeline without downloading the
// whole file (Google Drive returns the requested byte range).
router.get("/content/videos/:id/preview-video", async (req, res) => {
  const id = Number(req.params.id);
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);
  if (!video || !video.videoFileDriveId) {
    res.status(404).json({ error: "Video no encontrado o sin archivo adjunto" });
    return;
  }
  try {
    const user = req.user as any;
    const auth = getGoogleAuth(user);
    const drive = google.drive({ version: "v3", auth });
    const headers: Record<string, string> = {};
    const range = req.headers.range;
    if (typeof range === "string") headers["Range"] = range;
    const driveResponse = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "stream", headers },
    );
    const upstream = driveResponse.headers as Record<string, string | undefined>;
    const status = (driveResponse as any).status === 206 || range ? 206 : 200;
    res.status(status);
    if (upstream["content-type"]) res.set("Content-Type", upstream["content-type"]);
    else res.set("Content-Type", "video/mp4");
    if (upstream["content-length"]) res.set("Content-Length", upstream["content-length"] as string);
    if (upstream["content-range"]) res.set("Content-Range", upstream["content-range"] as string);
    res.set("Accept-Ranges", "bytes");
    res.set("Content-Disposition", `inline; filename="${(video.videoFileName || "video.mp4").replace(/"/g, "")}"`);
    (driveResponse.data as NodeJS.ReadableStream).on("error", (err) => {
      console.error("[Preview] Stream error:", err);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    (driveResponse.data as NodeJS.ReadableStream).pipe(res);
  } catch (err: any) {
    console.error("[Preview] Error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.get("/content/videos/:id/download-video", async (req, res) => {
  const id = Number(req.params.id);

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (!video || !video.videoFileDriveId) {
    res.status(404).json({ error: "Video no encontrado o sin archivo adjunto" });
    return;
  }

  try {
    const user = req.user as any;
    const auth = getGoogleAuth(user);
    const drive = google.drive({ version: "v3", auth });
    const driveResponse = await drive.files.get(
      { fileId: video.videoFileDriveId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const fileData = Buffer.from(driveResponse.data as ArrayBuffer);

    res.set({
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${video.videoFileName || "video.mp4"}"`,
    });
    res.send(Buffer.from(fileData));
  } catch (err: any) {
    console.error("[Download] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/content/videos/:id/generate-descriptions", async (req, res) => {
  const id = Number(req.params.id);
  const { platforms, force } = req.body || {};
  const forceOverwrite = force === true;
  const targets: string[] = Array.isArray(platforms) && platforms.length
    ? platforms.filter((p: any) => typeof p === "string")
    : ["tiktok", "instagram", "youtube", "linkedin", "x"];

  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  const reqUserId = (req.user as { id?: number } | undefined)?.id ?? null;
  const { default: OpenAI } = await import("openai");
  const useOwnKey = !!process.env.OPENAI_API_KEY;
  const openai = new OpenAI({
    apiKey: useOwnKey ? process.env.OPENAI_API_KEY : process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: useOwnKey ? undefined : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  const model = process.env.OPENAI_TEMPLATE_MODEL || "gpt-4o-mini";

  const result = await generateDescriptionsForVideo(video, targets, forceOverwrite, reqUserId, openai, model);
  if (result.status === 502) {
    res.status(502).json({ error: result.error });
    return;
  }
  if ("skipped" in result && result.skipped) {
    res.json({ descriptions: {}, video, skipped: true });
    return;
  }
  if (!("updateData" in result)) {
    res.json({ descriptions: {}, video, skipped: true });
    return;
  }
  const [updated] = await db
    .update(videos)
    .set(result.updateData)
    .where(eq(videos.id, id))
    .returning();
  res.json({ descriptions: result.descriptions, video: updated });
});

router.post("/content/videos/:id/generate-cover", async (req, res) => {
  const id = Number(req.params.id);
  const network = typeof req.body?.network === "string" ? req.body.network : undefined;

  try {
    const updated = await generateCoverForVideo(id, network);
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
  const parseResult = ScheduleVideoBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.issues.map(i => i.message).join(", ") });
    return;
  }
  const body = parseResult.data;


  const [updated] = await db
    .update(videos)
    .set({
      scheduledAt: new Date(body.scheduledAt),
      driveFolderId: body.driveFolderId ?? null,
      status: "scheduled",
      workflowStatus: "programado",
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

router.post("/content/videos/:id/retry/:platform", async (req, res) => {
  const id = Number(req.params.id);
  const platform = req.params.platform;
  const allowed = ["youtube", "tiktok", "instagram", "linkedin", "x", "facebook"];
  if (!allowed.includes(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }

  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  type AuthedUser = { id: number };
  const reqUser = req.user as AuthedUser | undefined;
  if (!reqUser?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [retryUser] = await db.select().from(users).where(eq(users.id, reqUser.id)).limit(1);
  if (!retryUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  try {
    const result = await retryPlatformForVideo(id, platform, retryUser);

    const [fresh] = await db.select({
      youtubeStatus: videos.youtubeStatus,
      tiktokStatus: videos.tiktokStatus,
      instagramStatus: videos.instagramStatus,
      linkedinStatus: videos.linkedinStatus,
      xStatus: videos.xStatus,
      facebookStatus: videos.facebookStatus,
    }).from(videos).where(eq(videos.id, id)).limit(1);

    if (fresh) {
      const allPlatforms = [
        fresh.youtubeStatus, fresh.tiktokStatus, fresh.instagramStatus,
        fresh.linkedinStatus, fresh.xStatus, fresh.facebookStatus,
      ].filter((s) => s && s !== "pending" && s !== "skipped");

      const hasError = allPlatforms.some((s) => s === "error");
      const allPublished = allPlatforms.length > 0 && allPlatforms.every((s) => s === "published" || s === "uploaded");

      let newStatus: string | null = null;
      if (!hasError && allPublished) newStatus = "published";
      else if (!hasError && allPlatforms.length > 0) newStatus = "partial";
      else if (hasError && allPlatforms.some((s) => s === "published" || s === "uploaded")) newStatus = "partial";

      if (newStatus) {
        await db.update(videos).set({
          status: newStatus,
          publishedAt: newStatus === "published" || newStatus === "partial" ? new Date() : undefined,
          updatedAt: new Date(),
        }).where(eq(videos.id, id));
      }
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Retry failed" });
  }
});

router.post("/content/schedule/check", async (_req, res) => {
  const now = new Date();
  const due = await db
    .select()
    .from(videos)
    .where(and(eq(videos.status, "scheduled"), lte(videos.scheduledAt, now)));

  res.json({
    processed: 0,
    errors: 0,
    pending: due.length,
    message: due.length > 0
      ? `${due.length} video(s) pendiente(s). El scheduler automático los procesará en el próximo ciclo (cada 60 segundos).`
      : "No hay videos pendientes de subir.",
    details: due.map((v) => ({
      videoId: v.id,
      title: v.title,
      scheduledAt: v.scheduledAt,
      status: "waiting_for_scheduler",
    })),
  });
});

const IG_API_BASE_CONTENT = "https://graph.instagram.com/v21.0";
import { getCredential as _getCredential } from "../../lib/credentials";
const LINKEDIN_API_BASE_STATS = "https://api.linkedin.com";

router.get("/content/videos/:id/stats", async (req, res) => {
  const id = Number(req.params.id);
  const user = req.user as any;

  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) {
    res.status(404).json({ error: "Video no encontrado" });
    return;
  }

  const stats: Record<string, any> = {};
  const tasks: Promise<void>[] = [];

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (video.youtubeVideoId) {
    tasks.push((async () => {
      try {
        if (!user.googleAccessToken) {
          stats.youtube = { error: "no_token" };
          return;
        }
        const auth = getGoogleAuth(user);
        const youtube = google.youtube({ version: "v3", auth });
        const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });

        const today = new Date().toISOString().slice(0, 10);
        const [ytRes, ytAnalytics] = await Promise.all([
          youtube.videos.list({ part: ["statistics", "contentDetails"], id: [video.youtubeVideoId!] }).catch(() => null),
          youtubeAnalytics.reports.query({
            ids: "channel==MINE",
            startDate: "2020-01-01",
            endDate: today,
            metrics: "averageViewDuration",
            filters: `video==${video.youtubeVideoId}`,
          }).catch(() => null),
        ]);

        const ytVideo = ytRes?.data?.items?.[0];
        if (ytVideo) {
          stats.youtube = {
            views: Number(ytVideo.statistics?.viewCount || 0),
            likes: Number(ytVideo.statistics?.likeCount || 0),
            comments: Number(ytVideo.statistics?.commentCount || 0),
            averageViewDuration: Number(ytAnalytics?.data?.rows?.[0]?.[0] || 0),
            url: `https://youtube.com/watch?v=${video.youtubeVideoId}`,
          };
        } else {
          stats.youtube = { error: "not_found" };
        }
      } catch (err: any) {
        stats.youtube = { error: err.message };
      }
    })());
  }

  // ── Instagram ─────────────────────────────────────────────────────────────
  if (video.instagramMediaId) {
    tasks.push((async () => {
      const igStatToken = await _getCredential("INSTAGRAM_ACCESS_TOKEN");
      if (!igStatToken) {
        stats.instagram = { error: "no_token" };
        return;
      }
      try {
        const token = encodeURIComponent(igStatToken);
        const [mediaRes, insightsRes] = await Promise.all([
          fetch(`${IG_API_BASE_CONTENT}/${video.instagramMediaId}?fields=like_count,comments_count&access_token=${token}`)
            .then((r) => r.json() as Promise<any>).catch(() => null),
          fetch(`${IG_API_BASE_CONTENT}/${video.instagramMediaId}/insights?metric=plays,reach,total_interactions&access_token=${token}`)
            .then((r) => r.json() as Promise<any>).catch(() => null),
        ]);

        if (mediaRes?.error) {
          stats.instagram = { error: mediaRes.error.message || "api_error" };
          return;
        }

        const insights: Record<string, number> = {};
        for (const item of (insightsRes?.data || [])) {
          insights[item.name] = Number(item.values?.[0]?.value ?? item.value ?? 0);
        }

        stats.instagram = {
          likes: Number(mediaRes?.like_count || 0),
          comments: Number(mediaRes?.comments_count || 0),
          plays: insights.plays || 0,
          reach: insights.reach || 0,
          totalInteractions: insights.total_interactions || 0,
        };
      } catch (err: any) {
        stats.instagram = { error: err.message };
      }
    })());
  }

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  if (video.linkedinPostId) {
    tasks.push((async () => {
      try {
        const token = await getValidLinkedInToken(user);
        if (!token) {
          stats.linkedin = { error: "no_token" };
          return;
        }
        const orgUrn = user.linkedinOrgUrn;
        if (!orgUrn) {
          stats.linkedin = { error: "no_org" };
          return;
        }
        const shareUrn = video.linkedinPostId!;
        const headers = {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": "202509",
          "X-Restli-Protocol-Version": "2.0.0",
        };
        const statsRes = await fetch(
          `${LINKEDIN_API_BASE_STATS}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&shares=List(${encodeURIComponent(shareUrn)})`,
          { headers },
        ).then((r) => (r.ok ? r.json() : null)).catch(() => null) as any;

        const el = statsRes?.elements?.[0]?.totalShareStatistics || {};
        stats.linkedin = {
          impressions: Number(el.impressionCount || 0),
          clicks: Number(el.clickCount || 0),
          reactions: Number(el.likeCount || 0),
          comments: Number(el.commentCount || 0),
          shares: Number(el.shareCount || 0),
        };
      } catch (err: any) {
        stats.linkedin = { error: err.message };
      }
    })());
  }

  // ── X (Twitter) ───────────────────────────────────────────────────────────
  if (video.xPostId) {
    tasks.push((async () => {
      try {
        const token = await getValidXToken(user);
        if (!token) {
          stats.x = { error: "no_token" };
          return;
        }
        // non_public_metrics (includes impression_count) is available when
        // using an OAuth 2.0 user-context access token for the tweet owner's posts.
        // getValidXToken returns exactly that token (not an app-level bearer).
        const tweetRes = await fetch(
          `https://api.twitter.com/2/tweets/${video.xPostId}?tweet.fields=public_metrics,non_public_metrics`,
          { headers: { Authorization: `Bearer ${token}` } },
        ).then((r) => (r.ok ? r.json() : null)).catch(() => null) as {
          data?: {
            public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; bookmark_count?: number; quote_count?: number };
            non_public_metrics?: { impression_count?: number };
          };
        } | null;

        if (!tweetRes?.data) {
          stats.x = { error: "not_found" };
          return;
        }
        const pm = tweetRes.data.public_metrics ?? {};
        const npm = tweetRes.data.non_public_metrics ?? {};
        stats.x = {
          impressions: Number(npm.impression_count ?? 0),
          likes: Number(pm.like_count ?? 0),
          retweets: Number(pm.retweet_count ?? 0),
          replies: Number(pm.reply_count ?? 0),
          quotes: Number(pm.quote_count ?? 0),
          bookmarks: Number(pm.bookmark_count ?? 0),
        };
      } catch (err: any) {
        stats.x = { error: err.message };
      }
    })());
  }

  // ── TikTok ───────────────────────────────────────────────────────────────
  // The app stores a publish_id (not video_id) and the current OAuth scope
  // (user.info.basic, video.upload) does not include video.list or
  // video.list.search, so per-video metrics are unavailable. Return a
  // structured unavailable response so the frontend can render a clear message.
  if (video.tiktokPublishId) {
    stats.tiktok = { available: false, reason: "scope_limited" };
  }

  await Promise.all(tasks);
  res.json({ videoId: id, stats });
});

export default router;
