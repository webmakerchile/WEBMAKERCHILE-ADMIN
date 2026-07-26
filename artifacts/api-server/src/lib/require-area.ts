import { type Request, type Response, type NextFunction } from "express";
import { type Area, areaOfRole } from "@workspace/areas";

/**
 * Middleware factory that restricts access to users whose area (teamRole)
 * is one of the given allowed areas.
 * - Superadmins (role === "superadmin") always bypass.
 * - CEO area always has full access.
 * Mount AFTER requireAuth + requireApproved.
 */
export function requireArea(...areas: Area[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as { role?: string; teamRole?: string } | undefined;
    if (user?.role === "superadmin") { next(); return; }
    if (user?.teamRole === "ceo") { next(); return; }
    // El rol se traduce a su área: ambos vocabularios conviven en el sistema.
    // Un rol desconocido devuelve null y se deniega — nunca se asume acceso.
    const area = areaOfRole(user?.teamRole);
    if (area === "ceo" || (area !== null && (areas as string[]).includes(area))) {
      next();
      return;
    }
    res.status(403).json({ error: "No tienes acceso a esta sección" });
  };
}
