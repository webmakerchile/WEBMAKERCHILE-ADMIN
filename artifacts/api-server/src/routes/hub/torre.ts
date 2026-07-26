import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { companyGoals, goals, projectAssignments, users } from "@workspace/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { canSeeMoney, normalizeRole } from "@workspace/roles";
import { createNotification } from "../../lib/notifications";
import { recordActivity } from "../../lib/activity";
import { PERIODS, currentKeys, isPeriod, periodKey, type Period } from "../../lib/periods";
import { computeSemaforo, computeProfitability } from "../../lib/torre";

/**
 * Torre de control del CEO: semáforo por área, metas de empresa y
 * rentabilidad por proyecto. Solo dirección — y los montos, además, solo
 * salen del servidor para roles con canSeeMoney.
 */
const router: IRouter = Router();

type Me = { id: number; name: string | null; email: string; teamRole: string | null; role: string };

async function loadMe(req: Request, res: Response): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) { res.status(401).json({ error: "No autenticado" }); return null; }
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return null; }
  return me as Me;
}

const roleOf = (me: Me) => normalizeRole(me.teamRole, me.role === "superadmin");
const isCeo = (me: Me) => roleOf(me) === "ceo";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

/* ============================== Semáforo ================================= */

/** GET /hub/torre/semaforo — estado por área con el detalle que lo explica. */
router.get("/hub/torre/semaforo", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!isCeo(me)) { res.status(403).json({ error: "Solo dirección" }); return; }
  try {
    const areas = await computeSemaforo();
    res.json({ areas });
  } catch (err) {
    console.error("[hub/torre/semaforo GET]", err);
    res.status(500).json({ error: "Error al calcular el semáforo" });
  }
});

/* =========================== Metas de empresa ============================ */

interface ChildOut {
  id: number;
  assignedTo: number;
  assignedName: string;
  target: number | null;
  progress: number;
  status: string;
}

async function companyGoalOut(rows: Array<typeof companyGoals.$inferSelect>) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const children = await db
    .select({
      id: goals.id, companyGoalId: goals.companyGoalId, assignedTo: goals.assignedTo,
      target: goals.target, progress: goals.progress, status: goals.status,
    })
    .from(goals)
    .where(inArray(goals.companyGoalId, ids));
  const userIds = [...new Set(children.map((c) => c.assignedTo))];
  const names = userIds.length
    ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds))
    : [];
  const nameOf = new Map(names.map((u) => [u.id, u.name || u.email] as const));

  const keys = currentKeys();
  return rows.map((r) => {
    const hijas: ChildOut[] = children
      .filter((c) => c.companyGoalId === r.id)
      .map((c) => ({ id: c.id, assignedTo: c.assignedTo, assignedName: nameOf.get(c.assignedTo) ?? `#${c.assignedTo}`, target: c.target, progress: c.progress, status: c.status }));
    const progress = hijas.reduce((s, h) => s + h.progress, 0);
    const childTarget = hijas.reduce((s, h) => s + (h.target ?? 0), 0);
    const target = r.target ?? (childTarget > 0 ? childTarget : null);
    const pct = target && target > 0
      ? Math.round((Math.min(progress, target) / target) * 100)
      : hijas.length > 0
        ? Math.round((hijas.filter((h) => h.status === "cumplida").length / hijas.length) * 100)
        : 0;
    return {
      id: r.id, title: r.title, description: r.description,
      period: r.period, periodKey: r.periodKey, target,
      progress, pct,
      vigente: keys[r.period as Period] === r.periodKey,
      children: hijas,
      createdAt: r.createdAt,
    };
  });
}

/** GET /hub/torre/company-goals — vigentes por defecto; ?history=1 todas. */
router.get("/hub/torre/company-goals", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!isCeo(me)) { res.status(403).json({ error: "Solo dirección" }); return; }
  try {
    const historial = String(req.query.history || "") === "1";
    let rows = await db.select().from(companyGoals).orderBy(desc(companyGoals.createdAt));
    if (!historial) {
      const keys = currentKeys();
      rows = rows.filter((r) => isPeriod(r.period) && keys[r.period] === r.periodKey);
    }
    res.json({ companyGoals: await companyGoalOut(rows) });
  } catch (err) {
    console.error("[hub/torre/company-goals GET]", err);
    res.status(500).json({ error: "Error al obtener metas de empresa" });
  }
});

const distSchema = z.object({
  userId: z.coerce.number().int().positive(),
  target: z.union([z.null(), z.coerce.number().int().min(1).max(100_000)]).default(null),
});

const createCompanyGoalSchema = z.object({
  title: z.string().trim().min(3, "La meta necesita un título").max(200),
  description: z.string().trim().max(2000).default(""),
  period: z.string().refine(isPeriod, "Período inválido"),
  target: z.union([z.null(), z.coerce.number().int().min(1).max(1_000_000)]).default(null),
  distribution: z.array(distSchema).min(1, "Reparte la meta al menos a una persona"),
});

/**
 * POST /hub/torre/company-goals — crea la meta madre y una meta personal por
 * cada persona del reparto. La consolidación es siempre calculada: el avance
 * de la empresa es la suma de los avances individuales.
 */
router.post("/hub/torre/company-goals", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!isCeo(me)) { res.status(403).json({ error: "Solo dirección" }); return; }
  const parsed = createCompanyGoalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const data = parsed.data;
  try {
    const dupUsers = new Set<number>();
    for (const d of data.distribution) {
      if (dupUsers.has(d.userId)) { res.status(400).json({ error: "Hay personas repetidas en el reparto" }); return; }
      dupUsers.add(d.userId);
    }
    const people = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [...dupUsers]));
    if (people.length !== dupUsers.size) { res.status(400).json({ error: "Alguna persona del reparto no existe" }); return; }

    const key = periodKey(data.period as Period);
    const created = await db.transaction(async (tx) => {
      const [parent] = await tx
        .insert(companyGoals)
        .values({ title: data.title, description: data.description, period: data.period, periodKey: key, target: data.target, createdBy: me.id })
        .returning();
      await tx.insert(goals).values(data.distribution.map((d) => ({
        title: data.title,
        description: data.description,
        period: data.period,
        periodKey: key,
        assignedTo: d.userId,
        createdBy: me.id,
        target: d.target,
        companyGoalId: parent.id,
      })));
      return parent;
    });

    await Promise.allSettled(data.distribution.map((d) => createNotification({
      userId: d.userId,
      type: "system",
      title: "Nueva meta de empresa",
      body: `Te toca parte de la meta "${data.title}"${d.target ? ` (tu parte: ${d.target})` : ""}.`,
      link: "/metas",
    })));
    await recordActivity({
      actorId: me.id, action: "created", entityType: "goal", entityId: created.id,
      entityLabel: `Meta de empresa: ${data.title}`,
    });

    const [out] = await companyGoalOut([created]);
    res.status(201).json({ companyGoal: out });
  } catch (err) {
    console.error("[hub/torre/company-goals POST]", err);
    res.status(500).json({ error: "Error al crear la meta de empresa" });
  }
});

/** DELETE /hub/torre/company-goals/:id — borra la madre y sus hijas. */
router.delete("/hub/torre/company-goals/:id", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!isCeo(me)) { res.status(403).json({ error: "Solo dirección" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Id inválido" }); return; }
  try {
    const [row] = await db.select().from(companyGoals).where(eq(companyGoals.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Meta no encontrada" }); return; }
    await db.transaction(async (tx) => {
      await tx.delete(goals).where(eq(goals.companyGoalId, id));
      await tx.delete(companyGoals).where(eq(companyGoals.id, id));
    });
    await recordActivity({
      actorId: me.id, action: "deleted", entityType: "goal", entityId: id,
      entityLabel: `Meta de empresa: ${row.title}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[hub/torre/company-goals DELETE]", err);
    res.status(500).json({ error: "Error al eliminar la meta de empresa" });
  }
});

/* ============================ Rentabilidad =============================== */

function monthRange(now: Date = new Date()): { from: string; to: string } {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/**
 * GET /hub/torre/rentabilidad?from&to — horas reales × costo hora vs. neto
 * del contrato. Montos censurados en el servidor: exige canSeeMoney.
 */
router.get("/hub/torre/rentabilidad", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!isCeo(me) || !canSeeMoney(roleOf(me))) { res.status(403).json({ error: "Solo dirección" }); return; }
  try {
    const def = monthRange();
    const from = typeof req.query.from === "string" && DATE_RE.test(req.query.from) ? req.query.from : def.from;
    const to = typeof req.query.to === "string" && DATE_RE.test(req.query.to) ? req.query.to : def.to;
    if (from > to) { res.status(400).json({ error: "Rango de fechas inválido" }); return; }
    const projects = await computeProfitability(from, to);
    res.json({ from, to, projects });
  } catch (err) {
    console.error("[hub/torre/rentabilidad GET]", err);
    res.status(500).json({ error: "Error al calcular rentabilidad" });
  }
});

const putAssignSchema = z.object({
  projectRef: z.string().trim().min(1).max(100),
  assignments: z.array(z.object({
    userId: z.coerce.number().int().positive(),
    allocationPct: z.coerce.number().int().min(1).max(100),
  })).max(50),
});

/** PUT /hub/torre/assignments — reemplaza la dedicación de un proyecto. */
router.put("/hub/torre/assignments", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!isCeo(me)) { res.status(403).json({ error: "Solo dirección" }); return; }
  const parsed = putAssignSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }); return; }
  const { projectRef, assignments } = parsed.data;
  const seen = new Set<number>();
  for (const a of assignments) {
    if (seen.has(a.userId)) { res.status(400).json({ error: "Hay personas repetidas" }); return; }
    seen.add(a.userId);
  }
  try {
    // Invariante financiero: la dedicación total de una persona entre TODOS
    // los proyectos no puede superar 100%, o sus horas se contarían doble.
    if (assignments.length > 0) {
      const otras = await db
        .select({ userId: projectAssignments.userId, projectRef: projectAssignments.projectRef, allocationPct: projectAssignments.allocationPct })
        .from(projectAssignments)
        .where(inArray(projectAssignments.userId, assignments.map((a) => a.userId)));
      const totalDe = new Map<number, number>();
      for (const o of otras) {
        if (o.projectRef === projectRef) continue; // se reemplaza
        totalDe.set(o.userId, (totalDe.get(o.userId) ?? 0) + o.allocationPct);
      }
      const excedido = assignments.find((a) => (totalDe.get(a.userId) ?? 0) + a.allocationPct > 100);
      if (excedido) {
        const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, excedido.userId)).limit(1);
        res.status(400).json({ error: `${u?.name || u?.email || `#${excedido.userId}`} quedaría con más de 100% de dedicación sumando sus otros proyectos` });
        return;
      }
    }
    await db.transaction(async (tx) => {
      await tx.delete(projectAssignments).where(eq(projectAssignments.projectRef, projectRef));
      if (assignments.length > 0) {
        await tx.insert(projectAssignments).values(assignments.map((a) => ({
          userId: a.userId, projectRef, allocationPct: a.allocationPct,
        })));
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[hub/torre/assignments PUT]", err);
    res.status(500).json({ error: "Error al guardar asignaciones" });
  }
});

export default router;
export { PERIODS, localToday };
