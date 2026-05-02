import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getConnectionsHealth, notifyExpiringConnections } from "../../lib/connections";

const router: IRouter = Router();

router.get("/connections/health", async (req: Request, res: Response) => {
  const reqUser = req.user as { id?: number } | undefined;
  if (!reqUser?.id) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, reqUser.id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const health = await getConnectionsHealth(user);
  // Fire (debounced) notifications for any expiring/expired connection.
  void notifyExpiringConnections(user.id, health);
  res.json({ connections: health });
});

export default router;
