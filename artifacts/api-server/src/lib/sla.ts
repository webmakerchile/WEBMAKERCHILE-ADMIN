import { db } from "@workspace/db";
import { hubTasks, tickets, videos, users, slaPolicies, slaBreaches } from "@workspace/db/schema";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { normalizeRole } from "@workspace/roles";
import { createNotification } from "./notifications";
import { recordActivity, sanitizeLabel, type ActivityEntityType } from "./activity";
import { resolveBoard } from "./hub-board";
import type { SlaEntityType } from "@workspace/db/schema";

/**
 * SLA por etapa: cada estado tiene un máximo de horas esperado. Al pasarse,
 * se registra UN vencimiento por episodio (entidad+etapa+entrada a la etapa)
 * y se avisa al responsable y a la dirección pidiendo el motivo del atraso.
 */

/** Defaults sensatos por (tipo, etapa), en horas. Editables por dirección. */
export const DEFAULT_SLAS: Array<{ entityType: SlaEntityType; stage: string; maxHours: number }> = [
  { entityType: "task", stage: "backlog", maxHours: 24 * 14 },
  { entityType: "task", stage: "sprint", maxHours: 24 * 5 },
  { entityType: "task", stage: "doing", maxHours: 48 },
  { entityType: "task", stage: "qa_sent", maxHours: 48 },
  { entityType: "task", stage: "qa_rev", maxHours: 48 },
  { entityType: "ticket", stage: "abierto", maxHours: 24 },
  { entityType: "ticket", stage: "en_progreso", maxHours: 72 },
  { entityType: "ticket", stage: "en_revision", maxHours: 48 },
  { entityType: "video", stage: "borrador", maxHours: 24 * 7 },
  { entityType: "video", stage: "en_revision", maxHours: 48 },
  { entityType: "video", stage: "aprobado", maxHours: 72 },
  { entityType: "project", stage: "lead", maxHours: 24 * 7 },
  { entityType: "project", stage: "disc", maxHours: 24 * 7 },
  { entityType: "project", stage: "dev", maxHours: 24 * 21 },
  { entityType: "project", stage: "rev", maxHours: 72 },
  { entityType: "contract", stage: "borrador", maxHours: 24 * 7 },
];

const SEED_LOCK_ID = 730551002;

/** Siembra las políticas por defecto una sola vez (lock consultivo anti-carrera). */
export async function seedSlaPoliciesIfEmpty(): Promise<void> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(slaPolicies);
  if (n > 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_LOCK_ID})`);
    const [{ n: n2 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(slaPolicies);
    if (n2 > 0) return;
    await tx.insert(slaPolicies).values(DEFAULT_SLAS);
  });
}

type PolicyMap = Map<string, number>; // "type:stage" -> maxHours

async function loadPolicies(): Promise<PolicyMap> {
  await seedSlaPoliciesIfEmpty();
  const rows = await db.select().from(slaPolicies);
  const map: PolicyMap = new Map();
  for (const r of rows) map.set(`${r.entityType}:${r.stage}`, r.maxHours);
  return map;
}

/** Ítem abierto en alguna etapa con SLA. */
export type OpenItem = {
  entityType: SlaEntityType;
  entityId: string;
  stage: string;
  stageEnteredAt: Date;
  label: string;
  responsibleId: number | null;
};

const TICKET_OPEN = ["abierto", "en_progreso", "en_revision"] as const;
const VIDEO_OPEN = ["borrador", "en_revision", "aprobado"] as const;

/** Reúne todos los ítems abiertos con su etapa y desde cuándo están en ella. */
export async function collectOpenItems(): Promise<OpenItem[]> {
  const items: OpenItem[] = [];

  const taskRows = await db
    .select({ id: hubTasks.id, title: hubTasks.title, stage: hubTasks.stage, stageSince: hubTasks.stageSince, assigneeId: hubTasks.assigneeId })
    .from(hubTasks)
    .where(ne(hubTasks.stage, "done"));
  for (const t of taskRows) {
    items.push({
      entityType: "task", entityId: String(t.id), stage: t.stage,
      stageEnteredAt: new Date(t.stageSince), label: sanitizeLabel(t.title),
      responsibleId: t.assigneeId ?? null,
    });
  }

  const ticketRows = await db
    .select({ id: tickets.id, title: tickets.title, status: tickets.status, statusSince: tickets.statusSince, createdAt: tickets.createdAt, assignedTo: tickets.assignedTo })
    .from(tickets)
    .where(inArray(tickets.status, TICKET_OPEN as unknown as string[]));
  for (const t of ticketRows) {
    // statusSince solo cambia en transiciones reales de estado, así el
    // episodio de SLA es estable frente a comentarios u otras ediciones.
    items.push({
      entityType: "ticket", entityId: String(t.id), stage: t.status,
      stageEnteredAt: new Date(t.statusSince ?? t.createdAt), label: sanitizeLabel(t.title),
      responsibleId: t.assignedTo ?? null,
    });
  }

  const videoRows = await db
    .select({ id: videos.id, title: videos.title, workflowStatus: videos.workflowStatus, workflowStatusSince: videos.workflowStatusSince, createdAt: videos.createdAt })
    .from(videos)
    .where(inArray(videos.workflowStatus, VIDEO_OPEN as unknown as string[]));
  for (const v of videoRows) {
    items.push({
      entityType: "video", entityId: String(v.id), stage: v.workflowStatus,
      stageEnteredAt: new Date(v.workflowStatusSince ?? v.createdAt), label: sanitizeLabel(v.title || `Video #${v.id}`),
      responsibleId: null,
    });
  }

  // Proyectos y contratos viven en el blob del tablero de dirección.
  try {
    const board = await resolveBoard();
    if (board) {
      const projects = Array.isArray(board.data.projects) ? (board.data.projects as Array<Record<string, unknown>>) : [];
      for (const p of projects) {
        const status = String(p.status ?? "");
        if (!status || status === "done") continue;
        const since = typeof p.stageSince === "number" ? p.stageSince : typeof p.updatedAt === "number" ? p.updatedAt : null;
        if (!since) continue;
        items.push({
          entityType: "project", entityId: String(p.id ?? ""), stage: status,
          stageEnteredAt: new Date(since), label: sanitizeLabel(String(p.name ?? "Proyecto")),
          responsibleId: null,
        });
      }
      const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Array<Record<string, unknown>>) : [];
      for (const c of contracts) {
        const status = String(c.status ?? "");
        if (status !== "borrador") continue;
        const since = typeof c.updatedAt === "number" ? c.updatedAt : typeof c.createdAt === "number" ? c.createdAt : null;
        if (!since) continue;
        items.push({
          entityType: "contract", entityId: String(c.id ?? ""), stage: status,
          stageEnteredAt: new Date(since), label: sanitizeLabel(`Contrato ${String(c.client ?? c.id ?? "")}`),
          responsibleId: null,
        });
      }
    }
  } catch (err: any) {
    console.error("[SLA] board read failed:", err?.message || err);
  }

  return items.filter((i) => i.entityId);
}

/** IDs de la dirección (CEO / superadmin) para copiarles cada aviso. */
export async function getDireccionIds(): Promise<number[]> {
  const team = await db
    .select({ id: users.id, teamRole: users.teamRole, role: users.role })
    .from(users)
    .where(eq(users.approvalStatus, "approved"));
  return team.filter((u) => normalizeRole(u.teamRole, u.role === "superadmin") === "ceo").map((u) => u.id);
}

function hoursIn(ms: number): number {
  return Math.floor(ms / 3_600_000);
}

const STAGE_LABELS: Record<string, string> = {
  backlog: "Backlog", sprint: "Sprint", doing: "En curso", qa_sent: "QA enviado", qa_rev: "QA revisión",
  abierto: "Abierto", en_progreso: "En progreso", en_revision: "En revisión",
  borrador: "Borrador", aprobado: "Aprobado",
  lead: "Lead", disc: "Descubrimiento", dev: "Desarrollo", rev: "Revisión",
};
export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

const TYPE_LABELS: Record<SlaEntityType, string> = {
  task: "Tarea", ticket: "Ticket", video: "Video", project: "Proyecto", contract: "Contrato",
};

/**
 * Chequeo periódico: detecta ítems pasados de SLA, registra el vencimiento
 * (una sola vez por episodio, gracias a la restricción única + ON CONFLICT
 * DO NOTHING) y notifica al responsable y a la dirección.
 */
export async function checkSlaBreaches(now: Date = new Date()): Promise<number> {
  const policies = await loadPolicies();
  const items = await collectOpenItems();
  const direccion = await getDireccionIds();
  let created = 0;

  for (const item of items) {
    const maxHours = policies.get(`${item.entityType}:${item.stage}`);
    if (!maxHours || maxHours <= 0) continue;
    const elapsedMs = now.getTime() - item.stageEnteredAt.getTime();
    if (elapsedMs < maxHours * 3_600_000) continue;

    const inserted = await db
      .insert(slaBreaches)
      .values({
        entityType: item.entityType,
        entityId: item.entityId,
        stage: item.stage,
        stageEnteredAt: item.stageEnteredAt,
        label: item.label,
        responsibleId: item.responsibleId,
        notifiedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: slaBreaches.id });
    if (inserted.length === 0) continue; // episodio ya notificado
    created++;

    const hrs = hoursIn(elapsedMs);
    const title = `⏱️ SLA vencido: ${TYPE_LABELS[item.entityType]} "${item.label}"`;
    const bodyResp = `Lleva ${hrs}h en "${stageLabel(item.stage)}" (máximo ${maxHours}h). Cuéntanos el motivo del atraso desde Mi Día.`;
    const bodyCeo = `Lleva ${hrs}h en "${stageLabel(item.stage)}" (máximo ${maxHours}h).${item.responsibleId ? " Se pidió el motivo al responsable." : " Sin responsable asignado."}`;

    const targets = new Set<number>(direccion);
    try {
      if (item.responsibleId) {
        await createNotification({
          userId: item.responsibleId, type: "system", title, body: bodyResp, link: "/mi-dia",
        });
        targets.delete(item.responsibleId);
      }
      for (const ceoId of targets) {
        await createNotification({ userId: ceoId, type: "system", title, body: bodyCeo, link: "/mi-dia" });
      }
    } catch (err: any) {
      console.error("[SLA] notify failed:", err?.message || err);
    }

    recordActivity({
      actorId: item.responsibleId ?? direccion[0] ?? 0,
      entityType: item.entityType as ActivityEntityType,
      entityId: item.entityId,
      entityLabel: item.label,
      action: "status_change",
      detail: { sla: "vencido", stage: item.stage, maxHours, hoursElapsed: hrs, entityRef: item.entityId },
    });
  }

  return created;
}
