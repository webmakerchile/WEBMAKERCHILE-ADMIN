import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { activityLog, activityDaySummaries, users } from "@workspace/db/schema";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { normalizeRole } from "@workspace/roles";
import { isValidDateStr } from "../jornada";

/**
 * Bitácora de actividad.
 * - La propia actividad la puede ver cualquier usuario aprobado.
 * - La actividad de terceros / global solo la ve quien supervisa
 *   (dirección, ventas y RRHH — mismo criterio que jornada/asistencia).
 */
const router: IRouter = Router();

type Me = { id: number; role?: string; teamRole?: string };
const me = (req: Request) => req.user as Me;

export function canSeeTeamActivity(req: Request): boolean {
  const u = me(req);
  const role = normalizeRole(u.teamRole, u.role === "superadmin");
  return role === "ceo" || role === "ventas" || role === "rrhh";
}

/**
 * GET /activity
 * Query: userId (opcional; "all" = global), from/to (YYYY-MM-DD, opcional),
 *        entityType (opcional), limit (<=200).
 */
router.get("/activity", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const rawUser = String(req.query["userId"] ?? user.id);
    const wantsAll = rawUser === "all";
    const targetId = wantsAll ? null : Number(rawUser);
    if (!wantsAll && !Number.isFinite(targetId)) {
      res.status(400).json({ error: "userId inválido" });
      return;
    }
    if ((wantsAll || targetId !== user.id) && !canSeeTeamActivity(req)) {
      res.status(403).json({ error: "Tu rol no puede ver la actividad del equipo" });
      return;
    }

    const conds: SQL[] = [];
    if (!wantsAll) conds.push(eq(activityLog.actorId, targetId as number));

    const from = String(req.query["from"] ?? "");
    const to = String(req.query["to"] ?? "");
    if (from) {
      if (!isValidDateStr(from)) { res.status(400).json({ error: "from inválido (YYYY-MM-DD)" }); return; }
      conds.push(sql`(${activityLog.createdAt} AT TIME ZONE 'America/Santiago')::date >= ${from}::date`);
    }
    if (to) {
      if (!isValidDateStr(to)) { res.status(400).json({ error: "to inválido (YYYY-MM-DD)" }); return; }
      conds.push(sql`(${activityLog.createdAt} AT TIME ZONE 'America/Santiago')::date <= ${to}::date`);
    }
    const entityType = String(req.query["entityType"] ?? "");
    if (entityType) conds.push(eq(activityLog.entityType, entityType));

    const limit = Math.min(Math.max(Number(req.query["limit"]) || 50, 1), 200);

    const rows = await db
      .select({
        id: activityLog.id,
        actorId: activityLog.actorId,
        actorName: users.name,
        actorEmail: users.email,
        actorPicture: users.picture,
        entityType: activityLog.entityType,
        entityId: activityLog.entityId,
        entityLabel: activityLog.entityLabel,
        action: activityLog.action,
        detail: activityLog.detail,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.actorId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);

    res.json({ items: rows, canSeeTeam: canSeeTeamActivity(req) });
  } catch (err) {
    console.error("[activity GET]", err);
    res.status(500).json({ error: "Error al cargar la actividad" });
  }
});

/**
 * GET /activity/summaries — historial de resúmenes de jornada.
 * Query: userId (opcional), from/to (YYYY-MM-DD), limit (<=90).
 */
router.get("/activity/summaries", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const targetId = Number(req.query["userId"] ?? user.id);
    if (!Number.isFinite(targetId)) { res.status(400).json({ error: "userId inválido" }); return; }
    if (targetId !== user.id && !canSeeTeamActivity(req)) {
      res.status(403).json({ error: "Tu rol no puede ver resúmenes de terceros" });
      return;
    }

    const conds: SQL[] = [eq(activityDaySummaries.userId, targetId)];
    const from = String(req.query["from"] ?? "");
    const to = String(req.query["to"] ?? "");
    if (from) {
      if (!isValidDateStr(from)) { res.status(400).json({ error: "from inválido" }); return; }
      conds.push(gte(activityDaySummaries.summaryDate, from));
    }
    if (to) {
      if (!isValidDateStr(to)) { res.status(400).json({ error: "to inválido" }); return; }
      conds.push(lte(activityDaySummaries.summaryDate, to));
    }
    const limit = Math.min(Math.max(Number(req.query["limit"]) || 30, 1), 90);

    const rows = await db
      .select()
      .from(activityDaySummaries)
      .where(and(...conds))
      .orderBy(desc(activityDaySummaries.summaryDate))
      .limit(limit);

    res.json({ items: rows });
  } catch (err) {
    console.error("[activity/summaries GET]", err);
    res.status(500).json({ error: "Error al cargar los resúmenes" });
  }
});

export default router;
