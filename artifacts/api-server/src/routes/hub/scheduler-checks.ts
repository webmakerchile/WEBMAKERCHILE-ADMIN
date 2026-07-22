import { db } from "@workspace/db";
import { hubContracts, hubMeetings, hubTasks, notifications, users } from "@workspace/db/schema";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { createNotification } from "../../lib/notifications";

/**
 * Chequeos periódicos del Hub Ejecutivo, invocados desde el tick del scheduler
 * (cada 60s) SIEMPRE dentro de un try/catch propio: un fallo aquí jamás debe
 * afectar la publicación de videos.
 *
 *  - Cada tick: recordatorio de reuniones que parten en ~1 hora (ventana 55-65
 *    min, con marca reminderSentAt para no duplicar).
 *  - Una vez al día desde las 09:00 America/Santiago: digest por usuario
 *    (tareas de hoy/vencidas + reuniones de hoy) y aviso a admins de contratos
 *    que vencen en ≤7 días (marca expiryRemindedAt).
 */

const TZ = "America/Santiago";
const DIGEST_HOUR = 9;

function santiagoDateString(d: Date): string {
  // en-CA produce YYYY-MM-DD, comparable lexicográficamente.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function santiagoHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d),
  );
}

function santiagoTimeLabel(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function santiagoDayLabel(d: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

async function getApprovedUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.approvalStatus, "approved"));
  return rows.map((r) => r.id);
}

async function getAdminUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.approvalStatus, "approved"), inArray(users.role, ["admin", "superadmin"])));
  return rows.map((r) => r.id);
}

/**
 * Reuniones que parten entre now+55min y now+65min sin recordatorio enviado:
 * se marca reminderSentAt PRIMERO (claim) y luego se notifica a todos los
 * usuarios aprobados, para que un tick solapado no duplique el push.
 */
async function checkMeetingReminders(now: Date): Promise<void> {
  const windowStart = new Date(now.getTime() + 55 * 60_000);
  const windowEnd = new Date(now.getTime() + 65 * 60_000);
  const due = await db
    .select()
    .from(hubMeetings)
    .where(
      and(
        isNull(hubMeetings.reminderSentAt),
        isNotNull(hubMeetings.date),
        gte(hubMeetings.date, windowStart),
        lte(hubMeetings.date, windowEnd),
      ),
    );
  if (due.length === 0) return;

  const userIds = await getApprovedUserIds();
  for (const meeting of due) {
    const [claimed] = await db
      .update(hubMeetings)
      .set({ reminderSentAt: now })
      .where(and(eq(hubMeetings.id, meeting.id), isNull(hubMeetings.reminderSentAt)))
      .returning({ id: hubMeetings.id });
    if (!claimed) continue;

    const body = meeting.date
      ? `${meeting.title} · ${santiagoTimeLabel(meeting.date)} hrs`
      : meeting.title;
    for (const userId of userIds) {
      try {
        await createNotification({
          userId,
          type: "hub_meeting_reminder",
          title: "Reunión en 1 hora",
          body,
          link: "/ejecutivo?tab=reuniones",
        });
      } catch (err: any) {
        console.error("[Scheduler][Hub] hub_meeting_reminder failed:", err?.message || err);
      }
    }
    console.log(`[Scheduler][Hub] Meeting reminder sent for #${meeting.id} "${meeting.title}"`);
  }
}

/**
 * Digest diario por usuario aprobado: tareas asignadas con dueDate hoy o
 * vencidas (status ≠ 'hecho') + reuniones de hoy. Guard duro: si ya existe una
 * notificación hub_digest del usuario creada HOY (hora de Santiago), se salta.
 */
async function sendDailyDigests(now: Date, today: string): Promise<void> {
  const userIds = await getApprovedUserIds();
  if (userIds.length === 0) return;

  const openTasks = await db
    .select()
    .from(hubTasks)
    .where(and(isNotNull(hubTasks.dueDate), or(isNull(hubTasks.status), ne(hubTasks.status, "hecho"))));
  const dueOrOverdueTasks = openTasks.filter(
    (t) => t.dueDate && santiagoDateString(t.dueDate) <= today,
  );

  const nearMeetings = await db
    .select()
    .from(hubMeetings)
    .where(
      and(
        isNotNull(hubMeetings.date),
        gte(hubMeetings.date, new Date(now.getTime() - 86_400_000)),
        lte(hubMeetings.date, new Date(now.getTime() + 86_400_000)),
      ),
    );
  const todaysMeetings = nearMeetings.filter((m) => m.date && santiagoDateString(m.date) === today);

  for (const userId of userIds) {
    try {
      const [lastDigest] = await db
        .select({ createdAt: notifications.createdAt })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.type, "hub_digest")))
        .orderBy(desc(notifications.createdAt))
        .limit(1);
      if (lastDigest && santiagoDateString(lastDigest.createdAt) === today) continue;

      const myTasks = dueOrOverdueTasks.filter(
        (t) => Array.isArray(t.assigneeIds) && t.assigneeIds.includes(userId),
      );
      const nTasks = myTasks.length;
      const nMeetings = todaysMeetings.length;
      if (nTasks === 0 && nMeetings === 0) continue;

      const parts: string[] = [];
      if (nTasks > 0) parts.push(`${nTasks} ${nTasks === 1 ? "tarea" : "tareas"} para hoy`);
      if (nMeetings > 0) parts.push(`${nMeetings} ${nMeetings === 1 ? "reunión" : "reuniones"}`);
      await createNotification({
        userId,
        type: "hub_digest",
        title: "Tu resumen del día",
        body: parts.join(" · "),
        link: "/ejecutivo",
      });
    } catch (err: any) {
      console.error(`[Scheduler][Hub] hub_digest failed for user ${userId}:`, err?.message || err);
    }
  }
}

/**
 * Contratos con vencimiento en los próximos 7 días (aún vigentes) sin aviso
 * enviado: se marca expiryRemindedAt (claim) y se notifica a los admins.
 */
async function checkExpiringContracts(now: Date): Promise<void> {
  const in7Days = new Date(now.getTime() + 7 * 86_400_000);
  const expiring = await db
    .select()
    .from(hubContracts)
    .where(
      and(
        isNull(hubContracts.expiryRemindedAt),
        isNotNull(hubContracts.expiresAt),
        gt(hubContracts.expiresAt, now),
        lte(hubContracts.expiresAt, in7Days),
      ),
    );
  if (expiring.length === 0) return;

  const adminIds = await getAdminUserIds();
  for (const contract of expiring) {
    const [claimed] = await db
      .update(hubContracts)
      .set({ expiryRemindedAt: now })
      .where(and(eq(hubContracts.id, contract.id), isNull(hubContracts.expiryRemindedAt)))
      .returning({ id: hubContracts.id });
    if (!claimed) continue;

    const body = contract.expiresAt
      ? `"${contract.title}" vence el ${santiagoDayLabel(contract.expiresAt)}`
      : `"${contract.title}" está por vencer`;
    for (const userId of adminIds) {
      try {
        await createNotification({
          userId,
          type: "hub_contract_expiry",
          title: "Contrato por vencer",
          body,
          link: "/ejecutivo?tab=contratos",
        });
      } catch (err: any) {
        console.error("[Scheduler][Hub] hub_contract_expiry failed:", err?.message || err);
      }
    }
    console.log(`[Scheduler][Hub] Expiry reminder sent for contract #${contract.id}`);
  }
}

/**
 * Memo en memoria del último día (Santiago) en que corrió el bloque diario
 * completo. Evita re-consultar la DB cada minuto; el guard duro tras un
 * reinicio del proceso es la notificación hub_digest ya creada hoy y las
 * marcas expiryRemindedAt.
 */
let lastDailyRunDay: string | null = null;

async function runDailyBlock(now: Date): Promise<void> {
  if (santiagoHour(now) < DIGEST_HOUR) return;
  const today = santiagoDateString(now);
  if (lastDailyRunDay === today) return;

  await sendDailyDigests(now, today);
  await checkExpiringContracts(now);
  // Solo se marca el día si TODO el bloque terminó sin lanzar: si algo falló,
  // el próximo tick reintenta y los guards por notificación evitan duplicados.
  lastDailyRunDay = today;
}

/** Punto de entrada llamado desde el tick del scheduler. */
export async function runHubSchedulerChecks(): Promise<void> {
  const now = new Date();
  try {
    await checkMeetingReminders(now);
  } catch (err: any) {
    console.error("[Scheduler][Hub] checkMeetingReminders failed:", err?.message || err);
  }
  try {
    await runDailyBlock(now);
  } catch (err: any) {
    console.error("[Scheduler][Hub] daily block failed:", err?.message || err);
  }
}
