import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubTasks, users } from "@workspace/db/schema";
import { eq, and, or, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";

const router: IRouter = Router();

const VALID_PRIORITIES = ["crítica", "alta", "media", "baja"] as const;
const VALID_STATUSES = ["pendiente", "en_progreso", "hecha"] as const;

type AuthUser = { id: number; role?: string; teamRole?: string };

function isCeoOrSuperAdmin(req: Request): boolean {
  const u = req.user as AuthUser | undefined;
  if (!u) return false;
  return u.role === "superadmin" || u.teamRole === "ceo";
}

function me(req: Request): AuthUser {
  return req.user as AuthUser;
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(5000).optional(),
  priority: z.enum(VALID_PRIORITIES).optional().default("media"),
  status: z.enum(VALID_STATUSES).optional().default("pendiente"),
  projectRef: z.string().max(100).optional(),
  assigneeId: z.number().int().positive().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  orderIndex: z.number().int().optional().default(0),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(5000).optional().nullable(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  projectRef: z.string().max(100).optional().nullable(),
  assigneeId: z.number().int().positive().optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  orderIndex: z.number().int().optional(),
});

const batchCreateSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        notes: z.string().max(5000).optional(),
        priority: z.enum(VALID_PRIORITIES).optional().default("media"),
        projectRef: z.string().max(100).optional(),
        assigneeId: z.number().int().positive().optional(),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
    )
    .min(1)
    .max(50),
});

async function fetchTaskWithAssignees(taskId: number) {
  const rows = await db
    .select({
      id: hubTasks.id,
      title: hubTasks.title,
      notes: hubTasks.notes,
      priority: hubTasks.priority,
      status: hubTasks.status,
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
    .leftJoin(
      sql`${users} cb`,
      sql`cb.id = ${hubTasks.createdById}`,
    )
    .leftJoin(
      sql`${users} asgn`,
      sql`asgn.id = ${hubTasks.assigneeId}`,
    )
    .where(eq(hubTasks.id, taskId));

  if (!rows.length) return null;
  const r = rows[0]!;
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    priority: r.priority,
    status: r.status,
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

/* GET /hub/tasks */
router.get("/hub/tasks", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const isCeo = isCeoOrSuperAdmin(req);

    const { projectRef, status, assigneeId, limit, offset } = req.query as Record<string, string>;

    const conditions = [];
    if (!isCeo) {
      conditions.push(eq(hubTasks.assigneeId, user.id));
    } else if (assigneeId) {
      const aid = parseInt(assigneeId, 10);
      if (!isNaN(aid)) conditions.push(eq(hubTasks.assigneeId, aid));
    }
    if (projectRef) conditions.push(eq(hubTasks.projectRef, projectRef));
    if (status && VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      conditions.push(eq(hubTasks.status, status));
    }

    const lim = Math.min(parseInt(limit || "200", 10) || 200, 500);
    const off = parseInt(offset || "0", 10) || 0;

    const rows = await db
      .select({
        id: hubTasks.id,
        title: hubTasks.title,
        notes: hubTasks.notes,
        priority: hubTasks.priority,
        status: hubTasks.status,
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
      status: r.status,
      dueDate: r.dueDate,
      completedAt: r.completedAt,
      orderIndex: r.orderIndex,
      projectRef: r.projectRef,
      createdById: r.createdById,
      assigneeId: r.assigneeId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignee: r.assigneeId
        ? { id: r.assigneeId, name: r.assigneeName, picture: r.assigneePicture }
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
    const completedAt = d.status === "hecha" ? new Date() : null;
    const [inserted] = await db
      .insert(hubTasks)
      .values({
        title: d.title,
        notes: d.notes ?? null,
        createdById: user.id,
        assigneeId: d.assigneeId ?? null,
        projectRef: d.projectRef ?? null,
        priority: d.priority,
        status: d.status,
        dueDate: d.dueDate ?? null,
        completedAt,
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
        link: "/ejecutivo",
      }).catch(() => {});
    }
    res.status(201).json({ task: inserted });
  } catch (err) {
    console.error("[hub/tasks POST]", err);
    res.status(500).json({ error: "Error al crear tarea" });
  }
});

/* POST /hub/tasks/batch — bulk create (CEO only) */
router.post("/hub/tasks/batch", async (req: Request, res: Response) => {
  if (!isCeoOrSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el CEO puede crear tareas" });
    return;
  }
  const parsed = batchCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const user = me(req);
    const rows = parsed.data.tasks.map((t, i) => ({
      title: t.title,
      notes: t.notes ?? null,
      createdById: user.id,
      assigneeId: t.assigneeId ?? null,
      projectRef: t.projectRef ?? null,
      priority: t.priority,
      status: "pendiente" as const,
      dueDate: t.dueDate ?? null,
      completedAt: null,
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

/* GET /hub/tasks/:id */
router.get("/hub/tasks/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    const task = await fetchTaskWithAssignees(id);
    if (!task) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
    const user = me(req);
    if (!isCeoOrSuperAdmin(req) && task.assigneeId !== user.id) {
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
    const isCeo = isCeoOrSuperAdmin(req);

    const [existing] = await db
      .select()
      .from(hubTasks)
      .where(eq(hubTasks.id, id))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Tarea no encontrada" }); return; }

    if (!isCeo && existing.assigneeId !== user.id) {
      res.status(403).json({ error: "Sin acceso" }); return;
    }

    let body = req.body as Record<string, unknown>;
    if (!isCeo) {
      const { status } = body;
      body = { status };
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() }); return;
    }

    const d = parsed.data;
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (d.title !== undefined) updates["title"] = d.title;
    if (d.notes !== undefined) updates["notes"] = d.notes;
    if (d.priority !== undefined) updates["priority"] = d.priority;
    if (d.status !== undefined) {
      updates["status"] = d.status;
      if (d.status === "hecha" && existing.status !== "hecha") {
        updates["completedAt"] = new Date();
      } else if (d.status !== "hecha") {
        updates["completedAt"] = null;
      }
    }
    if ("projectRef" in d && d.projectRef !== undefined) updates["projectRef"] = d.projectRef;
    if ("assigneeId" in d && d.assigneeId !== undefined) updates["assigneeId"] = d.assigneeId;
    if ("dueDate" in d && d.dueDate !== undefined) updates["dueDate"] = d.dueDate;
    if (d.orderIndex !== undefined) updates["orderIndex"] = d.orderIndex;

    await db.update(hubTasks).set(updates).where(eq(hubTasks.id, id));

    if (
      isCeo &&
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

    const updated = await fetchTaskWithAssignees(id);
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

export default router;
