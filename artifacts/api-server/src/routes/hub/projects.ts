import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubProjects } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { clientExists, definedFields, getHubUser, parseId, sendZodError, zExtra, zFecha } from "./helpers";

const router: IRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  clientId: z.number().int().positive().nullable().optional(),
  status: z.string().max(50).nullable().optional(),
  stage: z.string().max(50).nullable().optional(),
  priority: z.string().max(50).nullable().optional(),
  progress: z.number().int().min(0, "El progreso debe estar entre 0 y 100").max(100, "El progreso debe estar entre 0 y 100").nullable().optional(),
  dueDate: zFecha.nullable().optional(),
  description: z.string().max(20_000).nullable().optional(),
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

router.get("/hub/projects", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(hubProjects)
    .orderBy(desc(hubProjects.updatedAt), desc(hubProjects.id));
  res.json(rows);
});

router.post("/hub/projects", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;
  const user = getHubUser(req);
  const [row] = await db
    .insert(hubProjects)
    .values({ ...parsed.data, createdBy: user.id })
    .returning();
  res.status(201).json(row);
});

router.patch("/hub/projects/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;

  const [row] = await db
    .update(hubProjects)
    .set({ ...definedFields(parsed.data), updatedAt: new Date() })
    .where(eq(hubProjects.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Proyecto no encontrado" }); return; }
  res.json(row);
});

router.delete("/hub/projects/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const deleted = await db
    .delete(hubProjects)
    .where(eq(hubProjects.id, id))
    .returning({ id: hubProjects.id });
  if (!deleted.length) { res.status(404).json({ error: "Proyecto no encontrado" }); return; }
  res.status(204).send();
});

export default router;
