import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubTasks, slaBreaches, slaPolicies, tickets, users } from "@workspace/db/schema";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeRole } from "@workspace/roles";
import { createNotification } from "../../lib/notifications";
import { recordActivity, type ActivityEntityType } from "../../lib/activity";
import { getDireccionIds, seedSlaPoliciesIfEmpty, stageLabel } from "../../lib/sla";

/**
 * SLA por etapa + carga de trabajo por persona.
 *
 * Va fuera del prefijo /hub a propósito: la carga de trabajo la necesita
 * cualquiera que asigne (tickets incluidos) y el motivo del atraso lo
 * responde cada responsable, tenga o no acceso al Hub.
 */
const router: IRouter = Router();

type Me = { id: number; name: string | null; email: string; teamRole: string; role: string };

async function loadMe(req: Request): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return null;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  return me ? { id: me.id, name: me.name, email: me.email, teamRole: me.teamRole, role: me.role } : null;
}

const isDireccion = (me: Me) => normalizeRole(me.teamRole, me.role === "superadmin") === "ceo";
/** Ajustar SLAs: dirección (CEO y ventas/ejecutivo, igual que playbooks). */
const canManageSla = (me: Me) => {
  const role = normalizeRole(me.teamRole, me.role === "superadmin");
  return role === "ceo" || role === "ventas";
};

/* ------------------------------------------------------------------ */
/* Carga de trabajo por persona                                        */
/* ------------------------------------------------------------------ */

const TICKET_OPEN = ["abierto", "en_progreso", "en_revision"];

/**
 * GET /team/workload — cuántos ítems abiertos tiene cada persona.
 * Solo cuenta (sin títulos ni montos), así que puede verlo cualquier
 * usuario aprobado al momento de asignar.
 */
router.get("/team/workload", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  try {
    const [team, taskCounts, ticketCounts] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, picture: users.picture })
        .from(users).where(eq(users.approvalStatus, "approved")),
      db.select({ userId: hubTasks.assigneeId, n: sql<number>`count(*)::int` })
        .from(hubTasks)
        .where(and(ne(hubTasks.stage, "done"), sql`${hubTasks.assigneeId} IS NOT NULL`))
        .groupBy(hubTasks.assigneeId),
      db.select({ userId: tickets.assignedTo, n: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(inArray(tickets.status, TICKET_OPEN), sql`${tickets.assignedTo} IS NOT NULL`))
        .groupBy(tickets.assignedTo),
    ]);

    const taskBy = new Map(taskCounts.map((c) => [c.userId, c.n]));
    const ticketBy = new Map(ticketCounts.map((c) => [c.userId, c.n]));

    const members = team.map((u) => {
      const openTasks = taskBy.get(u.id) ?? 0;
      const openTickets = ticketBy.get(u.id) ?? 0;
      const total = openTasks + openTickets;
      // Semáforo simple: verde = con espacio, amarillo = cargado, rojo = saturado.
      const semaphore: "green" | "yellow" | "red" = total >= 8 ? "red" : total >= 4 ? "yellow" : "green";
      return { id: u.id, name: u.name, email: u.email, picture: u.picture, openTasks, openTickets, total, semaphore };
    });

    res.json({ members });
  } catch (err) {
    console.error("[team/workload GET]", err);
    res.status(500).json({ error: "Error al calcular la carga de trabajo" });
  }
});

/* ------------------------------------------------------------------ */
/* Políticas de SLA                                                    */
/* ------------------------------------------------------------------ */

router.get("/sla/policies", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    await seedSlaPoliciesIfEmpty();
    const rows = await db.select().from(slaPolicies)
      .orderBy(slaPolicies.entityType, slaPolicies.stage);
    res.json({ policies: rows, canManage: canManageSla(me) });
  } catch (err) {
    console.error("[sla/policies GET]", err);
    res.status(500).json({ error: "Error al obtener SLAs" });
  }
});

const patchPolicySchema = z.object({
  maxHours: z.coerce.number().int().min(0, "Horas inválidas").max(24 * 365),
});

router.patch("/sla/policies/:id", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!canManageSla(me)) { res.status(403).json({ error: "Solo la dirección puede ajustar SLAs" }); return; }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = patchPolicySchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" }); return; }

  const [row] = await db.update(slaPolicies)
    .set({ maxHours: parsed.data.maxHours, updatedAt: new Date() })
    .where(eq(slaPolicies.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "SLA no encontrado" }); return; }
  res.json(row);
});

/* ------------------------------------------------------------------ */
/* Vencimientos y motivo del atraso                                    */
/* ------------------------------------------------------------------ */

/**
 * GET /sla/breaches — vencimientos. La dirección ve todos; el resto solo
 * los propios. `?pending=1` filtra los que aún esperan motivo.
 */
router.get("/sla/breaches", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  try {
    const pendingOnly = String(req.query.pending || "") === "1";
    const conds = [];
    if (!isDireccion(me)) conds.push(eq(slaBreaches.responsibleId, me.id));
    if (pendingOnly) conds.push(isNull(slaBreaches.reason));

    const rows = await db.select().from(slaBreaches)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(slaBreaches.notifiedAt))
      .limit(200);

    const ids = Array.from(new Set(rows.flatMap((r) => [r.responsibleId, r.reasonById]).filter((n): n is number => n != null)));
    const people = ids.length
      ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    res.json({
      breaches: rows.map((r) => ({
        ...r,
        stageLabel: stageLabel(r.stage),
        responsible: r.responsibleId ? byId.get(r.responsibleId) ?? null : null,
        reasonBy: r.reasonById ? byId.get(r.reasonById) ?? null : null,
      })),
      isDireccion: isDireccion(me),
    });
  } catch (err) {
    console.error("[sla/breaches GET]", err);
    res.status(500).json({ error: "Error al obtener vencimientos" });
  }
});

const reasonSchema = z.object({
  reason: z.string({ required_error: "Cuéntanos el motivo" }).trim().min(3, "El motivo es muy corto").max(1000),
});

/** POST /sla/breaches/:id/reason — el responsable (o la dirección) registra el motivo. */
router.post("/sla/breaches/:id/reason", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const parsed = reasonSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" }); return; }

  const [breach] = await db.select().from(slaBreaches).where(eq(slaBreaches.id, id)).limit(1);
  if (!breach) { res.status(404).json({ error: "Vencimiento no encontrado" }); return; }
  if (breach.responsibleId !== me.id && !isDireccion(me)) {
    res.status(403).json({ error: "Este atraso no es tuyo" });
    return;
  }
  if (breach.reason) { res.status(409).json({ error: "Este atraso ya tiene motivo registrado" }); return; }

  const now = new Date();
  const [row] = await db.update(slaBreaches)
    .set({ reason: parsed.data.reason, reasonById: me.id, reasonAt: now })
    .where(eq(slaBreaches.id, id))
    .returning();

  // Queda en la bitácora, visible para la dirección.
  recordActivity({
    actorId: me.id,
    entityType: breach.entityType as ActivityEntityType,
    entityId: breach.entityId,
    entityLabel: breach.label,
    action: "commented",
    detail: { sla: "motivo_atraso", stage: breach.stage, reason: parsed.data.reason.slice(0, 500) },
  });

  // Avisar a la dirección que el motivo llegó.
  try {
    const direccion = (await getDireccionIds()).filter((uid) => uid !== me.id);
    for (const uid of direccion) {
      await createNotification({
        userId: uid,
        type: "system",
        title: `📝 Motivo de atraso: "${breach.label}"`,
        body: `${me.name || me.email}: ${parsed.data.reason.slice(0, 200)}`,
        link: "/mi-dia",
      });
    }
  } catch (err: any) {
    console.error("[sla] notify direccion failed:", err?.message || err);
  }

  res.json(row);
});

export default router;
