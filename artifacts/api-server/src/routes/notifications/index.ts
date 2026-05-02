import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { notifications, pushSubscriptions } from "@workspace/db/schema";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { createNotification, getVapidPublicKey, isPushEnabled } from "../../lib/notifications";

const router: IRouter = Router();

function getUserId(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return u?.id ?? null;
}

router.get("/notifications", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  res.json(rows);
});

router.get("/notifications/unread-count", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  res.json({ count: row?.value ?? 0 });
});

router.post("/notifications/:id/read", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "No encontrada" });
    return;
  }
  res.json(row);
});

router.post("/notifications/read-all", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  res.json({ ok: true });
});

router.delete("/notifications/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  res.status(204).end();
});

router.delete("/notifications", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  await db.delete(notifications).where(eq(notifications.userId, userId));
  res.json({ ok: true });
});

// Web Push: VAPID public key + subscribe / unsubscribe.

router.get("/notifications/vapid-public-key", (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  res.json({ publicKey: key, enabled: isPushEnabled() });
});

router.post("/notifications/subscribe", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (!isPushEnabled()) {
    res.status(503).json({ error: "Push no está configurado en el servidor" });
    return;
  }
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    res.status(400).json({ error: "Suscripción inválida" });
    return;
  }
  const userAgent = typeof req.body?.userAgent === "string" ? req.body.userAgent.slice(0, 200) : null;

  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, sub.endpoint))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(pushSubscriptions)
      .set({
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
        lastUsedAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }

  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent,
    })
    .returning();
  res.status(201).json(row);
});

router.post("/notifications/unsubscribe", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint) {
    res.status(400).json({ error: "Endpoint requerido" });
    return;
  }
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
  res.json({ ok: true });
});

// Test endpoint to send the user a sample notification (for verifying push works).
router.post("/notifications/test", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const row = await createNotification({
    userId,
    type: "system",
    title: "Notificación de prueba",
    body: "Si ves esto, las notificaciones funcionan correctamente.",
    link: "/",
  });
  res.json(row);
});

export default router;
