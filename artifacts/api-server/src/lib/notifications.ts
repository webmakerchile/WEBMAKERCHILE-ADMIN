import webpush from "web-push";
import { db } from "@workspace/db";
import { notifications, pushSubscriptions, type InsertNotification } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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
  return row;
}

type PushPayload = { title: string; body: string; link?: string; tag?: string };

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!configureWebPush()) return;
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
