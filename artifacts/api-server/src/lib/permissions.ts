import { type Request, type Response, type NextFunction } from "express";

export type TeamRole = "ceo" | "editora" | "programador" | "publicista" | "rrhh";

export const TEAM_ROLES: readonly TeamRole[] = [
  "ceo",
  "editora",
  "programador",
  "publicista",
  "rrhh",
] as const;

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  ceo: "CEO",
  editora: "Editora",
  programador: "Programador",
  publicista: "Publicista",
  rrhh: "RRHH",
};

/**
 * Express middleware factory that restricts access to users with one of the
 * given teamRoles. Superadmins (role === "superadmin") always bypass the check.
 * Mount AFTER requireAuth + requireApproved.
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
