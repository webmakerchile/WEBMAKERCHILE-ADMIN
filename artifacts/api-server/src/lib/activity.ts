import { db } from "@workspace/db";
import { activityLog, activityDaySummaries, hubDayLogs } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { stripMoneyFromText } from "./contract-view";

/**
 * Bitácora de actividad transversal.
 *
 * `recordActivity` es fire-and-forget: se llama desde los routers después de
 * una mutación exitosa y NUNCA debe tumbar la request original — cualquier
 * error se loguea a consola y se traga.
 */

export type ActivityEntityType = "task" | "ticket" | "goal" | "video" | "contract" | "project";
export type ActivityAction =
  | "created"
  | "stage_change"
  | "status_change"
  | "assigned"
  | "commented"
  | "completed"
  | "deleted";

export interface ActivityEntry {
  actorId: number;
  entityType: ActivityEntityType;
  entityId: string | number;
  entityLabel: string;
  action: ActivityAction;
  detail?: Record<string, unknown>;
}

/**
 * Sanitiza una etiqueta antes de persistirla: nunca deben quedar montos ni
 * texto sensible en la bitácora, porque el feed global lo ven roles que no
 * pueden ver dinero (invariante del servidor, no del cliente).
 */
export function sanitizeLabel(label: string): string {
  return stripMoneyFromText(label)
    // Complemento a stripMoneyFromText: montos UF con la cifra antes ("990 UF").
    .replace(/\b[\d.,]+\s?(UF|uf)\b/g, "[monto reservado]")
    .slice(0, 300);
}

/** Registra una entrada en la bitácora. No lanza: errores solo van a consola. */
export function recordActivity(entry: ActivityEntry): void {
  Promise.resolve()
    .then(() =>
      db.insert(activityLog).values({
        actorId: entry.actorId,
        entityType: entry.entityType,
        entityId: String(entry.entityId),
        entityLabel: sanitizeLabel(entry.entityLabel),
        action: entry.action,
        detail: entry.detail ?? null,
      }),
    )
    .then(() => {})
    .catch((err) => console.error("[activity] insert failed", err));
}

/* ========================= Resumen de jornada ============================ */

const TZ = "America/Santiago";

export interface DaySummary {
  totals: Record<string, number>; // "task:completed" -> n
  highlights: { entityType: string; action: string; label: string; at: string }[];
  checklistDone: number;
  checklistTotal: number;
  activityCount: number;
}

/**
 * Computa el resumen de un día (fecha local Santiago) desde activity_log +
 * checklist diario. Determinista y re-ejecutable: si hay varios check-outs en
 * el día, el último recálculo pisa al anterior.
 */
export async function computeDaySummary(userId: number, dateStr: string): Promise<DaySummary> {
  const dayMatch = sql`(${activityLog.createdAt} AT TIME ZONE ${TZ})::date = ${dateStr}::date`;
  const [rows, logs] = await Promise.all([
    db
      .select({
        entityType: activityLog.entityType,
        action: activityLog.action,
        label: activityLog.entityLabel,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(and(eq(activityLog.actorId, userId), dayMatch))
      .orderBy(activityLog.createdAt),
    db
      .select({ done: hubDayLogs.done })
      .from(hubDayLogs)
      .where(and(eq(hubDayLogs.userId, userId), eq(hubDayLogs.logDate, dateStr))),
  ]);

  const totals: Record<string, number> = {};
  for (const r of rows) {
    const key = `${r.entityType}:${r.action}`;
    totals[key] = (totals[key] ?? 0) + 1;
  }

  // Highlights: lo terminado/creado pesa más que lo comentado.
  const weight = (a: string) =>
    a === "completed" ? 3 : a === "created" ? 2 : a === "stage_change" || a === "status_change" ? 1 : 0;
  const highlights = [...rows]
    .sort((a, b) => weight(b.action) - weight(a.action))
    .slice(0, 8)
    .map((r) => ({
      entityType: r.entityType,
      action: r.action,
      label: r.label,
      at: r.createdAt.toISOString(),
    }));

  return {
    totals,
    highlights,
    checklistDone: logs.filter((l) => l.done).length,
    checklistTotal: logs.length,
    activityCount: rows.length,
  };
}

/** Persiste (upsert) el resumen del día para un usuario. Devuelve el resumen. */
export async function saveDaySummary(
  userId: number,
  dateStr: string,
  extra?: { minutes?: number },
): Promise<DaySummary & { minutes?: number }> {
  const summary = await computeDaySummary(userId, dateStr);
  const payload: Record<string, unknown> = { ...summary, ...(extra ?? {}) };
  await db
    .insert(activityDaySummaries)
    .values({ userId, summaryDate: dateStr, summary: payload })
    .onConflictDoUpdate({
      target: [activityDaySummaries.userId, activityDaySummaries.summaryDate],
      set: { summary: payload, updatedAt: new Date() },
    });
  return payload as unknown as DaySummary & { minutes?: number };
}
