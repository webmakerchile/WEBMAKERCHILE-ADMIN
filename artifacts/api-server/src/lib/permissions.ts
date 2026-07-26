import { type Request, type Response, type NextFunction } from "express";
import { type Area, AREAS } from "@workspace/areas";

/** @deprecated Use Area from @workspace/areas instead. Kept for backward compatibility. */
export type TeamRole = Area;

/** @deprecated Use AREAS from @workspace/areas instead. */
export const TEAM_ROLES: readonly TeamRole[] = AREAS;

/** @deprecated Use AREA_LABELS from @workspace/areas instead. */
export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  ceo:       "CEO",
  ejecutivo: "Ejecutivo",
  edicion:   "Edición",
  marketing: "Marketing",
  rrhh:      "RRHH",
};

/**
 * Express middleware factory that restricts access to users with one of the
 * given teamRoles/areas. Superadmins (role === "superadmin") always bypass.
 * Mount AFTER requireAuth + requireApproved.
 * @deprecated Prefer requireArea from ./require-area for new routes.
 */
export function requireRole(...roles: TeamRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as { role?: string; teamRole?: string } | undefined;
    if (user?.role === "superadmin") { next(); return; }
    if (user?.teamRole && (roles as string[]).includes(user.teamRole)) {
      next();
      return;
    }
    res.status(403).json({ error: "No tienes permiso para acceder a esta sección" });
  };
}
