// "Mis pendientes": tareas simples y checklists 100% privados por usuario.
//
// Nada que ver con `hub_tasks` (el tablero Scrumban del Hub, compartido y
// gestionado por rol, que sigue viviendo en routes/hub/tasks.ts bajo la
// página "Mis tareas"). Esta es una sección nueva y separada: cualquier
// persona con sesión aprobada puede usarla, y CADA consulta —lectura o
// escritura— filtra siempre por `userId = quien pide`. No existe ningún
// bypass por rol (ni CEO ve tareas o checklists ajenas): a diferencia de
// hub/tasks.ts, aquí no hay noción de "gestión total".
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { personalTasks, personalChecklists, type PersonalChecklistItem } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { periodKey } from "../../lib/periods";

const router: IRouter = Router();

type AuthedUser = { id: number; email?: string; name?: string };
function getUser(req: Request): AuthedUser {
  return req.user as AuthedUser;
}

/* ── Tareas simples ──────────────────────────────────────────────────── */

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(280),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(280).optional(),
  done: z.boolean().optional(),
});

function taskToDto(r: typeof personalTasks.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    done: r.done,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

router.get("/personal-tasks", async (req: Request, res: Response) => {
  const user = getUser(req);
  const [tasks, checklists] = await Promise.all([
    db.select().from(personalTasks).where(eq(personalTasks.userId, user.id)).orderBy(personalTasks.id),
    db.select().from(personalChecklists).where(eq(personalChecklists.userId, user.id)).orderBy(personalChecklists.id),
  ]);
  res.json({
    tasks: tasks.map(taskToDto),
    checklists: checklists.map(checklistToDto),
  });
});

router.post("/personal-tasks", async (req: Request, res: Response) => {
  const user = getUser(req);
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .insert(personalTasks)
    .values({ userId: user.id, title: parsed.data.title })
    .returning();
  res.json({ task: taskToDto(row!) });
});

router.patch("/personal-tasks/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const updates: { updatedAt: Date; title?: string; done?: boolean } = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.done !== undefined) updates.done = parsed.data.done;

  const [row] = await db
    .update(personalTasks)
    .set(updates)
    .where(and(eq(personalTasks.id, id), eq(personalTasks.userId, user.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }
  res.json({ task: taskToDto(row) });
});

router.delete("/personal-tasks/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const result = await db
    .delete(personalTasks)
    .where(and(eq(personalTasks.id, id), eq(personalTasks.userId, user.id)))
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }
  res.json({ success: true });
});

/* ── Checklists ──────────────────────────────────────────────────────── */

const createChecklistSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const renameChecklistSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const addItemSchema = z.object({
  text: z.string().trim().min(1).max(280),
});

const updateItemSchema = z.object({
  text: z.string().trim().min(1).max(280).optional(),
  done: z.boolean().optional(),
});

function checklistToDto(r: typeof personalChecklists.$inferSelect) {
  const today = periodKey("diaria");
  return {
    id: r.id,
    title: r.title,
    items: r.items.map((it) => ({ id: it.id, text: it.text, done: it.lastDoneKey === today })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Trae un checklist propio o null; nunca deja ver uno de otra persona. */
async function ownChecklist(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(personalChecklists)
    .where(and(eq(personalChecklists.id, id), eq(personalChecklists.userId, userId)));
  return row ?? null;
}

router.post("/personal-checklists", async (req: Request, res: Response) => {
  const user = getUser(req);
  const parsed = createChecklistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .insert(personalChecklists)
    .values({ userId: user.id, title: parsed.data.title, items: [] })
    .returning();
  res.json({ checklist: checklistToDto(row!) });
});

router.patch("/personal-checklists/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = renameChecklistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .update(personalChecklists)
    .set({ title: parsed.data.title, updatedAt: new Date() })
    .where(and(eq(personalChecklists.id, id), eq(personalChecklists.userId, user.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Checklist no encontrado" });
    return;
  }
  res.json({ checklist: checklistToDto(row) });
});

router.delete("/personal-checklists/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const result = await db
    .delete(personalChecklists)
    .where(and(eq(personalChecklists.id, id), eq(personalChecklists.userId, user.id)))
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Checklist no encontrado" });
    return;
  }
  res.json({ success: true });
});

router.post("/personal-checklists/:id/items", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const existing = await ownChecklist(user.id, id);
  if (!existing) {
    res.status(404).json({ error: "Checklist no encontrado" });
    return;
  }
  const newItem: PersonalChecklistItem = { id: randomUUID(), text: parsed.data.text, lastDoneKey: null };
  const items = [...existing.items, newItem];
  const [row] = await db
    .update(personalChecklists)
    .set({ items, updatedAt: new Date() })
    .where(and(eq(personalChecklists.id, id), eq(personalChecklists.userId, user.id)))
    .returning();
  res.json({ checklist: checklistToDto(row!) });
});

router.patch("/personal-checklists/:id/items/:itemId", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const existing = await ownChecklist(user.id, id);
  if (!existing) {
    res.status(404).json({ error: "Checklist no encontrado" });
    return;
  }
  const itemId = req.params.itemId;
  const today = periodKey("diaria");
  let found = false;
  const items = existing.items.map((it) => {
    if (it.id !== itemId) return it;
    found = true;
    const next = { ...it };
    if (parsed.data.text !== undefined) next.text = parsed.data.text;
    if (parsed.data.done !== undefined) next.lastDoneKey = parsed.data.done ? today : null;
    return next;
  });
  if (!found) {
    res.status(404).json({ error: "Ítem no encontrado" });
    return;
  }
  const [row] = await db
    .update(personalChecklists)
    .set({ items, updatedAt: new Date() })
    .where(and(eq(personalChecklists.id, id), eq(personalChecklists.userId, user.id)))
    .returning();
  res.json({ checklist: checklistToDto(row!) });
});

router.delete("/personal-checklists/:id/items/:itemId", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const existing = await ownChecklist(user.id, id);
  if (!existing) {
    res.status(404).json({ error: "Checklist no encontrado" });
    return;
  }
  const itemId = req.params.itemId;
  const items = existing.items.filter((it) => it.id !== itemId);
  if (items.length === existing.items.length) {
    res.status(404).json({ error: "Ítem no encontrado" });
    return;
  }
  const [row] = await db
    .update(personalChecklists)
    .set({ items, updatedAt: new Date() })
    .where(and(eq(personalChecklists.id, id), eq(personalChecklists.userId, user.id)))
    .returning();
  res.json({ checklist: checklistToDto(row!) });
});

export default router;
