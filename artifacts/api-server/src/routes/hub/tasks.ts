import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubTasks } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";
import { definedFields, getHubUser, parseId, projectExists, sendZodError, zExtra, zFecha } from "./helpers";

const router: IRouter = Router();

const TASK_STATUSES = ["por_hacer", "en_progreso", "en_revision", "hecho"] as const;

const createSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(300),
  description: z.string().max(20_000).nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  status: z.enum(TASK_STATUSES, {
    errorMap: () => ({ message: "Estado inválido. Use: por_hacer, en_progreso, en_revision, hecho" }),
  }).nullable().optional(),
  priority: z.string().max(50).nullable().optional(),
  dueDate: zFecha.nullable().optional(),
  assigneeIds: z.array(z.number().int().positive()).max(50).optional(),
  extra: zExtra.optional(),
});

const patchSchema = createSchema.partial();

async function validProjectRef(res: Response, projectId: number | null | undefined): Promise<boolean> {
  if (typeof projectId === "number" && !(await projectExists(projectId))) {
    res.status(400).json({ error: `El proyecto #${projectId} no existe` });
    return false;
  }
  return true;
}

function dedupe(ids: number[] | undefined): number[] | undefined {
  return ids ? [...new Set(ids)] : undefined;
}

/**
 * Notifica a los responsables recién asignados (que no estaban antes y que no
 * son quien hizo el cambio). Nunca lanza: un fallo de push no debe romper el CRUD.
 */
async function notifyNewAssignees(taskTitle: string, newIds: number[], previousIds: number[], actorId: number): Promise<void> {
  const prev = new Set(previousIds);
  const targets = [...new Set(newIds)].filter((id) => !prev.has(id) && id !== actorId);
  for (const userId of targets) {
    try {
      await createNotification({
        userId,
        type: "hub_task_assigned",
        title: "Nueva tarea asignada",
        body: taskTitle,
        link: "/ejecutivo?tab=tareas",
      });
    } catch (err: any) {
      console.error("[Hub] hub_task_assigned notification failed:", err?.message || err);
    }
  }
}

router.get("/hub/tasks", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(hubTasks)
    .orderBy(desc(hubTasks.updatedAt), desc(hubTasks.id));
  res.json(rows);
});

router.post("/hub/tasks", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validProjectRef(res, parsed.data.projectId))) return;
  const user = getHubUser(req);
  const [row] = await db
    .insert(hubTasks)
    .values({ ...parsed.data, assigneeIds: dedupe(parsed.data.assigneeIds) ?? [], createdBy: user.id })
    .returning();
  await notifyNewAssignees(row.title, row.assigneeIds, [], user.id);
  res.status(201).json(row);
});

router.patch("/hub/tasks/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validProjectRef(res, parsed.data.projectId))) return;

  // Se lee la fila previa para detectar responsables NUEVOS tras el update.
  const [prev] = await db.select().from(hubTasks).where(eq(hubTasks.id, id)).limit(1);
  if (!prev) { res.status(404).json({ error: "Tarea no encontrada" }); return; }

  const user = getHubUser(req);
  const update = definedFields(parsed.data);
  if (parsed.data.assigneeIds !== undefined) update.assigneeIds = dedupe(parsed.data.assigneeIds);
  const [row] = await db
    .update(hubTasks)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(hubTasks.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Tarea no encontrada" }); return; }

  if (parsed.data.assigneeIds !== undefined) {
    await notifyNewAssignees(row.title, row.assigneeIds, prev.assigneeIds, user.id);
  }
  res.json(row);
});

router.delete("/hub/tasks/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const deleted = await db
    .delete(hubTasks)
    .where(eq(hubTasks.id, id))
    .returning({ id: hubTasks.id });
  if (!deleted.length) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
  res.status(204).send();
});

export default router;
