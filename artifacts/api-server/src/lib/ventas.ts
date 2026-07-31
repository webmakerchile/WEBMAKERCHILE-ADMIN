import { db } from "@workspace/db";
import { salesAlerts, salesSettings, users, employeeProfiles } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { normalizeRole } from "@workspace/roles";
import { resolveBoard } from "./hub-board";
import { createNotification } from "./notifications";
import { esReunionVentas } from "./reuniones-ventas";

/**
 * Torre de control de Ventas.
 *
 * Las oportunidades son los contratos del tablero del Hub en estado
 * "borrador", enriquecidos con campos de pipeline (etapa, probabilidad,
 * próximo seguimiento, dueño). Aquí viven los cálculos puros (proyección
 * ponderada, comisiones) y las alertas de fondo (seguimientos vencidos,
 * renovaciones próximas) con dedupe en la tabla sales_alerts — nunca se
 * escribe el blob del tablero desde un job.
 */

export const PIPELINE_STAGES = ["prospecto", "contactado", "propuesta", "negociacion", "cierre"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Probabilidad por defecto según etapa (editable por oportunidad). */
export const STAGE_DEFAULT_PROB: Record<PipelineStage, number> = {
  prospecto: 10,
  contactado: 25,
  propuesta: 50,
  negociacion: 75,
  cierre: 90,
};

type Rec = Record<string, unknown>;

export interface Opportunity {
  id: string;
  title: string;
  client: string;
  stage: PipelineStage;
  probability: number;
  nextFollowUp: string;
  expectedClose: string;
  salesOwnerId: number | null;
  renewalOfId: string;
  updatedAt: number;
  /** Caso "a futuro": el cliente aceptó pero pospone el arranque. */
  futuroFecha: string;
  futuroMotivo: string;
  /** Neto (sin IVA) — solo se incluye para roles con canSeeMoney. */
  amountNet?: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Neto (sin IVA) del contrato: suma de módulos; si no hay, el `value` se asume bruto. */
export function contractNet(contract: Rec): number {
  const doc = contract.doc as Rec | undefined;
  const modules = Array.isArray(doc?.modules) ? (doc!.modules as Rec[]) : [];
  const sum = modules.reduce((a, m) => a + (typeof m?.price === "number" && isFinite(m.price) ? m.price : 0), 0);
  if (sum > 0) return Math.round(sum);
  const raw = str(contract.value).replace(/[^\d]/g, "");
  const gross = raw ? Number(raw) : 0;
  // El `value` escrito a mano suele ser el total con IVA: se lleva a neto.
  return gross > 0 ? Math.round(gross / 1.19) : 0;
}

export function isPipelineStage(v: unknown): v is PipelineStage {
  return typeof v === "string" && (PIPELINE_STAGES as readonly string[]).includes(v);
}

/**
 * Normaliza un contrato-borrador a oportunidad. Los contratos anteriores al
 * pipeline no traen etapa/probabilidad: se les asigna el default AL LEER —
 * migración perezosa e idempotente, sin tocar datos guardados.
 */
export function toOpportunity(contract: Rec, includeMoney: boolean): Opportunity {
  const stage = isPipelineStage(contract.pipelineStage) ? contract.pipelineStage : "prospecto";
  const probRaw = Number(contract.probability);
  const probability = Number.isFinite(probRaw) && probRaw >= 0 && probRaw <= 100
    ? Math.round(probRaw)
    : STAGE_DEFAULT_PROB[stage];
  const ownerRaw = Number(contract.salesOwnerId);
  const opp: Opportunity = {
    id: str(contract.id),
    title: str(contract.title),
    client: str(contract.client),
    stage,
    probability,
    nextFollowUp: str(contract.nextFollowUp),
    expectedClose: str(contract.expectedClose),
    salesOwnerId: Number.isInteger(ownerRaw) && ownerRaw > 0 ? ownerRaw : null,
    renewalOfId: str(contract.renewalOfId),
    updatedAt: Number(contract.updatedAt) || 0,
    futuroFecha: str(contract.futuroFecha),
    futuroMotivo: str(contract.futuroMotivo),
  };
  if (includeMoney) opp.amountNet = contractNet(contract);
  return opp;
}

/** Contratos del tablero en estado borrador = pipeline vivo. */
export function pipelineContracts(contracts: unknown): Rec[] {
  if (!Array.isArray(contracts)) return [];
  return (contracts as Rec[]).filter((c) => c && typeof c === "object" && str(c.status) === "borrador");
}

/**
 * Proyección ponderada del mes: suma de neto × probabilidad de las
 * oportunidades cuyo cierre esperado cae en `month` (YYYY-MM). Las que no
 * declaran cierre esperado se cuentan en el mes actual: mejor sobreavisar.
 */
export function weightedProjection(opps: Array<{ amountNet?: number; probability: number; expectedClose: string }>, month: string): number {
  let total = 0;
  for (const o of opps) {
    const m = o.expectedClose ? o.expectedClose.slice(0, 7) : month;
    if (m !== month) continue;
    total += ((o.amountNet ?? 0) * o.probability) / 100;
  }
  return Math.round(total);
}

/* ============================== Comisiones =============================== */

export interface CommissionRow {
  contractId: string;
  title: string;
  client: string;
  salesOwnerId: number | null;
  paidAt: string;
  amountNet: number;
  commissionPct: number;
  commission: number;
}

/**
 * Comisiones del mes: SOLO contratos con cobro efectivamente pagado
 * (cobro.estado === "pagado", dato que registra cobranza) cuya fecha de pago
 * cae en `month`. La base es el neto (sin IVA).
 */
export async function computeCommissions(month: string): Promise<CommissionRow[]> {
  const board = await resolveBoard();
  if (!board) return [];
  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const paid = contracts.filter((c) => {
    const cobro = c?.cobro as Rec | undefined;
    return cobro && str(cobro.estado) === "pagado" && str(cobro.fechaPago).slice(0, 7) === month;
  });
  if (paid.length === 0) return [];

  const ownerIds = [...new Set(paid.map((c) => Number(c.salesOwnerId)).filter((n) => Number.isInteger(n) && n > 0))];
  const pctByUser = new Map<number, number>();
  if (ownerIds.length > 0) {
    const rows = await db
      .select({ userId: employeeProfiles.userId, pct: employeeProfiles.commissionPct })
      .from(employeeProfiles)
      .where(inArray(employeeProfiles.userId, ownerIds));
    for (const r of rows) pctByUser.set(r.userId, r.pct);
  }

  return paid.map((c) => {
    const ownerRaw = Number(c.salesOwnerId);
    const salesOwnerId = Number.isInteger(ownerRaw) && ownerRaw > 0 ? ownerRaw : null;
    const pct = salesOwnerId ? (pctByUser.get(salesOwnerId) ?? 0) : 0;
    const amountNet = contractNet(c);
    return {
      contractId: str(c.id),
      title: str(c.title),
      client: str(c.client),
      salesOwnerId,
      paidAt: str((c.cobro as Rec).fechaPago),
      amountNet,
      commissionPct: pct,
      commission: Math.round((amountNet * pct) / 100),
    };
  });
}

/* ============================ Configuración ============================== */

export async function getRenewalAlertDays(): Promise<number> {
  const [row] = await db.select().from(salesSettings).where(eq(salesSettings.id, 1)).limit(1);
  return row?.renewalAlertDays ?? 30;
}

export async function setRenewalAlertDays(days: number): Promise<number> {
  const [row] = await db
    .insert(salesSettings)
    .values({ id: 1, renewalAlertDays: days, updatedAt: new Date() })
    .onConflictDoUpdate({ target: salesSettings.id, set: { renewalAlertDays: days, updatedAt: new Date() } })
    .returning();
  return row?.renewalAlertDays ?? days;
}

/* ========================= Alertas en segundo plano ====================== */

const TZ = "America/Santiago";
function localDateStr(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

async function ventasUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: users.id, teamRole: users.teamRole, role: users.role, approvalStatus: users.approvalStatus })
    .from(users);
  return rows
    .filter((u) => u.approvalStatus === "approved" && normalizeRole(u.teamRole, u.role === "superadmin") === "ventas")
    .map((u) => u.id);
}

async function direccionUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: users.id, teamRole: users.teamRole, role: users.role, approvalStatus: users.approvalStatus })
    .from(users);
  return rows
    .filter((u) => u.approvalStatus === "approved" && normalizeRole(u.teamRole, u.role === "superadmin") === "ceo")
    .map((u) => u.id);
}

/** Inserta el marcador; false si ya existía (aviso ya emitido). */
async function claimAlert(kind: string, contractRef: string, marker: string): Promise<boolean> {
  const inserted = await db
    .insert(salesAlerts)
    .values({ kind, contractRef, marker })
    .onConflictDoNothing()
    .returning({ id: salesAlerts.id });
  return inserted.length > 0;
}

/**
 * Seguimientos vencidos: oportunidades cuyo `nextFollowUp` ya pasó y siguen
 * en pipeline. Un aviso por (oportunidad, fecha): si el ejecutivo agenda una
 * nueva fecha tras contactar, el marcador cambia y se rearma solo.
 *
 * Si el seguimiento apunta a una reunión de venta que sigue sin desenlace,
 * este aviso se calla: del mismo hecho ya avisa el recordatorio de reuniones
 * sin desenlace, con la instrucción concreta (anotar el resultado). Dos
 * avisos por lo mismo enseñan a ignorar ambos.
 */
export async function checkSalesFollowUps(now: Date = new Date()): Promise<number> {
  const board = await resolveBoard();
  if (!board) return 0;
  const today = localDateStr(now);
  const meetings = Array.isArray(board.data.meetings) ? (board.data.meetings as Rec[]) : [];
  const cubiertoPorReunion = (c: Rec) => meetings.some((m) =>
    esReunionVentas(m) && str(m.contractId) === str(c.id) &&
    str(m.desenlace) === "" && str(m.date) === str(c.nextFollowUp));
  const due = pipelineContracts(board.data.contracts).filter((c) => {
    const f = str(c.nextFollowUp);
    return f !== "" && f < today && !cubiertoPorReunion(c);
  });
  if (due.length === 0) return 0;

  let sent = 0;
  let fallback: number[] | null = null;
  for (const c of due) {
    const marker = str(c.nextFollowUp);
    if (!(await claimAlert("follow_up", str(c.id), marker))) continue;
    const ownerRaw = Number(c.salesOwnerId);
    let recipients: number[];
    if (Number.isInteger(ownerRaw) && ownerRaw > 0) {
      recipients = [ownerRaw];
    } else {
      fallback ??= await ventasUserIds();
      recipients = fallback;
    }
    for (const uid of recipients) {
      await createNotification({
        userId: uid,
        type: "system",
        title: `Seguimiento vencido: ${str(c.client) || str(c.title)}`,
        body: `La oportunidad "${str(c.title)}" tenía seguimiento para el ${marker} y sigue sin nueva fecha. Retoma el contacto y agenda el próximo paso.`,
        link: "/ejecutivo",
      }).catch(() => {});
    }
    sent++;
  }
  return sent;
}

/**
 * Renovaciones: contratos activos que vencen dentro de la antelación
 * configurada y aún no tienen renovación iniciada. Un aviso por
 * (contrato, fecha de vencimiento).
 */
export async function checkContractRenewals(now: Date = new Date()): Promise<number> {
  const board = await resolveBoard();
  if (!board) return 0;
  const days = await getRenewalAlertDays();
  const today = localDateStr(now);
  const limit = localDateStr(new Date(now.getTime() + days * 86400000));

  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const renewalStarted = new Set(contracts.map((c) => str(c.renewalOfId)).filter(Boolean));
  const dueSoon = contracts.filter((c) => {
    const exp = str(c.expiresAt);
    return str(c.status) === "activo" && exp !== "" && exp >= today && exp <= limit && !renewalStarted.has(str(c.id));
  });
  if (dueSoon.length === 0) return 0;

  let recipients: number[] | null = null;
  let sent = 0;
  for (const c of dueSoon) {
    if (!(await claimAlert("renewal", str(c.id), str(c.expiresAt)))) continue;
    recipients ??= [...new Set([...(await ventasUserIds()), ...(await direccionUserIds())])];
    for (const uid of recipients) {
      await createNotification({
        userId: uid,
        type: "system",
        title: `Contrato por vencer: ${str(c.client) || str(c.title)}`,
        body: `"${str(c.title)}" vence el ${str(c.expiresAt)}. Inicia la renovación desde la torre de Ventas antes de que caduque.`,
        link: "/ejecutivo",
      }).catch(() => {});
    }
    sent++;
  }
  return sent;
}

/* ================= Casos "a futuro" y reuniones sin desenlace ============ */

/** Con cuánta anticipación se avisa que un caso a futuro llega a su fecha. */
export const FUTURO_AVISO_DIAS = 7;

const FUTURO_LABEL: Record<string, string> = {
  fondos: "le faltan fondos",
  inversionista: "espera a un inversionista",
  planificacion_pagos: "planificación de pagos",
  otro: "otro motivo",
};

/**
 * Casos "a futuro" cuya fecha estimada de retomar ya llegó o está a menos de
 * FUTURO_AVISO_DIAS (los vencidos siguen contando: peor sería callarlos).
 * Un aviso por (oportunidad, fecha): si al conversar se fija una fecha nueva,
 * el marcador cambia y el aviso se rearma solo.
 */
export async function checkCasosFuturo(now: Date = new Date()): Promise<number> {
  const board = await resolveBoard();
  if (!board) return 0;
  const limit = localDateStr(new Date(now.getTime() + FUTURO_AVISO_DIAS * 86400000));
  const due = pipelineContracts(board.data.contracts).filter((c) => {
    const f = str(c.futuroFecha);
    return f !== "" && f <= limit;
  });
  if (due.length === 0) return 0;

  let fallback: number[] | null = null;
  let sent = 0;
  for (const c of due) {
    if (!(await claimAlert("futuro", str(c.id), str(c.futuroFecha)))) continue;
    const ownerRaw = Number(c.salesOwnerId);
    let recipients: number[];
    if (Number.isInteger(ownerRaw) && ownerRaw > 0) {
      recipients = [ownerRaw];
    } else {
      fallback ??= await ventasUserIds();
      recipients = fallback;
    }
    const motivo = FUTURO_LABEL[str(c.futuroMotivo)] || "sin motivo registrado";
    for (const uid of recipients) {
      await createNotification({
        userId: uid,
        type: "system",
        title: `Caso a futuro por retomar: ${str(c.client) || str(c.title)}`,
        body: `"${str(c.title)}" quedó a futuro (${motivo}) con fecha estimada ${str(c.futuroFecha)}. Retoma el contacto y agenda la reunión.`,
        link: "/ejecutivo",
      }).catch(() => {});
    }
    sent++;
  }
  return sent;
}

/**
 * Reuniones de venta que ya pasaron y siguen sin desenlace registrado,
 * mientras la oportunidad sigue viva. Es el agujero clásico del embudo: la
 * reunión se hizo, nadie anotó el resultado y el caso muere en silencio.
 * Un aviso por (reunión, fecha de la reunión).
 */
export async function checkReunionesSinDesenlace(now: Date = new Date()): Promise<number> {
  const board = await resolveBoard();
  if (!board) return 0;
  const today = localDateStr(now);
  const meetings = Array.isArray(board.data.meetings) ? (board.data.meetings as Rec[]) : [];
  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const porId = new Map(contracts.map((c) => [str(c.id), c] as const));

  const due = meetings.filter((m) => {
    if (!m || typeof m !== "object" || !esReunionVentas(m)) return false;
    if (str(m.desenlace) !== "") return false;
    const d = str(m.date);
    if (d === "" || d >= today) return false;
    const c = porId.get(str(m.contractId));
    // Si la oportunidad ya se cerró por fuera (o se borró), no hay nada que registrar.
    return !!c && str(c.status) === "borrador";
  });
  if (due.length === 0) return 0;

  let fallback: number[] | null = null;
  let sent = 0;
  for (const m of due) {
    if (!(await claimAlert("reunion_desenlace", str(m.contractId), `${str(m.id)}:${str(m.date)}`))) continue;
    const c = porId.get(str(m.contractId))!;
    const ownerRaw = Number(c.salesOwnerId);
    let recipients: number[];
    if (Number.isInteger(ownerRaw) && ownerRaw > 0) {
      recipients = [ownerRaw];
    } else {
      fallback ??= await ventasUserIds();
      recipients = fallback;
    }
    for (const uid of recipients) {
      await createNotification({
        userId: uid,
        type: "system",
        title: `Reunión sin desenlace: ${str(m.client) || str(c.title)}`,
        body: `La reunión ${str(m.tipo)} del ${str(m.date)} con "${str(m.client) || str(c.title)}" no tiene desenlace registrado. Anótalo en la ficha del contrato: siguiente reunión, acepta, a futuro o perdido.`,
        link: "/ejecutivo",
      }).catch(() => {});
    }
    sent++;
  }
  return sent;
}
