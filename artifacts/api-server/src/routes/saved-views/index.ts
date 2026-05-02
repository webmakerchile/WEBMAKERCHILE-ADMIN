import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { savedViews, type SavedViewFilters } from "@workspace/db/schema";
import { and, asc, eq } from "drizzle-orm";

const router: IRouter = Router();

function getUserId(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return u?.id ?? null;
}

function sanitizeFilters(input: unknown): SavedViewFilters {
  if (!input || typeof input !== "object") return {};
  const f = input as Record<string, unknown>;
  const out: SavedViewFilters = {};
  if (typeof f.q === "string") out.q = f.q.slice(0, 200);
  if (typeof f.status === "string") out.status = f.status.slice(0, 64);
  if (typeof f.network === "string") out.network = f.network.slice(0, 64);
  if (typeof f.month === "string") out.month = f.month.slice(0, 64);
  return out;
}

router.get("/saved-views", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const rows = await db
    .select()
    .from(savedViews)
    .where(eq(savedViews.userId, userId))
    .orderBy(asc(savedViews.sortOrder), asc(savedViews.id));
  res.json(rows);
});

router.post("/saved-views", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
  if (!name) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }
  const filters = sanitizeFilters(req.body?.filters);
  const sortOrder =
    typeof req.body?.sortOrder === "number" && Number.isFinite(req.body.sortOrder)
      ? Math.floor(req.body.sortOrder)
      : 0;
  const [row] = await db
    .insert(savedViews)
    .values({ userId, name, filters, sortOrder })
    .returning();
  res.status(201).json(row);
});

router.patch("/saved-views/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") {
    const trimmed = req.body.name.trim().slice(0, 80);
    if (!trimmed) {
      res.status(400).json({ error: "El nombre no puede estar vacío" });
      return;
    }
    update.name = trimmed;
  }
  if (req.body?.filters !== undefined) {
    update.filters = sanitizeFilters(req.body.filters);
  }
  if (typeof req.body?.sortOrder === "number" && Number.isFinite(req.body.sortOrder)) {
    update.sortOrder = Math.floor(req.body.sortOrder);
  }
  const [row] = await db
    .update(savedViews)
    .set(update)
    .where(and(eq(savedViews.id, id), eq(savedViews.userId, userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Vista no encontrada" });
    return;
  }
  res.json(row);
});

router.delete("/saved-views/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const deleted = await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.userId, userId)))
    .returning({ id: savedViews.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Vista no encontrada" });
    return;
  }
  res.status(204).send();
});

export default router;
