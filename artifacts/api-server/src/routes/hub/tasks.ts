import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubTasks, users, hubTaskActivity, type HubTaskRow, VALID_STAGES, VALID_PRIORITIES } from "@workspace/db/schema";
import { eq, and, asc, desc, sql, gte, lte, isNull, or, ne } from "drizzle-orm";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";

const router: IRouter = Router();

type AuthUser = { id: number; role?: string; teamRole?: string };

function me(req: Request): AuthUser {
  return req.user as AuthUser;
}

function isCeoOrEjecutivo(req: Request): boolean {
  const u = me(req);
  return u.role === "superadmin" || u.teamRole === "ceo" || u.teamRole === "ejecutivo" || u.teamRole === "rrhh";
}

function isCeoOrSuperAdmin(req: Request): boolean {
  const u = me(req);
  return u.role === "superadmin" || u.teamRole === "ceo";
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(5000).optional(),
  priority: z.enum(VALID_PRIORITIES).optional().default("media"),
  stage: z.enum(VALID_STAGES).optional().default("backlog"),
  projectRef: z.string().max(100).optional(),
  assigneeId: z.number().int().positive().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  orderIndex: z.number().int().optional().default(0),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(5000).nullable().optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  stage: z.enum(VALID_STAGES).optional(),
  projectRef: z.string().max(100).nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  orderIndex: z.number().int().optional(),
});

const batchCreateSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(500),
    notes: z.string().max(5000).optional(),
    priority: z.enum(VALID_PRIORITIES).optional().default("media"),
    projectRef: z.string().max(100).optional(),
    assigneeId: z.number().int().positive().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).min(1).max(50),
});

/** Accumulate elapsed time in oldStage and transition to newStage. */
function computeStageTransition(
  existing: { stage: string; stageSince: Date | null; stageTime: Record<string, number> | null },
  newStage: string,
  now: Date,
): { stage: string; stageSince: Date; stageTime: Record<string, number> } {
  const sinceMs = existing.stageSince ? existing.stageSince.getTime() : now.getTime();
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - sinceMs) / 1000));
  const prev = existing.stageTime ?? {};
  const newStageTime: Record<string, number> = {
    ...prev,
    [existing.stage]: (prev[existing.stage] ?? 0) + elapsedSec,
  };
  return { stage: newStage, stageSince: now, stageTime: newStageTime };
}

/** Insert a row in hub_task_activity. Silently ignores errors. */
async function logActivity(entry: {
  taskId: number;
  taskTitle: string;
  userId: number;
  action: "stage_change" | "created" | "assigned";
  oldStage?: string | null;
  newStage?: string | null;
}): Promise<void> {
  await db.insert(hubTaskActivity).values({
    taskId: entry.taskId,
    taskTitle: entry.taskTitle,
    userId: entry.userId,
    action: entry.action,
    oldStage: entry.oldStage ?? null,
    newStage: entry.newStage ?? null,
  });
}

async function fetchTaskWithUsers(taskId: number) {
  const rows = await db
    .select({
      id: hubTasks.id,
      title: hubTasks.title,
      notes: hubTasks.notes,
      priority: hubTasks.priority,
      stage: hubTasks.stage,
      stageSince: hubTasks.stageSince,
      stageTime: hubTasks.stageTime,
      dueDate: hubTasks.dueDate,
      completedAt: hubTasks.completedAt,
      orderIndex: hubTasks.orderIndex,
      projectRef: hubTasks.projectRef,
      createdById: hubTasks.createdById,
      assigneeId: hubTasks.assigneeId,
      createdAt: hubTasks.createdAt,
      updatedAt: hubTasks.updatedAt,
      createdByName: sql<string | null>`cb.name`,
      createdByPicture: sql<string | null>`cb.picture`,
      assigneeName: sql<string | null>`asgn.name`,
      assigneePicture: sql<string | null>`asgn.picture`,
    })
    .from(hubTasks)
    .leftJoin(sql`${users} cb`, sql`cb.id = ${hubTasks.createdById}`)
    .leftJoin(sql`${users} asgn`, sql`asgn.id = ${hubTasks.assigneeId}`)
    .where(eq(hubTasks.id, taskId));

  if (!rows.length) return null;
  const r = rows[0]!;
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    priority: r.priority,
    stage: r.stage,
    stageSince: r.stageSince,
    stageTime: r.stageTime,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    orderIndex: r.orderIndex,
    projectRef: r.projectRef,
    createdById: r.createdById,
    assigneeId: r.assigneeId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: { id: r.createdById, name: r.createdByName, picture: r.createdByPicture },
    assignee: r.assigneeId
      ? { id: r.assigneeId, name: r.assigneeName, picture: r.assigneePicture }
      : null,
  };
}

/* GET /hub/tasks/team-members — approved users for the assignee picker */
router.get("/hub/tasks/team-members", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        picture: users.picture,
        teamRole: users.teamRole,
      })
      .from(users)
      .where(eq(users.approvalStatus, "approved"))
      .orderBy(asc(users.name));
    res.json({ users: rows });
  } catch (err) {
    console.error("[hub/tasks/team-members GET]", err);
    res.status(500).json({ error: "Error al obtener equipo" });
  }
});

/* GET /hub/tasks */
router.get("/hub/tasks", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const canManageAll = isCeoOrEjecutivo(req);

    const { projectRef, stage, assigneeId, limit, offset } = req.query as Record<string, string>;

    const conditions = [];
    if (!canManageAll) {
      // edicion/marketing can only see their own assigned tasks (if they ever get access)
      conditions.push(eq(hubTasks.assigneeId, user.id));
    } else if (assigneeId) {
      const aid = parseInt(assigneeId, 10);
      if (!isNaN(aid)) conditions.push(eq(hubTasks.assigneeId, aid));
    }
    if (projectRef) conditions.push(eq(hubTasks.projectRef, projectRef));
    if (stage && (VALID_STAGES as readonly string[]).includes(stage)) {
      conditions.push(eq(hubTasks.stage, stage));
    }

    const lim = Math.min(parseInt(limit || "500", 10) || 500, 1000);
    const off = parseInt(offset || "0", 10) || 0;

    const rows = await db
      .select({
        id: hubTasks.id,
        title: hubTasks.title,
        notes: hubTasks.notes,
        priority: hubTasks.priority,
        stage: hubTasks.stage,
        stageSince: hubTasks.stageSince,
        stageTime: hubTasks.stageTime,
        dueDate: hubTasks.dueDate,
        completedAt: hubTasks.completedAt,
        orderIndex: hubTasks.orderIndex,
        projectRef: hubTasks.projectRef,
        createdById: hubTasks.createdById,
        assigneeId: hubTasks.assigneeId,
        createdAt: hubTasks.createdAt,
        updatedAt: hubTasks.updatedAt,
        assigneeName: users.name,
        assigneePicture: users.picture,
        assigneeEmail: users.email,
      })
      .from(hubTasks)
      .leftJoin(users, eq(users.id, hubTasks.assigneeId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(hubTasks.orderIndex), asc(hubTasks.createdAt))
      .limit(lim)
      .offset(off);

    const tasks = rows.map((r) => ({
      id: r.id,
      title: r.title,
      notes: r.notes,
      priority: r.priority,
      stage: r.stage,
      stageSince: r.stageSince,
      stageTime: r.stageTime,
      dueDate: r.dueDate,
      completedAt: r.completedAt,
      orderIndex: r.orderIndex,
      projectRef: r.projectRef,
      createdById: r.createdById,
      assigneeId: r.assigneeId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignee: r.assigneeId
        ? { id: r.assigneeId, name: r.assigneeName, picture: r.assigneePicture, email: r.assigneeEmail }
        : null,
    }));

    res.json({ tasks });
  } catch (err) {
    console.error("[hub/tasks GET]", err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

/* POST /hub/tasks */
router.post("/hub/tasks", async (req: Request, res: Response) => {
  if (!isCeoOrSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el CEO puede crear tareas" });
    return;
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const user = me(req);
    const d = parsed.data;
    const now = new Date();
    const [inserted] = await db
      .insert(hubTasks)
      .values({
        title: d.title,
        notes: d.notes ?? null,
        createdById: user.id,
        assigneeId: d.assigneeId ?? null,
        projectRef: d.projectRef ?? null,
        priority: d.priority,
        stage: d.stage,
        stageSince: now,
        stageTime: {},
        dueDate: d.dueDate ?? null,
        completedAt: d.stage === "done" ? now : null,
        orderIndex: d.orderIndex,
      })
      .returning();
    if (!inserted) {
      res.status(500).json({ error: "Error al insertar tarea" });
      return;
    }
    if (d.assigneeId && d.assigneeId !== user.id) {
      await createNotification({
        userId: d.assigneeId,
        type: "system",
        title: "Nueva tarea asignada",
        body: d.title,
        link: "/mi-dia",
      }).catch(() => {});
    }
    if (inserted) {
      await logActivity({ taskId: inserted.id, taskTitle: inserted.title, userId: user.id, action: "created" }).catch(() => {});
    }
    res.status(201).json({ task: inserted });
  } catch (err) {
    console.error("[hub/tasks POST]", err);
    res.status(500).json({ error: "Error al crear tarea" });
  }
});

/* POST /hub/tasks/batch */
router.post("/hub/tasks/batch", async (req: Request, res: Response) => {
  if (!isCeoOrSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el CEO puede crear tareas en lote" });
    return;
  }
  const parsed = batchCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const user = me(req);
    const now = new Date();
    const rows = parsed.data.tasks.map((t, i) => ({
      title: t.title,
      notes: t.notes ?? null,
      createdById: user.id,
      assigneeId: t.assigneeId ?? null,
      projectRef: t.projectRef ?? null,
      priority: t.priority,
      stage: "backlog" as const,
      stageSince: now,
      stageTime: {} as Record<string, number>,
      dueDate: t.dueDate ?? null,
      completedAt: null as Date | null,
      orderIndex: i,
    }));
    const inserted = await db.insert(hubTasks).values(rows).returning();
    const notifyTargets = new Set(
      rows.filter((r) => r.assigneeId && r.assigneeId !== user.id).map((r) => r.assigneeId),
    );
    for (const uid of notifyTargets) {
      if (!uid) continue;
      await createNotification({
        userId: uid,
        type: "system",
        title: "Nuevas tareas asignadas",
        body: `${inserted.length} tarea(s) añadidas al backlog`,
        link: "/ejecutivo",
      }).catch(() => {});
    }
    res.status(201).json({ tasks: inserted });
  } catch (err) {
    console.error("[hub/tasks/batch POST]", err);
    res.status(500).json({ error: "Error al crear tareas" });
  }
});

/* GET /hub/tasks/team-view — full team load for CEO/ejecutivo */
router.get("/hub/tasks/team-view", async (req: Request, res: Response) => {
  if (!isCeoOrEjecutivo(req)) { res.status(403).json({ error: "Sin acceso" }); return; }
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const stagnantThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const PRIO_ORDER: Record<string, number> = { "crítica": 0, "alta": 1, "media": 2, "baja": 3 };
    const STAGNANT_STAGES = new Set(["sprint", "doing", "qa_sent", "qa_rev"]);

    const [allUsers, allActiveTasks] = await Promise.all([
      db.select({ id: users.id, name: users.name, picture: users.picture, email: users.email, teamRole: users.teamRole })
        .from(users).where(eq(users.approvalStatus, "approved")).orderBy(asc(users.name)),
      db.select({ id: hubTasks.id, title: hubTasks.title, stage: hubTasks.stage, priority: hubTasks.priority, dueDate: hubTasks.dueDate, stageSince: hubTasks.stageSince, assigneeId: hubTasks.assigneeId })
        .from(hubTasks).where(and(ne(hubTasks.stage, "done"), sql`${hubTasks.assigneeId} IS NOT NULL`))
        .orderBy(asc(hubTasks.orderIndex), asc(hubTasks.createdAt)),
    ]);

    const tasksByAssignee = new Map<number, typeof allActiveTasks>();
    for (const t of allActiveTasks) {
      if (t.assigneeId == null) continue;
      if (!tasksByAssignee.has(t.assigneeId)) tasksByAssignee.set(t.assigneeId, []);
      tasksByAssignee.get(t.assigneeId)!.push(t);
    }

    const members = allUsers.map((u) => {
      const tasks = (tasksByAssignee.get(u.id) ?? []).sort(
        (a, b) => (PRIO_ORDER[a.priority] ?? 9) - (PRIO_ORDER[b.priority] ?? 9),
      );
      let semaphore: "green" | "yellow" | "red" = "green";
      const enriched = tasks.map((t) => {
        const stageSinceMs = t.stageSince ? now.getTime() - new Date(t.stageSince).getTime() : 0;
        const stagnant = STAGNANT_STAGES.has(t.stage) && t.stageSince != null && new Date(t.stageSince) < stagnantThreshold;
        const overdue = t.dueDate != null && t.dueDate < todayStr;
        const dueToday = t.dueDate === todayStr;
        if (stagnant || overdue) semaphore = "red";
        else if (dueToday && semaphore !== "red") semaphore = "yellow";
        return { id: t.id, title: t.title, stage: t.stage, priority: t.priority, dueDate: t.dueDate, stageSinceMs, stagnant, overdue, dueToday };
      });
      return { id: u.id, name: u.name, picture: u.picture, email: u.email, teamRole: u.teamRole, semaphore, activeTasks: enriched, activeCount: tasks.length };
    });

    res.json({ members });
  } catch (err) {
    console.error("[hub/tasks/team-view GET]", err);
    res.status(500).json({ error: "Error al obtener vista del equipo" });
  }
});

/* GET /hub/tasks/my-day — tasks for current user grouped by date category */
router.get("/hub/tasks/my-day", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekEndDate = new Date(now);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEndStr = weekEndDate.toISOString().slice(0, 10);
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);

    const rows = await db.select({
      id: hubTasks.id,
      title: hubTasks.title,
      stage: hubTasks.stage,
      priority: hubTasks.priority,
      dueDate: hubTasks.dueDate,
      completedAt: hubTasks.completedAt,
      projectRef: hubTasks.projectRef,
      notes: hubTasks.notes,
      stageSince: hubTasks.stageSince,
    }).from(hubTasks).where(
      and(eq(hubTasks.assigneeId, user.id), or(ne(hubTasks.stage, "done"), gte(hubTasks.completedAt, todayStart))),
    ).orderBy(asc(hubTasks.dueDate), asc(hubTasks.orderIndex));

    type TaskRow = typeof rows[number];
    const vencidas: TaskRow[] = [], hoy: TaskRow[] = [], semana: TaskRow[] = [], sinFecha: TaskRow[] = [], completedToday: TaskRow[] = [];
    for (const t of rows) {
      if (t.stage === "done" && t.completedAt && t.completedAt >= todayStart) { completedToday.push(t); continue; }
      if (t.stage === "done") continue;
      if (t.dueDate == null) { sinFecha.push(t); continue; }
      if (t.dueDate < todayStr) { vencidas.push(t); continue; }
      if (t.dueDate === todayStr) { hoy.push(t); continue; }
      if (t.dueDate <= weekEndStr) { semana.push(t); continue; }
      sinFecha.push(t);
    }
    const total = vencidas.length + hoy.length + semana.length + sinFecha.length + completedToday.length;
    res.json({ groups: { vencidas, hoy, semana, sinFecha, completedToday }, progress: { done: completedToday.length, total } });
  } catch (err) {
    console.error("[hub/tasks/my-day GET]", err);
    res.status(500).json({ error: "Error al obtener tareas del día" });
  }
});

/* GET /hub/tasks/activity — activity log for a user on a date (CEO/ejecutivo only) */
router.get("/hub/tasks/activity", async (req: Request, res: Response) => {
  if (!isCeoOrEjecutivo(req)) { res.status(403).json({ error: "Sin acceso" }); return; }
  const { userId, date } = req.query as Record<string, string>;
  const uid = parseInt(userId || "", 10);
  if (isNaN(uid)) { res.status(400).json({ error: "userId inválido" }); return; }
  const dateStr = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  try {
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const rows = await db.select({
      id: hubTaskActivity.id,
      taskId: hubTaskActivity.taskId,
      taskTitle: hubTaskActivity.taskTitle,
      action: hubTaskActivity.action,
      oldStage: hubTaskActivity.oldStage,
      newStage: hubTaskActivity.newStage,
      createdAt: hubTaskActivity.createdAt,
      actorName: users.name,
    }).from(hubTaskActivity)
      .leftJoin(users, eq(users.id, hubTaskActivity.userId))
      .where(and(eq(hubTaskActivity.userId, uid), gte(hubTaskActivity.createdAt, dayStart), lte(hubTaskActivity.createdAt, dayEnd)))
      .orderBy(desc(hubTaskActivity.createdAt))
      .limit(50);
    res.json({ items: rows });
  } catch (err) {
    console.error("[hub/tasks/activity GET]", err);
    res.status(500).json({ error: "Error al obtener actividad" });
  }
});

/* GET /hub/tasks/:id */
router.get("/hub/tasks/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const task = await fetchTaskWithUsers(id);
    if (!task) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
    const user = me(req);
    if (!isCeoOrEjecutivo(req) && task.assigneeId !== user.id) {
      res.status(403).json({ error: "Sin acceso" }); return;
    }
    res.json({ task });
  } catch (err) {
    console.error("[hub/tasks/:id GET]", err);
    res.status(500).json({ error: "Error al obtener tarea" });
  }
});

/* PATCH /hub/tasks/:id */
router.patch("/hub/tasks/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  try {
    const user = me(req);
    const canManageAll = isCeoOrEjecutivo(req);

    const [existing] = await db.select().from(hubTasks).where(eq(hubTasks.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Tarea no encontrada" }); return; }

    if (!canManageAll && existing.assigneeId !== user.id) {
      res.status(403).json({ error: "Sin acceso" }); return;
    }

    // Non-CEO/ejecutivo can only move stage on their own tasks
    let bodyToValidate: Record<string, unknown> = req.body as Record<string, unknown>;
    if (!canManageAll) {
      bodyToValidate = { stage: bodyToValidate["stage"] };
    }

    const parsed = updateSchema.safeParse(bodyToValidate);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() }); return;
    }

    const d = parsed.data;
    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (d.title !== undefined) updates["title"] = d.title;
    if (d.notes !== undefined) updates["notes"] = d.notes;
    if (d.priority !== undefined) updates["priority"] = d.priority;
    if ("projectRef" in d && d.projectRef !== undefined) updates["projectRef"] = d.projectRef;
    if ("assigneeId" in d && d.assigneeId !== undefined) updates["assigneeId"] = d.assigneeId;
    if ("dueDate" in d && d.dueDate !== undefined) updates["dueDate"] = d.dueDate;
    if (d.orderIndex !== undefined) updates["orderIndex"] = d.orderIndex;

    // Stage transition — accumulate stageTime, reset stageSince
    if (d.stage !== undefined && d.stage !== existing.stage) {
      const transition = computeStageTransition(
        {
          stage: existing.stage,
          stageSince: existing.stageSince,
          stageTime: existing.stageTime as Record<string, number> | null,
        },
        d.stage,
        now,
      );
      updates["stage"] = transition.stage;
      updates["stageSince"] = transition.stageSince;
      updates["stageTime"] = transition.stageTime;
      if (d.stage === "done" && existing.stage !== "done") {
        updates["completedAt"] = now;
      } else if (d.stage !== "done") {
        updates["completedAt"] = null;
      }
    }

    await db.update(hubTasks).set(updates).where(eq(hubTasks.id, id));

    // Log activity
    if (d.stage !== undefined && d.stage !== existing.stage) {
      await logActivity({ taskId: id, taskTitle: existing.title, userId: user.id, action: "stage_change", oldStage: existing.stage, newStage: d.stage }).catch(() => {});
    }
    if (canManageAll && d.assigneeId !== undefined && d.assigneeId !== null && d.assigneeId !== existing.assigneeId) {
      await logActivity({ taskId: id, taskTitle: existing.title, userId: user.id, action: "assigned" }).catch(() => {});
    }

    // Notify on assignee change
    if (
      canManageAll &&
      d.assigneeId !== undefined &&
      d.assigneeId !== null &&
      d.assigneeId !== existing.assigneeId &&
      d.assigneeId !== user.id
    ) {
      await createNotification({
        userId: d.assigneeId,
        type: "system",
        title: "Tarea asignada",
        body: existing.title,
        link: "/ejecutivo",
      }).catch(() => {});
    }

    const updated = await fetchTaskWithUsers(id);
    res.json({ task: updated });
  } catch (err) {
    console.error("[hub/tasks/:id PATCH]", err);
    res.status(500).json({ error: "Error al actualizar tarea" });
  }
});

/* DELETE /hub/tasks/:id */
router.delete("/hub/tasks/:id", async (req: Request, res: Response) => {
  if (!isCeoOrSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el CEO puede eliminar tareas" }); return;
  }
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const [deleted] = await db
      .delete(hubTasks)
      .where(eq(hubTasks.id, id))
      .returning({ id: hubTasks.id });
    if (!deleted) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("[hub/tasks/:id DELETE]", err);
    res.status(500).json({ error: "Error al eliminar tarea" });
  }
});

/** Exposed for testing */
export { isCeoOrEjecutivo as _isCeoOrEjecutivo };
export default router;
