import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { ideas, IDEA_COLUMNS, type IdeaColumnId } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

// Tablero de Ideas de Editora + Redes sociales: es de EQUIPO, no una lista
// privada por usuario. Todas las cuentas con acceso (ver ideas-gate.ts, que
// gatea el mount de este router en routes/index.ts) ven la misma lista y
// pueden mover o borrar cualquier idea — no hay filtro ni comprobación de
// dueño en ningún método de abajo.

const router: IRouter = Router();

type AuthedUser = { id: number; name?: string | null };
function getUser(req: Request): AuthedUser {
  return req.user as AuthedUser;
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(280),
  columnId: z.enum(IDEA_COLUMNS).optional(),
});

const updateSchema = z.object({
  columnId: z.enum(IDEA_COLUMNS),
});

function toDto(r: typeof ideas.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    columnId: r.columnId as IdeaColumnId,
    createdByUserId: r.createdByUserId,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

router.get("/ideas", async (_req: Request, res: Response) => {
  const rows = await db.select().from(ideas).orderBy(desc(ideas.id));
  res.json({ ideas: rows.map(toDto) });
});

router.post("/ideas", async (req: Request, res: Response) => {
  const user = getUser(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .insert(ideas)
    .values({
      title: parsed.data.title,
      columnId: parsed.data.columnId || "funciona",
      createdByUserId: user.id,
      createdByName: user.name ?? null,
    })
    .returning();
  res.json({ idea: toDto(row!) });
});

router.patch("/ideas/:id", async (req: Request, res: Response) => {
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
  const [row] = await db
    .update(ideas)
    .set({ columnId: parsed.data.columnId, updatedAt: new Date() })
    .where(eq(ideas.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Idea no encontrada" });
    return;
  }
  res.json({ idea: toDto(row) });
});

router.delete("/ideas/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const result = await db.delete(ideas).where(eq(ideas.id, id)).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Idea no encontrada" });
    return;
  }
  res.json({ success: true });
});

export default router;
