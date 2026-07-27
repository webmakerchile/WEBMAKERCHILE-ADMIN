// Cuentas publicitarias de clientes (Google Ads, Meta Ads, TikTok Ads).
//
// Es lo que el área de marketing hace realmente y no tenía dónde vivir. El
// apartado mostraba un resumen de las redes PROPIAS de la agencia, que no le
// sirve a quien administra la pauta de terceros.

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { marketingAdAccounts, users } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

export const PLATAFORMAS_ADS = ["google_ads", "meta_ads", "tiktok_ads"] as const;
export const ESTADOS_CUENTA = ["activa", "pausada", "sin_acceso", "cerrada"] as const;

const cuentaSchema = z.object({
  clientName: z.string().trim().min(1).max(160),
  platform: z.enum(PLATAFORMAS_ADS),
  accountId: z.string().trim().max(80).optional().default(""),
  accountName: z.string().trim().max(160).optional().default(""),
  status: z.enum(ESTADOS_CUENTA).optional().default("activa"),
  /** Presupuesto mensual acordado. Se guarda en unidades enteras de la moneda. */
  monthlyBudget: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().trim().min(1).max(8).optional().default("CLP"),
  notes: z.string().trim().max(2000).optional().default(""),
  ownerId: z.number().int().positive().nullable().optional(),
});

/** GET /marketing/ad-accounts — todas las cuentas, con quién las administra. */
router.get("/marketing/ad-accounts", async (_req: Request, res: Response) => {
  try {
    const filas = await db
      .select({
        id: marketingAdAccounts.id,
        clientName: marketingAdAccounts.clientName,
        platform: marketingAdAccounts.platform,
        accountId: marketingAdAccounts.accountId,
        accountName: marketingAdAccounts.accountName,
        status: marketingAdAccounts.status,
        monthlyBudget: marketingAdAccounts.monthlyBudget,
        currency: marketingAdAccounts.currency,
        notes: marketingAdAccounts.notes,
        ownerId: marketingAdAccounts.ownerId,
        ownerName: users.name,
        updatedAt: marketingAdAccounts.updatedAt,
      })
      .from(marketingAdAccounts)
      .leftJoin(users, eq(users.id, marketingAdAccounts.ownerId))
      .orderBy(asc(marketingAdAccounts.clientName), asc(marketingAdAccounts.platform));
    res.json({ accounts: filas });
  } catch (err) {
    console.error("[marketing/ad-accounts GET]", err);
    res.status(500).json({ error: "No se pudieron cargar las cuentas" });
  }
});

/** POST /marketing/ad-accounts — da de alta una cuenta de cliente. */
router.post("/marketing/ad-accounts", async (req: Request, res: Response) => {
  const parsed = cuentaSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Faltan datos de la cuenta (cliente y plataforma son obligatorios)" });
    return;
  }
  try {
    const [fila] = await db.insert(marketingAdAccounts).values({
      ...parsed.data,
      monthlyBudget: parsed.data.monthlyBudget ?? null,
      ownerId: parsed.data.ownerId ?? null,
    }).returning();
    res.status(201).json({ account: fila });
  } catch (err) {
    console.error("[marketing/ad-accounts POST]", err);
    res.status(500).json({ error: "No se pudo crear la cuenta" });
  }
});

/** PATCH /marketing/ad-accounts/:id — actualiza una cuenta. */
router.patch("/marketing/ad-accounts/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const parsed = cuentaSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  try {
    const [fila] = await db.update(marketingAdAccounts)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(marketingAdAccounts.id, id))
      .returning();
    if (!fila) {
      res.status(404).json({ error: "Cuenta no encontrada" });
      return;
    }
    res.json({ account: fila });
  } catch (err) {
    console.error("[marketing/ad-accounts PATCH]", err);
    res.status(500).json({ error: "No se pudo actualizar la cuenta" });
  }
});

/** DELETE /marketing/ad-accounts/:id */
router.delete("/marketing/ad-accounts/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  try {
    await db.delete(marketingAdAccounts).where(eq(marketingAdAccounts.id, id));
    res.status(204).end();
  } catch (err) {
    console.error("[marketing/ad-accounts DELETE]", err);
    res.status(500).json({ error: "No se pudo eliminar la cuenta" });
  }
});

export default router;
