import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { ideas } from "@workspace/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

type AuthedUser = { id: number; email?: string; name?: string };
function getUser(req: Request): AuthedUser {
  return req.user as AuthedUser;
}

const VALID_STATUSES = ["por_hacer", "en_progreso", "en_revision", "hecho"] as const;
type KanbanStatus = (typeof VALID_STATUSES)[number];

const createSchema = z.object({
  title: z.string().min(1).max(280),
  description: z.string().max(2000).optional().nullable(),
  kanbanStatus: z.enum(VALID_STATUSES).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  description: z.string().max(2000).nullable().optional(),
  kanbanStatus: z.enum(VALID_STATUSES).optional(),
  kanbanOrder: z.number().int().min(0).optional(),
});

function toDto(r: typeof ideas.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    kanbanStatus: r.kanbanStatus,
    kanbanOrder: r.kanbanOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

router.get("/ideas", async (req: Request, res: Response) => {
  const user = getUser(req);
  const rows = await db
    .select()
    .from(ideas)
    .where(eq(ideas.userId, user.id))
    .orderBy(asc(ideas.kanbanStatus), asc(ideas.kanbanOrder), asc(ideas.id));
  res.json({ ideas: rows.map(toDto) });
});

router.post("/ideas", async (req: Request, res: Response) => {
  const user = getUser(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const status = (parsed.data.kanbanStatus as KanbanStatus) || "por_hacer";
  const existing = await db
    .select({ order: ideas.kanbanOrder })
    .from(ideas)
    .where(and(eq(ideas.userId, user.id), eq(ideas.kanbanStatus, status)));
  const nextOrder = existing.length > 0 ? Math.max(...existing.map((e) => e.order)) + 1 : 0;
  const [row] = await db
    .insert(ideas)
    .values({
      userId: user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      kanbanStatus: status,
      kanbanOrder: nextOrder,
    })
    .returning();
  res.json({ idea: toDto(row!) });
});

router.patch("/ideas/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  type IdeaUpdate = {
    updatedAt: Date;
    title?: string;
    description?: string | null;
    kanbanStatus?: KanbanStatus;
    kanbanOrder?: number;
  };
  const updates: IdeaUpdate = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.kanbanStatus !== undefined) updates.kanbanStatus = parsed.data.kanbanStatus;
  if (parsed.data.kanbanOrder !== undefined) updates.kanbanOrder = parsed.data.kanbanOrder;

  // When moving across columns without an explicit order, append to the end
  // of the destination column to keep ordering deterministic and avoid order
  // collisions accumulating over time.
  if (parsed.data.kanbanStatus !== undefined && parsed.data.kanbanOrder === undefined) {
    const colRows = await db
      .select({ id: ideas.id })
      .from(ideas)
      .where(and(eq(ideas.userId, user.id), eq(ideas.kanbanStatus, parsed.data.kanbanStatus as KanbanStatus)));
    updates.kanbanOrder = colRows.length;
  }

  const [row] = await db
    .update(ideas)
    .set(updates)
    .where(and(eq(ideas.id, id), eq(ideas.userId, user.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Idea no encontrada" });
    return;
  }

  // After a cross-column move, renumber the destination column 0..n-1 so
  // order remains a dense, gap-free sequence.
  if (parsed.data.kanbanStatus !== undefined) {
    const rows = await db
      .select({ id: ideas.id })
      .from(ideas)
      .where(and(eq(ideas.userId, user.id), eq(ideas.kanbanStatus, parsed.data.kanbanStatus as KanbanStatus)))
      .orderBy(asc(ideas.kanbanOrder), asc(ideas.id));
    await Promise.all(
      rows.map((r, idx) =>
        db.update(ideas).set({ kanbanOrder: idx, updatedAt: new Date() }).where(eq(ideas.id, r.id)),
      ),
    );
  }

  res.json({ idea: toDto(row) });
});

router.delete("/ideas/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const result = await db
    .delete(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.userId, user.id)))
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Idea no encontrada" });
    return;
  }
  res.json({ success: true });
});

export default router;
