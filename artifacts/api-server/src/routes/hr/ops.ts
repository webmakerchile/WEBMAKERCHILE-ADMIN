import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  employeeDocuments,
  leaveRequests,
  onboardingTemplates,
  onboardings,
  performanceReviews,
  users,
} from "@workspace/db/schema";
import { and, desc, eq, asc, sql } from "drizzle-orm";
import { canManagePeople, isTeamRole, normalizeRole } from "@workspace/roles";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";
import { recordActivity } from "../../lib/activity";
import {
  computePerformanceMetrics,
  defaultOnboardingItems,
  leaveBalance,
  seedOnboardingTemplatesIfEmpty,
} from "../../lib/hr-ops";

/**
 * Gestión RRHH: onboarding, vacaciones/permisos, evaluaciones y documentos.
 * Todo gateado por `canManagePeople` (dirección/RRHH) verificado en DB.
 */
const router: IRouter = Router();

type Me = { id: number; name: string | null; email: string; teamRole: string | null; role: string };

async function requireHr(req: Request, res: Response): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) {
    res.status(401).json({ error: "No autenticado" });
    return null;
  }
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me || !canManagePeople(me.teamRole, me.role === "superadmin")) {
    res.status(me ? 403 : 401).json({ error: me ? "Solo la dirección y RRHH pueden gestionar personas" : "No autenticado" });
    return null;
  }
  return me as Me;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/* ============================ Onboarding ================================= */

/** GET /hr/onboarding — plantillas + checklists asignados con avance. */
router.get("/hr/onboarding", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  await seedOnboardingTemplatesIfEmpty();
  const [templates, instances] = await Promise.all([
    db.select().from(onboardingTemplates).orderBy(asc(onboardingTemplates.role)),
    db.select({
      id: onboardings.id,
      userId: onboardings.userId,
      role: onboardings.role,
      items: onboardings.items,
      createdAt: onboardings.createdAt,
      completedAt: onboardings.completedAt,
      name: users.name,
      email: users.email,
    }).from(onboardings).innerJoin(users, eq(users.id, onboardings.userId)).orderBy(desc(onboardings.createdAt)),
  ]);
  res.json({
    templates,
    instances: instances.map((i) => ({
      ...i,
      progress: { done: i.items.filter((x) => x.done).length, total: i.items.length },
    })),
  });
});

const templateSchema = z.object({ items: z.array(z.string().trim().min(1).max(200)).max(40) });

/** PUT /hr/onboarding/templates/:role — edita la plantilla de un rol. */
router.put("/hr/onboarding/templates/:role", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const role = String(req.params.role);
  if (!isTeamRole(role)) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }
  const parsed = templateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const [row] = await db
    .insert(onboardingTemplates)
    .values({ role, items: parsed.data.items, updatedAt: new Date() })
    .onConflictDoUpdate({ target: onboardingTemplates.role, set: { items: parsed.data.items, updatedAt: new Date() } })
    .returning();
  res.json(row);
});

/**
 * Asigna (si no existe) el onboarding a una persona a partir de la plantilla
 * de su rol. Reutilizado por el endpoint manual y por la aprobación de acceso.
 */
export async function assignOnboarding(userId: number, assignedBy: number | null): Promise<boolean> {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return false;
  const role = normalizeRole(target.teamRole, target.role === "superadmin");
  await seedOnboardingTemplatesIfEmpty();
  const [tpl] = await db.select().from(onboardingTemplates).where(eq(onboardingTemplates.role, role)).limit(1);
  const items = (tpl?.items?.length ? tpl.items : defaultOnboardingItems(role)).map((text) => ({
    text, done: false, doneAt: null as string | null,
  }));
  const inserted = await db
    .insert(onboardings)
    .values({ userId, role, items, assignedBy })
    .onConflictDoNothing({ target: onboardings.userId })
    .returning({ id: onboardings.id });
  if (inserted.length === 0) return false;
  await createNotification({
    userId,
    type: "system",
    title: "Tu checklist de onboarding está listo",
    body: `Tienes ${items.length} pasos para completar tu incorporación. Revísalos en Mi Día.`,
    link: "/mi-dia",
  }).catch(() => {});
  if (assignedBy) {
    recordActivity({
      actorId: assignedBy,
      entityType: "persona",
      entityId: userId,
      entityLabel: `Onboarding de ${target.name || target.email}`,
      action: "created",
    });
  }
  return true;
}

/** POST /hr/onboarding/assign — asigna manualmente el onboarding a una persona. */
router.post("/hr/onboarding/assign", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const userId = Number((req.body as { userId?: unknown })?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "userId inválido" });
    return;
  }
  const created = await assignOnboarding(userId, me.id);
  if (!created) {
    res.status(409).json({ error: "Esa persona ya tiene un onboarding asignado (o no existe)" });
    return;
  }
  res.status(201).json({ ok: true });
});

/* ======================= Vacaciones y permisos =========================== */

/** GET /hr/leave?status=pendiente — solicitudes con nombre y saldo. */
router.get("/hr/leave", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const base = db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      note: leaveRequests.note,
      status: leaveRequests.status,
      decisionNote: leaveRequests.decisionNote,
      createdAt: leaveRequests.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId));
  const rows = status
    ? await base.where(eq(leaveRequests.status, status)).orderBy(desc(leaveRequests.createdAt))
    : await base.orderBy(desc(leaveRequests.createdAt)).limit(100);
  res.json(rows);
});

const decisionSchema = z.object({
  action: z.enum(["aprobar", "rechazar"]),
  note: z.string().trim().max(500).default(""),
});

/** PATCH /hr/leave/:id — aprueba o rechaza; el saldo se descuenta solo. */
router.patch("/hr/leave/:id", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!request) {
    res.status(404).json({ error: "Solicitud no encontrada" });
    return;
  }
  if (request.status !== "pendiente") {
    res.status(409).json({ error: "La solicitud ya fue resuelta" });
    return;
  }
  const approve = parsed.data.action === "aprobar";
  // Transacción con lock consultivo por persona: saldo y transición de estado
  // se deciden en serie, así dos aprobaciones simultáneas no sobregiran el año.
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(730551004, ${request.userId})`);
    if (approve && request.type === "vacaciones") {
      // Chequeo contra saldo real (aprobadas): nunca dejar el saldo negativo.
      const bal = await leaveBalance(request.userId, new Date(request.startDate + "T12:00:00Z"), tx);
      const availableForThis = bal.allowance - bal.usedDays;
      if (request.days > availableForThis) {
        return { error: `Saldo insuficiente: quedan ${availableForThis} días hábiles y la solicitud pide ${request.days}` } as const;
      }
    }
    const [row] = await tx
      .update(leaveRequests)
      .set({
        status: approve ? "aprobada" : "rechazada",
        decidedBy: me.id,
        decidedAt: new Date(),
        decisionNote: parsed.data.note,
      })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, "pendiente")))
      .returning();
    return { row } as const;
  });
  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  const row = result.row;
  if (!row) {
    res.status(409).json({ error: "La solicitud ya fue resuelta" });
    return;
  }
  const tipo = row.type === "vacaciones" ? "vacaciones" : "permiso";
  await createNotification({
    userId: row.userId,
    type: "system",
    title: approve ? `Tu solicitud de ${tipo} fue aprobada` : `Tu solicitud de ${tipo} fue rechazada`,
    body: `${row.startDate} al ${row.endDate} (${row.days} días hábiles)${parsed.data.note ? ` — ${parsed.data.note}` : ""}`,
    link: "/mi-dia",
  }).catch(() => {});
  recordActivity({
    actorId: me.id,
    entityType: "persona",
    entityId: row.userId,
    entityLabel: `Solicitud de ${tipo} ${row.startDate} al ${row.endDate}`,
    action: "status_change",
    detail: { to: row.status },
  });
  res.json(row);
});

/* ====================== Evaluación de desempeño ========================== */

/** GET /hr/reviews/:userId?period=YYYY-MM — métricas vivas + evaluación cerrada si existe. */
router.get("/hr/reviews/:userId", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const userId = Number(req.params.userId);
  const period = typeof req.query.period === "string" ? req.query.period : "";
  if (!Number.isInteger(userId) || userId <= 0 || !MONTH_RE.test(period)) {
    res.status(400).json({ error: "Parámetros inválidos (userId, period=YYYY-MM)" });
    return;
  }
  const [metrics, [closed], history] = await Promise.all([
    computePerformanceMetrics(userId, period),
    db.select().from(performanceReviews)
      .where(and(eq(performanceReviews.userId, userId), eq(performanceReviews.periodKey, period)))
      .limit(1),
    db.select().from(performanceReviews)
      .where(eq(performanceReviews.userId, userId))
      .orderBy(desc(performanceReviews.periodKey))
      .limit(24),
  ]);
  res.json({ metrics, closed: closed ?? null, history });
});

const reviewSchema = z.object({
  userId: z.number().int().positive(),
  periodKey: z.string().regex(MONTH_RE),
  comment: z.string().trim().max(4000).default(""),
});

/** POST /hr/reviews — cierra la evaluación del período con las métricas congeladas. */
router.post("/hr/reviews", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const { userId, periodKey: period, comment } = parsed.data;
  const [target] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Persona no encontrada" });
    return;
  }
  const metrics = await computePerformanceMetrics(userId, period);
  const inserted = await db
    .insert(performanceReviews)
    .values({
      userId,
      periodKey: period,
      goalsTotal: metrics.goalsTotal,
      goalsMet: metrics.goalsMet,
      attendanceMinutes: metrics.attendanceMinutes,
      attendanceDays: metrics.attendanceDays,
      leaveDays: metrics.leaveDays,
      comment,
      reviewerId: me.id,
      closedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    res.status(409).json({ error: "Ese período ya tiene una evaluación cerrada" });
    return;
  }
  await createNotification({
    userId,
    type: "system",
    title: `Tu evaluación de ${period} está lista`,
    body: "Recursos Humanos cerró tu evaluación del período. Puedes verla en Mi Día.",
    link: "/mi-dia",
  }).catch(() => {});
  recordActivity({
    actorId: me.id,
    entityType: "persona",
    entityId: userId,
    entityLabel: `Evaluación ${period} de ${target.name || target.email}`,
    action: "completed",
  });
  res.status(201).json(inserted[0]);
});

/* ========================= Documentos de ficha =========================== */

/** GET /hr/people/:userId/documents */
router.get("/hr/people/:userId/documents", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "userId inválido" });
    return;
  }
  const rows = await db.select().from(employeeDocuments)
    .where(and(eq(employeeDocuments.userId, userId), eq(employeeDocuments.archived, false)))
    .orderBy(asc(employeeDocuments.expiresAt));
  res.json(rows);
});

const docSchema = z.object({
  name: z.string().trim().min(1).max(150),
  url: z.string().trim().max(500).default(""),
  expiresAt: z.string().trim().refine((v) => v === "" || DATE_RE.test(v), "Fecha inválida (YYYY-MM-DD)").default(""),
});

/** POST /hr/people/:userId/documents */
router.post("/hr/people/:userId/documents", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "userId inválido" });
    return;
  }
  const parsed = docSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const [row] = await db.insert(employeeDocuments).values({ userId, ...parsed.data }).returning();
  res.status(201).json(row);
});

/** PATCH /hr/documents/:id — actualiza nombre/url/vencimiento. */
router.patch("/hr/documents/:id", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const parsed = docSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const patch: Record<string, unknown> = { ...parsed.data };
  // Si cambia el vencimiento, se rearma la alerta (marcador queda obsoleto solo).
  const [row] = await db.update(employeeDocuments).set(patch).where(eq(employeeDocuments.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Documento no encontrado" });
    return;
  }
  res.json(row);
});

/** DELETE /hr/documents/:id — archiva (no borra) el documento. */
router.delete("/hr/documents/:id", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db.update(employeeDocuments).set({ archived: true }).where(eq(employeeDocuments.id, id)).returning({ id: employeeDocuments.id });
  if (!row) {
    res.status(404).json({ error: "Documento no encontrado" });
    return;
  }
  res.status(204).end();
});

export default router;
