import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canSeeMoney, normalizeRole } from "@workspace/roles";
import { resolveBoard, saveBoard } from "../../lib/hub-board";
import { recordActivity } from "../../lib/activity";
import {
  PIPELINE_STAGES,
  STAGE_DEFAULT_PROB,
  computeCommissions,
  getRenewalAlertDays,
  isPipelineStage,
  pipelineContracts,
  setRenewalAlertDays,
  toOpportunity,
  weightedProjection,
} from "../../lib/ventas";

/**
 * Torre de control de Ventas (pipeline, renovaciones y comisiones).
 * Gestión: CEO y Ventas. Los montos (proyección, comisiones, neto) solo
 * salen del servidor para roles con canSeeMoney.
 */
const router: IRouter = Router();

type Rec = Record<string, unknown>;
type Me = { id: number; name: string | null; email: string; teamRole: string | null; role: string };

async function loadMe(req: Request, res: Response): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) { res.status(401).json({ error: "No autenticado" }); return null; }
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return null; }
  return me as Me;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const roleOf = (me: Me) => normalizeRole(me.teamRole, me.role === "superadmin");
const canManageVentas = (me: Me) => {
  const r = roleOf(me);
  return r === "ceo" || r === "ventas";
};

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }).slice(0, 7);
}

/**
 * GET /hub/ventas/resumen?month=YYYY-MM
 * Pipeline normalizado + renovaciones próximas + proyección ponderada del mes.
 * La proyección y los netos solo se incluyen para roles con canSeeMoney.
 */
router.get("/hub/ventas/resumen", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas ven la torre de Ventas" }); return; }
  const month = typeof req.query.month === "string" && MONTH_RE.test(req.query.month) ? req.query.month : currentMonth();
  const seeMoney = canSeeMoney(roleOf(me));

  const board = await resolveBoard();
  const contracts = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const opportunities = pipelineContracts(contracts).map((c) => toOpportunity(c, seeMoney));

  const renewalDays = await getRenewalAlertDays();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const limit = new Date(Date.now() + renewalDays * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const renewalStarted = new Set(contracts.map((c) => str(c.renewalOfId)).filter(Boolean));
  const renewals = contracts
    .filter((c) => str(c.status) === "activo" && str(c.expiresAt) !== "" && str(c.expiresAt) <= limit)
    .map((c) => ({
      id: str(c.id),
      title: str(c.title),
      client: str(c.client),
      expiresAt: str(c.expiresAt),
      expired: str(c.expiresAt) < today,
      renewalStarted: renewalStarted.has(str(c.id)),
    }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  // Posibles dueños de oportunidad: ejecutivos de venta y dirección.
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, teamRole: users.teamRole, role: users.role, approvalStatus: users.approvalStatus })
    .from(users);
  const sellers = allUsers
    .filter((u) => u.approvalStatus === "approved" && ["ventas", "ceo"].includes(normalizeRole(u.teamRole, u.role === "superadmin")))
    .map((u) => ({ id: u.id, name: u.name || u.email }));

  res.json({
    month,
    sellers,
    stages: PIPELINE_STAGES,
    stageDefaults: STAGE_DEFAULT_PROB,
    opportunities,
    renewals,
    renewalAlertDays: renewalDays,
    // Proyección = suma(neto × probabilidad) de las oportunidades del mes.
    projection: seeMoney ? weightedProjection(opportunities, month) : null,
    canSeeMoney: seeMoney,
  });
});

const oppPatchSchema = z.object({
  pipelineStage: z.enum(PIPELINE_STAGES).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  nextFollowUp: z.string().refine((v) => v === "" || DATE_RE.test(v), "Fecha inválida").optional(),
  expectedClose: z.string().refine((v) => v === "" || DATE_RE.test(v) || MONTH_RE.test(v), "Fecha inválida").optional(),
  salesOwnerId: z.number().int().positive().nullable().optional(),
});

/**
 * PATCH /hub/ventas/opportunities/:id — actualiza SOLO los campos de pipeline
 * de un contrato (endpoint acotado, mismo patrón que /cobro: se toca una
 * entidad y se sube su updatedAt para que la fusión del tablero lo respete).
 */
router.patch("/hub/ventas/opportunities/:id", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas gestionan el pipeline" }); return; }
  const parsed = oppPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: parsed.success ? "Nada que actualizar" : parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const board = await resolveBoard();
  if (!board) { res.status(409).json({ error: "Todavía no hay un tablero de dirección" }); return; }
  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const idx = contracts.findIndex((c) => str(c?.id) === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Oportunidad no encontrada" }); return; }

  const patch: Rec = { ...parsed.data };
  // Al cambiar de etapa sin tocar probabilidad, se aplica el default de la etapa.
  if (isPipelineStage(patch.pipelineStage) && parsed.data.probability === undefined) {
    patch.probability = STAGE_DEFAULT_PROB[patch.pipelineStage];
  }
  const next = [...contracts];
  next[idx] = { ...contracts[idx], ...patch, updatedAt: Date.now() };
  await saveBoard(board.boardUserId, { ...board.data, contracts: next });

  if (parsed.data.pipelineStage) {
    recordActivity({
      actorId: me.id,
      entityType: "contract",
      entityId: 0,
      entityLabel: `Oportunidad ${str(contracts[idx].title) || req.params.id} → ${parsed.data.pipelineStage}`,
      action: "status_change",
      detail: { to: parsed.data.pipelineStage },
    });
  }
  res.json({ ok: true, opportunity: toOpportunity(next[idx], canSeeMoney(roleOf(me))) });
});

/**
 * POST /hub/ventas/contracts/:id/renew — "iniciar renovación": crea una
 * oportunidad nueva (contrato borrador) enlazada al contrato que vence.
 */
router.post("/hub/ventas/contracts/:id/renew", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas inician renovaciones" }); return; }
  const board = await resolveBoard();
  if (!board) { res.status(409).json({ error: "Todavía no hay un tablero de dirección" }); return; }
  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const orig = contracts.find((c) => str(c?.id) === req.params.id);
  if (!orig) { res.status(404).json({ error: "Contrato no encontrado" }); return; }
  if (contracts.some((c) => str(c.renewalOfId) === str(orig.id))) {
    res.status(409).json({ error: "Ese contrato ya tiene una renovación iniciada" });
    return;
  }
  const now = Date.now();
  const renewal: Rec = {
    id: "id" + now.toString(36) + Math.random().toString(36).slice(2, 7),
    title: `${str(orig.title)} (renovación)`.slice(0, 160),
    client: str(orig.client),
    value: str(orig.value),
    status: "borrador",
    signedAt: "",
    expiresAt: "",
    notes: `Renovación del contrato "${str(orig.title)}" que vence el ${str(orig.expiresAt) || "—"}.`,
    doc: orig.doc,
    createdAt: now,
    updatedAt: now,
    pipelineStage: "contactado",
    probability: STAGE_DEFAULT_PROB.contactado,
    renewalOfId: str(orig.id),
    salesOwnerId: Number(orig.salesOwnerId) > 0 ? Number(orig.salesOwnerId) : me.id,
  };
  await saveBoard(board.boardUserId, { ...board.data, contracts: [...contracts, renewal] });
  recordActivity({
    actorId: me.id,
    entityType: "contract",
    entityId: 0,
    entityLabel: `Renovación iniciada: ${str(orig.title)}`,
    action: "created",
  });
  res.status(201).json({ ok: true, opportunity: toOpportunity(renewal, canSeeMoney(roleOf(me))) });
});

/** GET/PUT /hub/ventas/settings — antelación de la alerta de renovación. */
router.get("/hub/ventas/settings", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Sin acceso" }); return; }
  res.json({ renewalAlertDays: await getRenewalAlertDays() });
});

router.put("/hub/ventas/settings", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Sin acceso" }); return; }
  const parsed = z.object({ renewalAlertDays: z.number().int().min(1).max(365) }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Antelación inválida (1–365 días)" }); return; }
  res.json({ renewalAlertDays: await setRenewalAlertDays(parsed.data.renewalAlertDays) });
});

/**
 * GET /hub/ventas/comisiones?month=YYYY-MM
 * Comisiones sobre lo efectivamente cobrado (cobro.estado = "pagado").
 * Ventas ve SOLO las suyas; CEO ve todas.
 */
router.get("/hub/ventas/comisiones", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  const role = roleOf(me);
  if (role !== "ceo" && role !== "ventas") { res.status(403).json({ error: "Sin acceso a comisiones" }); return; }
  if (!canSeeMoney(role)) { res.status(403).json({ error: "Tu rol no puede ver montos" }); return; }
  const month = typeof req.query.month === "string" && MONTH_RE.test(req.query.month) ? req.query.month : currentMonth();

  let rows = await computeCommissions(month);
  if (role !== "ceo") rows = rows.filter((r) => r.salesOwnerId === me.id);

  const ownerIds = [...new Set(rows.map((r) => r.salesOwnerId).filter((n): n is number => n !== null))];
  const names = new Map<number, string>();
  for (const id of ownerIds) {
    const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (u) names.set(id, u.name || u.email);
  }
  res.json({
    month,
    rows: rows.map((r) => ({ ...r, ownerName: r.salesOwnerId ? (names.get(r.salesOwnerId) ?? null) : null })),
    totals: {
      collectedNet: rows.reduce((a, r) => a + r.amountNet, 0),
      commission: rows.reduce((a, r) => a + r.commission, 0),
    },
  });
});

export default router;
