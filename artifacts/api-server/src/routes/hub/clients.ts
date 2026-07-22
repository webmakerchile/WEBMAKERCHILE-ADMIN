import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubClients } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { definedFields, getHubUser, parseId, sendZodError, zExtra } from "./helpers";

const router: IRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  company: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  extra: zExtra.optional(),
});

const patchSchema = createSchema.partial();

router.get("/hub/clients", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(hubClients)
    .orderBy(desc(hubClients.updatedAt), desc(hubClients.id));
  res.json(rows);
});

router.post("/hub/clients", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const user = getHubUser(req);
  const [row] = await db
    .insert(hubClients)
    .values({ ...parsed.data, createdBy: user.id })
    .returning();
  res.status(201).json(row);
});

router.patch("/hub/clients/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }

  const [row] = await db
    .update(hubClients)
    .set({ ...definedFields(parsed.data), updatedAt: new Date() })
    .where(eq(hubClients.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.json(row);
});

router.delete("/hub/clients/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const deleted = await db
    .delete(hubClients)
    .where(eq(hubClients.id, id))
    .returning({ id: hubClients.id });
  if (!deleted.length) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
  res.status(204).send();
});

export default router;
