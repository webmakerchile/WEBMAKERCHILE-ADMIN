import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubNotes } from "@workspace/db/schema";
import { and, desc, eq, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { definedFields, getHubUser, parseId, sendZodError, zExtra } from "./helpers";

const router: IRouter = Router();

const createSchema = z.object({
  title: z.string().max(300).nullable().optional(),
  content: z.string().max(50_000).optional(),
  scope: z.enum(["team", "personal"], {
    errorMap: () => ({ message: "Scope inválido. Use: team, personal" }),
  }).optional(),
  pinned: z.boolean().optional(),
  extra: zExtra.optional(),
});

const patchSchema = createSchema;

/**
 * Visibilidad de notas: las 'team' son de todos; las 'personal' solo las ve
 * (y edita/borra) su creador. Una nota personal ajena se comporta como
 * inexistente (404), nunca como 403.
 */
function visibleTo(userId: number): SQL {
  return or(
    eq(hubNotes.scope, "team"),
    and(eq(hubNotes.scope, "personal"), eq(hubNotes.createdBy, userId)),
  )!;
}

router.get("/hub/notes", async (req: Request, res: Response) => {
  const user = getHubUser(req);
  const rows = await db
    .select()
    .from(hubNotes)
    .where(visibleTo(user.id))
    .orderBy(desc(hubNotes.updatedAt), desc(hubNotes.id));
  res.json(rows);
});

router.post("/hub/notes", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const user = getHubUser(req);
  const [row] = await db
    .insert(hubNotes)
    .values({
      ...parsed.data,
      content: parsed.data.content ?? "",
      scope: parsed.data.scope ?? "team",
      createdBy: user.id,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/hub/notes/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const user = getHubUser(req);

  const [row] = await db
    .update(hubNotes)
    .set({ ...definedFields(parsed.data), updatedAt: new Date() })
    .where(and(eq(hubNotes.id, id), visibleTo(user.id)))
    .returning();
  if (!row) { res.status(404).json({ error: "Nota no encontrada" }); return; }
  res.json(row);
});

router.delete("/hub/notes/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const user = getHubUser(req);
  const deleted = await db
    .delete(hubNotes)
    .where(and(eq(hubNotes.id, id), visibleTo(user.id)))
    .returning({ id: hubNotes.id });
  if (!deleted.length) { res.status(404).json({ error: "Nota no encontrada" }); return; }
  res.status(204).send();
});

export default router;
