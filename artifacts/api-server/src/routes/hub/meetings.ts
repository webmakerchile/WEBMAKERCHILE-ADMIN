import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubMeetings } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { clientExists, definedFields, getHubUser, parseId, sendZodError, zExtra, zFecha } from "./helpers";

const router: IRouter = Router();

const createSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(300),
  clientId: z.number().int().positive().nullable().optional(),
  date: zFecha.nullable().optional(),
  summary: z.string().max(20_000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  followUp: z.string().max(20_000).nullable().optional(),
  extra: zExtra.optional(),
});

const patchSchema = createSchema.partial();

async function validClientRef(res: Response, clientId: number | null | undefined): Promise<boolean> {
  if (typeof clientId === "number" && !(await clientExists(clientId))) {
    res.status(400).json({ error: `El cliente #${clientId} no existe` });
    return false;
  }
  return true;
}

router.get("/hub/meetings", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(hubMeetings)
    .orderBy(desc(hubMeetings.updatedAt), desc(hubMeetings.id));
  res.json(rows);
});

router.post("/hub/meetings", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;
  const user = getHubUser(req);
  const [row] = await db
    .insert(hubMeetings)
    .values({ ...parsed.data, createdBy: user.id })
    .returning();
  res.status(201).json(row);
});

router.patch("/hub/meetings/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;

  const update = definedFields(parsed.data);
  // Si se re-agenda la reunión se re-arma el recordatorio de "1 hora antes".
  if (parsed.data.date !== undefined) update.reminderSentAt = null;

  const [row] = await db
    .update(hubMeetings)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(hubMeetings.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Reunión no encontrada" }); return; }
  res.json(row);
});

router.delete("/hub/meetings/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const deleted = await db
    .delete(hubMeetings)
    .where(eq(hubMeetings.id, id))
    .returning({ id: hubMeetings.id });
  if (!deleted.length) { res.status(404).json({ error: "Reunión no encontrada" }); return; }
  res.status(204).send();
});

export default router;
