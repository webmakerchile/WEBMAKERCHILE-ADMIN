import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubContracts, hubQuotes, type HubQuoteItem } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";
import { clientExists, definedFields, getAdminIds, getHubUser, parseId, sendZodError, zExtra, zFecha } from "./helpers";

const router: IRouter = Router();

const QUOTE_STATUSES = ["borrador", "enviado", "aceptado", "rechazado"] as const;
/** IVA chileno. */
const IVA_RATE = 0.19;

const itemSchema = z
  .object({
    descripcion: z.string().max(1000),
    cantidad: z.number().min(0),
    precioUnitario: z.number(),
  })
  .passthrough();

const createSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(300),
  clientId: z.number().int().positive().nullable().optional(),
  clientName: z.string().max(200).nullable().optional(),
  status: z.enum(QUOTE_STATUSES, {
    errorMap: () => ({ message: "Estado inválido. Use: borrador, enviado, aceptado, rechazado" }),
  }).optional(),
  currency: z.string().max(10).optional(),
  items: z.array(itemSchema).max(200).optional(),
  subtotal: z.number().int("El subtotal debe ser un entero en CLP").nullable().optional(),
  discount: z.number().int("El descuento debe ser un entero en CLP").min(0).optional(),
  tax: z.number().int("El IVA debe ser un entero en CLP").nullable().optional(),
  total: z.number().int("El total debe ser un entero en CLP").nullable().optional(),
  validityDays: z.number().int().min(0).optional(),
  issuedAt: zFecha.nullable().optional(),
  expiresAt: zFecha.nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  wizData: z.record(z.unknown()).nullable().optional(),
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

/**
 * Completa subtotal/IVA/total cuando el body no los trae pero sí trae items,
 * y deriva expiresAt desde issuedAt + validityDays. Los valores explícitos
 * del body siempre ganan (el wizard del frontend ya calcula los suyos).
 */
function fillDerivedTotals(data: z.infer<typeof createSchema>): z.infer<typeof createSchema> {
  const out = { ...data };
  if (out.subtotal == null && out.items && out.items.length > 0) {
    out.subtotal = Math.round(
      out.items.reduce((sum, it: HubQuoteItem) => sum + it.cantidad * it.precioUnitario, 0),
    );
  }
  if (out.subtotal != null) {
    const discount = out.discount ?? 0;
    if (out.tax == null) out.tax = Math.round(Math.max(0, out.subtotal - discount) * IVA_RATE);
    if (out.total == null) out.total = out.subtotal - discount + (out.tax ?? 0);
  }
  if (out.expiresAt === undefined && out.issuedAt instanceof Date) {
    const days = out.validityDays ?? 15;
    out.expiresAt = new Date(out.issuedAt.getTime() + days * 86_400_000);
  }
  return out;
}

/**
 * Notifica el cambio de estado de un presupuesto (aceptado/rechazado) al
 * creador y a los admins/superadmins, excluyendo a quien hizo el cambio.
 * Nunca lanza: un fallo de push no debe romper el PATCH.
 */
async function notifyQuoteStatus(quote: typeof hubQuotes.$inferSelect, actorId: number): Promise<void> {
  try {
    const recipients = new Set<number>(await getAdminIds());
    if (quote.createdBy != null) recipients.add(quote.createdBy);
    recipients.delete(actorId);
    const label = quote.status === "aceptado" ? "aceptado" : "rechazado";
    for (const userId of recipients) {
      await createNotification({
        userId,
        type: "hub_quote_status",
        title: `Presupuesto ${label}`,
        body: quote.clientName ? `${quote.title} · ${quote.clientName}` : quote.title,
        link: "/ejecutivo?tab=presupuestos",
      });
    }
  } catch (err: any) {
    console.error("[Hub] hub_quote_status notification failed:", err?.message || err);
  }
}

router.get("/hub/quotes", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(hubQuotes)
    .orderBy(desc(hubQuotes.updatedAt), desc(hubQuotes.id));
  res.json(rows);
});

router.post("/hub/quotes", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;
  const user = getHubUser(req);
  const data = fillDerivedTotals(parsed.data);
  const [row] = await db
    .insert(hubQuotes)
    .values({ ...data, createdBy: user.id })
    .returning();
  res.status(201).json(row);
});

router.patch("/hub/quotes/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  if (!(await validClientRef(res, parsed.data.clientId))) return;

  const [prev] = await db.select().from(hubQuotes).where(eq(hubQuotes.id, id)).limit(1);
  if (!prev) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }

  const user = getHubUser(req);
  const [row] = await db
    .update(hubQuotes)
    .set({ ...definedFields(parsed.data), updatedAt: new Date() })
    .where(eq(hubQuotes.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }

  const statusChanged = parsed.data.status !== undefined && parsed.data.status !== prev.status;
  if (statusChanged && (row.status === "aceptado" || row.status === "rechazado")) {
    await notifyQuoteStatus(row, user.id);
  }
  res.json(row);
});

router.delete("/hub/quotes/:id", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const deleted = await db
    .delete(hubQuotes)
    .where(eq(hubQuotes.id, id))
    .returning({ id: hubQuotes.id });
  if (!deleted.length) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }
  res.status(204).send();
});

router.post("/hub/quotes/:id/convert-to-contract", async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const [quote] = await db.select().from(hubQuotes).where(eq(hubQuotes.id, id)).limit(1);
  if (!quote) { res.status(404).json({ error: "Presupuesto no encontrado" }); return; }

  // Idempotencia: si ya se convirtió y el contrato sigue existiendo, se devuelve.
  if (quote.contractId != null) {
    const [existing] = await db
      .select()
      .from(hubContracts)
      .where(eq(hubContracts.id, quote.contractId))
      .limit(1);
    if (existing) { res.json({ contract: existing }); return; }
  }

  const user = getHubUser(req);
  const [contract] = await db
    .insert(hubContracts)
    .values({
      title: quote.title,
      clientId: quote.clientId,
      clientName: quote.clientName,
      status: "activo",
      amount: quote.total,
      currency: quote.currency,
      issuedAt: new Date(),
      createdBy: user.id,
      extra: { fromQuoteId: quote.id },
    })
    .returning();

  await db
    .update(hubQuotes)
    .set({ contractId: contract.id, updatedAt: new Date() })
    .where(eq(hubQuotes.id, quote.id));

  res.status(201).json({ contract });
});

export default router;
