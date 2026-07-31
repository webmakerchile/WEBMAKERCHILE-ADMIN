import webpush from "web-push";
import { db } from "@workspace/db";
import { notifications, pushSubscriptions, users, type InsertNotification } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { normalizeRole } from "@workspace/roles";
import { sendDirectMessage } from "./discord";

/**
 * Cuentas excluidas de web push (cuentas de prueba/revisión de tiendas).
 * Siguen recibiendo la notificación in-app; solo se omite el push al dispositivo.
 */
const PUSH_EXCLUDED_EMAILS = new Set(["reviewer@webmakerchile.com"]);

const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();
const VAPID_SUBJECT =
  (process.env.VAPID_SUBJECT || process.env.PUBLIC_BASE_URL || "mailto:admin@webmakerlatam.com").trim();

let vapidConfigured = false;

export function configureWebPush(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    return true;
  } catch (err: any) {
    console.error("[Notifications] Failed to configure VAPID:", err?.message || err);
    return false;
  }
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

export function isPushEnabled(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

export type NotificationType =
  | "publish_success"
  | "publish_partial"
  | "publish_error"
  | "schedule_reminder"
  /** Trabajo estancado, aparcado o atrasado. Ver `lib/recordatorios.ts`. */
  | "recordatorio"
  | "idea_done"
  | "connection_expiring"
  | "connection_expired"
  | "connection_revoked"
  | "system";

export type CreateNotificationInput = {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  push?: boolean;
};

/**
 * Create an in-app notification and (optionally) fan out a web push to all of
 * the user's registered subscriptions. Push delivery failures are logged but
 * never throw — the in-app notification is the source of truth.
 */
export async function createNotification(input: CreateNotificationInput) {
  const insert: InsertNotification = {
    userId: input.userId,
    type: input.type,
    title: input.title.slice(0, 200),
    body: input.body ? input.body.slice(0, 1000) : null,
    link: input.link || null,
  };
  const [row] = await db.insert(notifications).values(insert).returning();

  if (input.push !== false) {
    void sendPushToUser(input.userId, {
      title: row.title,
      body: row.body || "",
      link: row.link || "/",
      tag: `notif-${row.id}`,
    });
  }
  // DM de Discord (fire-and-forget): solo si la persona tiene cuenta vinculada
  // Y no lo desactivó. Un fallo aquí jamás afecta la notificación del panel.
  void sendDiscordDm(input.userId, row.title, row.body, row.link).catch((err) =>
    console.error("[Notifications] Discord DM failed:", err?.message || err),
  );
  return row;
}

/**
 * Avisa a la dirección: crea la notificación (panel + push + DM de Discord si
 * lo activó) para cada cuenta aprobada cuyo rol normalizado es CEO.
 * `excludeUserId` evita el auto-aviso cuando quien actúa es la propia dirección.
 * Devuelve cuántos avisos se crearon; un destinatario que falla no bloquea al resto.
 */
export async function notifyCeos(input: {
  title: string;
  body?: string | null;
  link?: string | null;
  type?: NotificationType;
  excludeUserId?: number;
}): Promise<number> {
  const team = await db
    .select({ id: users.id, role: users.role, teamRole: users.teamRole, approvalStatus: users.approvalStatus })
    .from(users);
  const ceos = team.filter(
    (u) =>
      u.approvalStatus === "approved" &&
      u.id !== input.excludeUserId &&
      normalizeRole(u.teamRole, u.role === "superadmin") === "ceo",
  );
  let sent = 0;
  for (const ceo of ceos) {
    try {
      await createNotification({
        userId: ceo.id,
        type: input.type ?? "system",
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      });
      sent++;
    } catch (err: any) {
      console.error("[Notifications] notifyCeos failed for user", ceo.id, err?.message || err);
    }
  }
  return sent;
}

/** Punto único de envío del DM. Exportado para tests. */
export async function sendDiscordDm(
  userId: number,
  title: string,
  body?: string | null,
  link?: string | null,
): Promise<boolean> {
  const [target] = await db
    .select({ discordUserId: users.discordUserId, notifyDiscord: users.notifyDiscord })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target?.discordUserId || !target.notifyDiscord) return false;

  const base = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const url = link ? (link.startsWith("http") ? link : base ? `${base}${link}` : null) : null;
  const content = [`🔔 **${title}**`, body || null, url].filter(Boolean).join("\n");
  return sendDirectMessage(target.discordUserId, content);
}

type PushPayload = { title: string; body: string; link?: string; tag?: string };

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!configureWebPush()) return;
  try {
    const [target] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (target?.email && PUSH_EXCLUDED_EMAILS.has(target.email.toLowerCase())) return;
  } catch (err: any) {
    console.error("[Push] exclusion lookup failed:", err?.message || err);
  }
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription is gone for good; clean up.
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          console.log(`[Push] Removed stale subscription #${sub.id} (status ${status})`);
        } else {
          console.error(`[Push] sendNotification failed for sub #${sub.id}:`, err?.message || err);
        }
      }
    }),
  );
}
