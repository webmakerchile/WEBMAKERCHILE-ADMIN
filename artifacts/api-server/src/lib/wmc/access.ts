import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { normalizeRole, type TeamRole } from "@workspace/roles";

/**
 * Roles con acceso a las secciones wmc (webmakerlatam.com live passthrough).
 * Los tres ven exactamente lo mismo -- sin redacción de precios/márgenes/
 * comisiones por rol. Reemplaza la lista blanca por email (WMC_ALLOWED_EMAILS).
 */
export const WMC_ALLOWED_ROLES: readonly TeamRole[] = ["dev", "ventas", "ceo"];

export function hasWmcAccess(role: TeamRole): boolean {
  return WMC_ALLOWED_ROLES.includes(role);
}

/**
 * Mount AFTER requireAuth + requireApproved. Responde 403 SIN reenviar al
 * origen cuando el rol no está permitido -- la service key nunca debe
 * gastarse en nombre de alguien que no debería llegar al origen.
 *
 * El rol se lee SIEMPRE de la base, nunca de la sesión (mismo patrón que
 * /panel): un cambio de rol pega al siguiente request, no hay que
 * re-loguearse.
 */
export async function requireWmcAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) {
    res.status(403).json({ error: "No tienes acceso a esta sección" });
    return;
  }
  try {
    const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
    const esSuper = me?.role === "superadmin";
    const rol = normalizeRole(me?.teamRole, esSuper);
    if (hasWmcAccess(rol)) {
      next();
      return;
    }
    res.status(403).json({ error: "No tienes acceso a esta sección" });
  } catch (err) {
    next(err);
  }
}
