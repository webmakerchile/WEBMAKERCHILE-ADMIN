import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  campaigns,
  hashtagGroups,
  templates,
  videos,
  type TemplateFields,
} from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const ALLOWED_NETWORKS = ["tiktok", "instagram", "youtube", "linkedin", "x", "facebook"] as const;
type AllowedNetwork = (typeof ALLOWED_NETWORKS)[number];

function getUserId(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return u?.id ?? null;
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: "No autenticado" });
}

function badRequest(res: Response, msg: string): void {
  res.status(400).json({ error: msg });
}

function sanitizeNetworks(input: unknown): AllowedNetwork[] {
  if (!Array.isArray(input)) return [];
  const out: AllowedNetwork[] = [];
  for (const v of input) {
    if (typeof v === "string" && (ALLOWED_NETWORKS as readonly string[]).includes(v)) {
      if (!out.includes(v as AllowedNetwork)) out.push(v as AllowedNetwork);
    }
  }
  return out;
}

function sanitizeHashtags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const cleaned = v.trim().replace(/^#+/, "").toLowerCase().slice(0, 64);
    if (cleaned && /^[\p{L}\p{N}_]+$/u.test(cleaned) && !out.includes(cleaned)) {
      out.push(cleaned);
    }
    if (out.length >= 100) break;
  }
  return out;
}

const FIELD_KEYS: Array<keyof TemplateFields> = [
  "description",
  "tiktokDescription",
  "instagramDescription",
  "youtubeTitle",
  "youtubeDescription",
  "linkedinDescription",
  "xDescription",
  "facebookDescription",
];

function sanitizeFields(input: unknown): TemplateFields {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: TemplateFields = {};
  for (const key of FIELD_KEYS) {
    const v = src[key];
    if (typeof v === "string" && v.length > 0) {
      out[key] = v.slice(0, 5000);
    }
  }
  return out;
}

const VAR_RE = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;

function extractVariables(fields: TemplateFields): string[] {
  const set = new Set<string>();
  for (const key of FIELD_KEYS) {
    const v = fields[key];
    if (!v) continue;
    let m: RegExpExecArray | null;
    VAR_RE.lastIndex = 0;
    while ((m = VAR_RE.exec(v)) !== null) {
      set.add(m[1]);
    }
  }
  return Array.from(set).slice(0, 20);
}

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ─── Templates ──────────────────────────────────────────────────────────────

router.get("/library/templates", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(desc(templates.updatedAt));
  res.json(rows);
});

router.post("/library/templates", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
  if (!name) return badRequest(res, "El nombre es obligatorio");
  const description =
    typeof req.body?.description === "string" ? req.body.description.slice(0, 280) : null;
  const fields = sanitizeFields(req.body?.fields);
  const networks = sanitizeNetworks(req.body?.networks);
  const variables = extractVariables(fields);
  const [row] = await db
    .insert(templates)
    .values({ userId, name, description, fields, networks, variables })
    .returning();
  res.status(201).json(row);
});

router.patch("/library/templates/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") {
    const t = req.body.name.trim().slice(0, 80);
    if (!t) return badRequest(res, "El nombre no puede estar vacío");
    update.name = t;
  }
  if (req.body?.description !== undefined) {
    update.description =
      typeof req.body.description === "string" ? req.body.description.slice(0, 280) : null;
  }
  if (req.body?.fields !== undefined) {
    const fields = sanitizeFields(req.body.fields);
    update.fields = fields;
    update.variables = extractVariables(fields);
  }
  if (req.body?.networks !== undefined) {
    update.networks = sanitizeNetworks(req.body.networks);
  }
  const [row] = await db
    .update(templates)
    .set(update)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .returning();
  if (!row) return badRequest(res, "Plantilla no encontrada");
  res.json(row);
});

router.delete("/library/templates/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  const deleted = await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .returning({ id: templates.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Plantilla no encontrada" });
    return;
  }
  res.status(204).send();
});

// ─── Hashtag groups ─────────────────────────────────────────────────────────

router.get("/library/hashtag-groups", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const rows = await db
    .select()
    .from(hashtagGroups)
    .where(eq(hashtagGroups.userId, userId))
    .orderBy(asc(hashtagGroups.name));
  res.json(rows);
});

router.post("/library/hashtag-groups", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 64) : "";
  if (!name) return badRequest(res, "El nombre es obligatorio");
  const hashtags = sanitizeHashtags(req.body?.hashtags);
  const networks = sanitizeNetworks(req.body?.networks);
  const [row] = await db
    .insert(hashtagGroups)
    .values({ userId, name, hashtags, networks })
    .returning();
  res.status(201).json(row);
});

router.patch("/library/hashtag-groups/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") {
    const t = req.body.name.trim().slice(0, 64);
    if (!t) return badRequest(res, "El nombre no puede estar vacío");
    update.name = t;
  }
  if (req.body?.hashtags !== undefined) {
    update.hashtags = sanitizeHashtags(req.body.hashtags);
  }
  if (req.body?.networks !== undefined) {
    update.networks = sanitizeNetworks(req.body.networks);
  }
  const [row] = await db
    .update(hashtagGroups)
    .set(update)
    .where(and(eq(hashtagGroups.id, id), eq(hashtagGroups.userId, userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Grupo no encontrado" });
    return;
  }
  res.json(row);
});

router.delete("/library/hashtag-groups/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  const deleted = await db
    .delete(hashtagGroups)
    .where(and(eq(hashtagGroups.id, id), eq(hashtagGroups.userId, userId)))
    .returning({ id: hashtagGroups.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Grupo no encontrado" });
    return;
  }
  res.status(204).send();
});

// ─── Campaigns ──────────────────────────────────────────────────────────────

router.get("/library/campaigns", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(campaigns.createdAt));
  res.json(rows);
});

router.post("/library/campaigns", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
  if (!name) return badRequest(res, "El nombre es obligatorio");
  const description =
    typeof req.body?.description === "string" ? req.body.description.slice(0, 500) : null;
  const color = isHexColor(req.body?.color) ? req.body.color : "#f97316";
  const startsAt = parseDate(req.body?.startsAt);
  const endsAt = parseDate(req.body?.endsAt);
  const [row] = await db
    .insert(campaigns)
    .values({
      userId,
      name,
      description,
      color,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/library/campaigns/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") {
    const t = req.body.name.trim().slice(0, 80);
    if (!t) return badRequest(res, "El nombre no puede estar vacío");
    update.name = t;
  }
  if (req.body?.description !== undefined) {
    update.description =
      typeof req.body.description === "string" ? req.body.description.slice(0, 500) : null;
  }
  if (req.body?.color !== undefined) {
    update.color = isHexColor(req.body.color) ? req.body.color : "#f97316";
  }
  const startsAt = parseDate(req.body?.startsAt);
  if (startsAt !== undefined) update.startsAt = startsAt;
  const endsAt = parseDate(req.body?.endsAt);
  if (endsAt !== undefined) update.endsAt = endsAt;
  const [row] = await db
    .update(campaigns)
    .set(update)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Campaña no encontrada" });
    return;
  }
  res.json(row);
});

router.delete("/library/campaigns/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  // Detach videos before delete so we don't dangle a FK if it exists.
  await db
    .update(videos)
    .set({ campaignId: null, updatedAt: new Date() })
    .where(eq(videos.campaignId, id));
  const deleted = await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .returning({ id: campaigns.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Campaña no encontrada" });
    return;
  }
  res.status(204).send();
});

/** Single campaign with its videos and aggregated network status counters. */
router.get("/library/campaigns/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .limit(1);
  if (!campaign) {
    res.status(404).json({ error: "Campaña no encontrada" });
    return;
  }
  const items = await db
    .select()
    .from(videos)
    .where(eq(videos.campaignId, id))
    .orderBy(asc(videos.scheduledAt), asc(videos.id));

  const counters = {
    total: items.length,
    draft: 0,
    scheduled: 0,
    published: 0,
    partial: 0,
    error: 0,
    byNetwork: {
      youtube: 0,
      instagram: 0,
      tiktok: 0,
      linkedin: 0,
      x: 0,
      facebook: 0,
    } as Record<string, number>,
  };
  for (const v of items) {
    if (v.status === "draft" || v.status === "cover_generated") counters.draft++;
    else if (v.status === "scheduled") counters.scheduled++;
    else if (v.status === "published") counters.published++;
    else if (v.status === "partial") counters.partial++;
    else if (v.status === "error") counters.error++;
    if (v.youtubeVideoId) counters.byNetwork.youtube++;
    if (v.instagramMediaId) counters.byNetwork.instagram++;
    if (v.tiktokPublishId) counters.byNetwork.tiktok++;
    if (v.linkedinPostId) counters.byNetwork.linkedin++;
    if (v.xPostId) counters.byNetwork.x++;
    if (v.facebookPostId) counters.byNetwork.facebook++;
  }
  res.json({ campaign, videos: items, counters });
});

/** Bulk-attach (or detach by passing campaignId=null) videos to a campaign. */
router.post("/library/campaigns/attach-videos", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const idsRaw = req.body?.videoIds;
  const campaignIdRaw = req.body?.campaignId;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return badRequest(res, "Se requiere al menos un video");
  }
  const ids = idsRaw
    .map((v: unknown) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return badRequest(res, "IDs inválidos");
  if (ids.length > 200) return badRequest(res, "Máximo 200 videos por operación");
  let campaignId: number | null = null;
  if (campaignIdRaw !== null && campaignIdRaw !== undefined) {
    const parsed = Number(campaignIdRaw);
    if (!Number.isFinite(parsed)) return badRequest(res, "campaignId inválido");
    const [own] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, parsed), eq(campaigns.userId, userId)))
      .limit(1);
    if (!own) {
      res.status(404).json({ error: "Campaña no encontrada" });
      return;
    }
    campaignId = parsed;
  }
  // Defense in depth: only mutate videos that are either unattached or already
  // belong to a campaign owned by this user. The `videos` table is currently
  // single-tenant (no `userId`), but constraining the WHERE clause via the
  // user-scoped `campaigns` table prevents accidental cross-tenant updates if
  // tenancy is added later, and matches the same userId check we apply when
  // resolving the target campaign above.
  const ownedCampaignIds = (
    await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.userId, userId))
  ).map((r) => r.id);
  const ownershipFilter =
    ownedCampaignIds.length > 0
      ? or(isNull(videos.campaignId), inArray(videos.campaignId, ownedCampaignIds))
      : isNull(videos.campaignId);
  const updated = await db
    .update(videos)
    .set({ campaignId, updatedAt: new Date() })
    .where(and(inArray(videos.id, ids), ownershipFilter))
    .returning({ id: videos.id });
  res.json({ updated: updated.length, ids: updated.map((u) => u.id), campaignId });
});

// ─── AI hashtag suggestions ─────────────────────────────────────────────────

router.post("/content/hashtag-suggestions", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return unauthorized(res);
  const title =
    typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 280) : "";
  const description =
    typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 2200) : "";
  const networkRaw = typeof req.body?.network === "string" ? req.body.network : "instagram";
  const network = (ALLOWED_NETWORKS as readonly string[]).includes(networkRaw)
    ? (networkRaw as AllowedNetwork)
    : "instagram";
  if (!title && !description) {
    return badRequest(res, "Se necesita un título o descripción para sugerir hashtags");
  }

  const networkAdvice: Record<AllowedNetwork, string> = {
    instagram: "Mezcla 5 hashtags muy específicos (nicho) y 5 amplios. Sin espacios. En español.",
    tiktok: "Hashtags virales y nicho mezclados. Cortos. Sin espacios. En español.",
    youtube: "Hashtags relacionados a búsquedas reales en YouTube. En español.",
    linkedin: "Hashtags profesionales, relevantes a la industria. En español preferido.",
    x: "Hashtags muy cortos y de tendencia. Máximo 2-3 palabras. En español.",
    facebook: "Hashtags amplios, accesibles a la audiencia general. En español.",
  };

  const prompt = `Eres un experto en marketing en redes sociales. Sugiere exactamente 10 hashtags relevantes para ${network.toUpperCase()} basándote en el siguiente contenido. ${networkAdvice[network]}

Título: ${title || "(sin título)"}
Descripción: ${description || "(sin descripción)"}

Responde SOLO con un array JSON de 10 strings (sin el símbolo #). Ejemplo: ["webdev","chile","tipsdevs",...]. No agregues texto antes ni después.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = result.text || "[]";
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*$/g, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to recover by extracting the first [...] block.
      const m = cleaned.match(/\[[\s\S]*\]/);
      parsed = m ? JSON.parse(m[0]) : [];
    }
    const suggestions = sanitizeHashtags(parsed).slice(0, 10);
    res.json({ network, suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al generar sugerencias";
    res.status(500).json({ error: msg });
  }
});

export default router;
