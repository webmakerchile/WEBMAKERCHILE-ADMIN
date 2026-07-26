import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { comments, reviews, users, videos } from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createNotification } from "../../lib/notifications";
import { handoffVideoApproved } from "../../lib/handoffs";
import { TEAM_ROLES, canManageTeam, canReview, isTeamRole, normalizeRole } from "@workspace/roles";

const router: IRouter = Router();

function getUser(req: Request): { id: number; teamRole?: string; role?: string; name?: string | null; email?: string } | null {
  const u = req.user as any;
  return u?.id ? u : null;
}

function unauthorized(res: Response) {
  res.status(401).json({ error: "No autenticado" });
}

function badRequest(res: Response, msg: string) {
  res.status(400).json({ error: msg });
}

const VALID_WORKFLOW = new Set(["borrador", "en_revision", "aprobado", "programado", "publicado"]);

/** Parse `@email` mentions in body and resolve them to known user ids. */
function extractMentionEmails(body: string): string[] {
  // Match @ followed by an email-ish handle (allowing dots, dashes).
  const re = /(?:^|\s)@([a-zA-Z0-9._+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

// ---------- Team ----------

router.get("/team/members", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      picture: users.picture,
      teamRole: users.teamRole,
      role: users.role,
      discordUserId: users.discordUserId,
      discordTag: users.discordTag,
      approvalStatus: users.approvalStatus,
    })
    .from(users)
    .orderBy(asc(users.id));
  // El rol que ve el panel siempre es el normalizado (los roles antiguos
  // 'editor'/'reviewer' se mapean, y un superadmin siempre es CEO).
  res.json(rows.map(({ role, ...r }) => ({ ...r, teamRole: normalizeRole(r.teamRole, role === "superadmin") })));
});

router.patch("/team/members/:id/role", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  // Only reviewers can promote/demote others.
  const [meRow] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!meRow || !canManageTeam(meRow.teamRole, meRow.role === "superadmin")) {
    res.status(403).json({ error: "Solo la dirección puede cambiar roles" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  const role = String(req.body?.teamRole || "");
  if (!isTeamRole(role)) return badRequest(res, `Rol inválido. Válidos: ${TEAM_ROLES.join(", ")}`);
  // Un superadmin siempre es CEO: dejarlo cambiar de rol lo dejaría fuera del panel.
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (target?.role === "superadmin" && role !== "ceo") {
    return badRequest(res, "El superadministrador siempre tiene rol CEO");
  }
  const [row] = await db
    .update(users)
    .set({ teamRole: role })
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, teamRole: users.teamRole });
  if (!row) return badRequest(res, "Usuario no encontrado");
  res.json(row);
});

// ---------- Comments ----------

router.get("/content/videos/:videoId/comments", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return badRequest(res, "videoId inválido");

  const rows = await db
    .select({
      id: comments.id,
      videoId: comments.videoId,
      userId: comments.userId,
      authorId: comments.userId,
      body: comments.body,
      mentions: comments.mentions,
      createdAt: comments.createdAt,
      authorName: users.name,
      authorEmail: users.email,
      authorPicture: users.picture,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.videoId, videoId))
    .orderBy(asc(comments.createdAt));
  res.json(rows);
});

router.post("/content/videos/:videoId/comments", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return badRequest(res, "videoId inválido");
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) return badRequest(res, "El comentario no puede estar vacío");
  if (body.length > 4000) return badRequest(res, "Comentario demasiado largo");

  const [video] = await db.select({ id: videos.id, title: videos.title }).from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return badRequest(res, "Video no encontrado");

  // Resolve @email mentions to user ids by looking them up in `users`.
  const emails = extractMentionEmails(body);
  let mentionIds: number[] = [];
  if (emails.length) {
    const matched = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(inArray(sql`lower(${users.email})`, emails));
    mentionIds = matched.map((u) => u.id);

    // Notify each mentioned user (skip self).
    const [meRow] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, me.id)).limit(1);
    const author = meRow?.name || meRow?.email || "Alguien";
    await Promise.all(
      matched
        .filter((u) => u.id !== me.id)
        .map((u) =>
          createNotification({
            userId: u.id,
            type: "system",
            title: `${author} te mencionó en "${video.title}"`,
            body: body.slice(0, 200),
            link: `/videos?select=${video.id}`,
          }),
        ),
    );
  }

  const [row] = await db
    .insert(comments)
    .values({ videoId, userId: me.id, body, mentions: mentionIds })
    .returning();
  res.status(201).json(row);
});

router.delete("/comments/:id", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return badRequest(res, "ID inválido");
  // Only the author can delete their own comment.
  const deleted = await db
    .delete(comments)
    .where(and(eq(comments.id, id), eq(comments.userId, me.id)))
    .returning({ id: comments.id });
  if (!deleted.length) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.status(204).end();
});

// ---------- Reviews / approval flow ----------

/** Returns the latest non-resolved review for a video (or null). */
async function getActiveReview(videoId: number) {
  const [row] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.videoId, videoId), eq(reviews.status, "pending")))
    .orderBy(desc(reviews.createdAt))
    .limit(1);
  return row || null;
}

router.get("/content/videos/:videoId/reviews", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return badRequest(res, "videoId inválido");
  const rows = await db
    .select({
      id: reviews.id,
      videoId: reviews.videoId,
      requestedBy: reviews.requestedBy,
      requesterId: reviews.requestedBy,
      assignedTo: reviews.assignedTo,
      reviewerId: reviews.assignedTo,
      status: reviews.status,
      message: reviews.message,
      decisionNote: reviews.message,
      resolvedAt: reviews.resolvedAt,
      decidedAt: reviews.resolvedAt,
      createdAt: reviews.createdAt,
      assignedName: users.name,
      reviewerName: users.name,
      assignedEmail: users.email,
      reviewerEmail: users.email,
    })
    .from(reviews)
    .leftJoin(users, eq(users.id, reviews.assignedTo))
    .where(eq(reviews.videoId, videoId))
    .orderBy(desc(reviews.createdAt));
  const requesterIds = Array.from(new Set(rows.map((r) => r.requestedBy).filter(Boolean) as number[]));
  let nameById = new Map<number, string | null>();
  if (requesterIds.length) {
    const reqs = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, requesterIds));
    nameById = new Map(reqs.map((u) => [u.id, u.name || u.email]));
  }
  res.json(rows.map((r) => ({ ...r, requesterName: nameById.get(r.requestedBy) ?? null })));
});

router.post("/content/videos/:videoId/reviews", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return badRequest(res, "videoId inválido");
  const assignedTo = Number(req.body?.assignedTo ?? req.body?.reviewerId);
  if (!Number.isFinite(assignedTo)) return badRequest(res, "Falta el revisor");
  const rawMsg = req.body?.message ?? req.body?.note;
  const message = typeof rawMsg === "string" ? rawMsg.slice(0, 1000) : null;

  const [video] = await db.select({ id: videos.id, title: videos.title }).from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return badRequest(res, "Video no encontrado");
  const [reviewer] = await db.select({ id: users.id, teamRole: users.teamRole, role: users.role }).from(users).where(eq(users.id, assignedTo)).limit(1);
  if (!reviewer) return badRequest(res, "Revisor no encontrado");
  if (!canReview(reviewer.teamRole, reviewer.role === "superadmin")) return badRequest(res, "El usuario seleccionado no puede aprobar contenido");

  // Resolve any pending reviews for this video before creating a new one.
  await db
    .update(reviews)
    .set({ status: "changes_requested", resolvedAt: new Date() })
    .where(and(eq(reviews.videoId, videoId), eq(reviews.status, "pending")));

  const [row] = await db
    .insert(reviews)
    .values({ videoId, requestedBy: me.id, assignedTo, message })
    .returning();
  await db
    .update(videos)
    .set({ workflowStatus: "en_revision", workflowStatusSince: new Date(), updatedAt: new Date() })
    .where(eq(videos.id, videoId));

  if (assignedTo !== me.id) {
    const [meRow] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, me.id)).limit(1);
    const author = meRow?.name || meRow?.email || "Alguien";
    await createNotification({
      userId: assignedTo,
      type: "system",
      title: `${author} pidió tu revisión en "${video.title}"`,
      body: message || "Revisa el video y aprueba o solicita cambios.",
      link: `/videos?select=${video.id}`,
    });
  }
  res.status(201).json(row);
});

router.post("/content/videos/:videoId/reviews/decision", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return badRequest(res, "videoId inválido");
  const rawDecision = String(req.body?.decision || "");
  const decisionMap: Record<string, "approve" | "request_changes"> = {
    approve: "approve",
    approved: "approve",
    request_changes: "request_changes",
    changes_requested: "request_changes",
  };
  const decision = decisionMap[rawDecision];
  if (!decision) return badRequest(res, "Decisión inválida");
  const rawMsg = req.body?.message ?? req.body?.note;
  const message = typeof rawMsg === "string" ? rawMsg.slice(0, 1000) : null;

  const active = await getActiveReview(videoId);
  // Only the assigned reviewer (with reviewer role) can decide; if no active
  // review exists, reviewers can also short-circuit and approve directly.
  const [meRow] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!meRow) return unauthorized(res);
  if (active) {
    if (active.assignedTo !== me.id) {
      res.status(403).json({ error: "Solo el revisor asignado puede decidir" });
      return;
    }
  } else if (!canReview(meRow.teamRole, meRow.role === "superadmin")) {
    res.status(403).json({ error: "Tu rol no puede aprobar contenido" });
    return;
  }

  const newStatus = decision === "approve" ? "approved" : "changes_requested";
  if (active) {
    await db
      .update(reviews)
      .set({ status: newStatus, message: message || active.message, resolvedAt: new Date() })
      .where(eq(reviews.id, active.id));
  } else {
    // Self-approval shortcut: log a row so history reflects it.
    await db.insert(reviews).values({
      videoId,
      requestedBy: me.id,
      assignedTo: me.id,
      status: newStatus,
      message,
      resolvedAt: new Date(),
    });
  }

  const wf = decision === "approve" ? "aprobado" : "borrador";
  await db
    .update(videos)
    .set({ workflowStatus: wf, workflowStatusSince: new Date(), updatedAt: new Date() })
    .where(eq(videos.id, videoId));

  if (decision === "approve") {
    // Handoff: video aprobado → cola de redes con fecha sugerida (idempotente).
    void handoffVideoApproved(videoId, me.id).catch((err) => console.error("[handoff video_aprobado]", err));
  }

  // Notify the requester (if not the same person).
  if (active && active.requestedBy !== me.id) {
    const [video] = await db.select({ title: videos.title }).from(videos).where(eq(videos.id, videoId)).limit(1);
    const reviewerName = meRow.name || meRow.email || "El revisor";
    await createNotification({
      userId: active.requestedBy,
      type: "system",
      title:
        decision === "approve"
          ? `${reviewerName} aprobó "${video?.title || "tu video"}"`
          : `${reviewerName} solicitó cambios en "${video?.title || "tu video"}"`,
      body: message || undefined,
      link: `/videos?select=${videoId}`,
    });
  }

  res.json({ ok: true, workflowStatus: wf });
});

/** GET reviews assigned to the current user that are still pending. */
router.get("/reviews/pending", async (req, res) => {
  const me = getUser(req);
  if (!me) return unauthorized(res);
  const rows = await db
    .select({
      id: reviews.id,
      videoId: reviews.videoId,
      requestedBy: reviews.requestedBy,
      message: reviews.message,
      createdAt: reviews.createdAt,
      videoTitle: videos.title,
    })
    .from(reviews)
    .leftJoin(videos, eq(videos.id, reviews.videoId))
    .where(and(eq(reviews.assignedTo, me.id), eq(reviews.status, "pending")))
    .orderBy(desc(reviews.createdAt));
  res.json(rows);
});

export default router;
