import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubContracts } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { clientExists, definedFields, getHubUser, parseId, sendZodError, zExtra, zFecha } from "./helpers";

const router: IRouter = Router();

const createSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(300),
  clientId: z.number().int().positive().nullable().optional(),
  clientName: z.string().max(200).nullable().optional(),
  status: z.string().max(50).nullable().optional(),
  amount: z.number().int("El monto debe ser un entero en CLP").nullable().optional(),
  currency: z.string().max(10).optional(),
  issuedAt: zFecha.nullable().optional(),
  expiresAt: zFecha.nullable().optional(),
  driveFileId: z.string().max(200).nullable().optional(),
  body: z.string().max(200_000).nullable().optional(),
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

router.get("/hub/contracts", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(hubContracts)
    .orderBy(desc(hubContracts.updatedAt), desc(hubContracts.id));
  res.json(rows);
});

router.post("/hub/contracts", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;
  const user = getHubUser(req);
  const [row] = await db
    .insert(hubContracts)
    .values({ ...parsed.data, createdBy: user.id })
    .returning();
  res.status(201).json(row);
});

router.patch("/hub/contracts/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;

  const update = definedFields(parsed.data);
  // Si cambia el vencimiento se re-arma el aviso de "vence en ≤7 días".
  if (parsed.data.expiresAt !== undefined) update.expiryRemindedAt = null;

  const [row] = await db
    .update(hubContracts)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(hubContracts.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Contrato no encontrado" }); return; }
  res.json(row);
});

router.delete("/hub/contracts/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const deleted = await db
    .delete(hubContracts)
    .where(eq(hubContracts.id, id))
    .returning({ id: hubContracts.id });
  if (!deleted.length) { res.status(404).json({ error: "Contrato no encontrado" }); return; }
  res.status(204).send();
});

export default router;
