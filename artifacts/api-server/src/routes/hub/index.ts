import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubState } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

type AuthedUser = { id: number; email?: string; name?: string };
function getUser(req: Request): AuthedUser {
  return req.user as AuthedUser;
}

router.get("/hub", async (req: Request, res: Response) => {
  const user = getUser(req);
  const [row] = await db
    .select()
    .from(hubState)
    .where(eq(hubState.userId, user.id))
    .limit(1);
  res.json({ data: row?.data ?? null });
});

router.patch("/hub", async (req: Request, res: Response) => {
  const user = getUser(req);
  const { data } = req.body as { data: unknown };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: "Campo 'data' requerido (objeto)" });
    return;
  }

  const [row] = await db
    .insert(hubState)
    .values({ userId: user.id, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: hubState.userId,
      set: { data, updatedAt: new Date() },
    })
    .returning();

  res.json({ data: row!.data });
});

export default router;
