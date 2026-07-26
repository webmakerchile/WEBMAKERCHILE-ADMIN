import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq, desc, ne } from "drizzle-orm";
import { AREAS, type Area } from "@workspace/areas";

const router: IRouter = Router();

function isSuperAdmin(req: Request): boolean {
  const user = req.user as any;
  return user?.role === "superadmin";
}

function isCeoOrSuperAdmin(req: Request): boolean {
  const user = req.user as any;
  return user?.role === "superadmin" || user?.teamRole === "ceo";
}

router.get("/admin/users", async (req: Request, res: Response) => {
  if (!isCeoOrSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el CEO o super-admin puede gestionar usuarios" });
    return;
  }
  const me = req.user as any;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      picture: users.picture,
      role: users.role,
      teamRole: users.teamRole,
      approvalStatus: users.approvalStatus,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(ne(users.id, me.id))
    .orderBy(desc(users.createdAt));
  res.json(rows);
});

router.patch("/admin/users/:id/approval", async (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el super-admin puede aprobar o rechazar usuarios" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const me = req.user as any;
  if (id === me.id) { res.status(400).json({ error: "No puedes cambiar el estado de aprobación de tu propia cuenta" }); return; }

  const body = req.body as { status?: unknown };
  const status = typeof body.status === "string" ? body.status : "";
  if (!["approved", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Estado inválido. Use: approved, rejected, pending" });
    return;
  }

  const [updated] = await db
    .update(users)
    .set({ approvalStatus: status! })
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, approvalStatus: users.approvalStatus });

  if (!updated) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  res.json(updated);
});

/**
 * PATCH /admin/users/:id/team-role
 * Assigns an area to a user. Only CEO or superadmin can call this.
 * Valid values: ceo | ejecutivo | edicion | marketing
 */
router.patch("/admin/users/:id/team-role", async (req: Request, res: Response) => {
  if (!isCeoOrSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el CEO o super-admin puede asignar áreas" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const me = req.user as any;
  if (id === me.id) { res.status(400).json({ error: "No puedes cambiar tu propia área" }); return; }

  const body = req.body as { teamRole?: unknown };
  const teamRole = typeof body.teamRole === "string" ? body.teamRole : "";
  if (!(AREAS as readonly string[]).includes(teamRole)) {
    res.status(400).json({ error: `Área inválida. Use: ${AREAS.join(", ")}` });
    return;
  }

  const [updated] = await db
    .update(users)
    .set({ teamRole: teamRole as Area })
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, teamRole: users.teamRole });

  if (!updated) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  res.json(updated);
});

router.delete("/admin/users/:id", async (req: Request, res: Response) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Solo el super-admin puede eliminar usuarios" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  const me = req.user as any;
  if (id === me.id) { res.status(400).json({ error: "No puedes eliminar tu propia cuenta" }); return; }

  await db.delete(users).where(eq(users.id, id));
  res.json({ success: true });
});

export default router;
