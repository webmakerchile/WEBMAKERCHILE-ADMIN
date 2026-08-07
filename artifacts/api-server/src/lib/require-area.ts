import { type Request, type Response, type NextFunction } from "express";
import { type Area, areaOfRole } from "@workspace/areas";

export type AreaCheckUser = { role?: string; teamRole?: string } | undefined;

/**
 * True if the user's area (teamRole) is one of the given allowed areas.
 * - Superadmins (role === "superadmin") always pass.
 * - CEO area always has full access.
 *
 * Same rule as `requireArea`, exposed as a plain predicate for handlers that
 * need to scope an individual ROW (e.g. a shared endpoint that serves rows
 * from more than one product) instead of gating an entire route.
 */
export function hasArea(user: AreaCheckUser, ...areas: Area[]): boolean {
  if (user?.role === "superadmin") return true;
  if (user?.teamRole === "ceo") return true;
  // El rol se traduce a su área: ambos vocabularios conviven en el sistema.
  // Un rol desconocido devuelve null y se deniega — nunca se asume acceso.
  const area = areaOfRole(user?.teamRole);
  return area === "ceo" || (area !== null && (areas as string[]).includes(area));
}

/**
 * Middleware factory that restricts access to users whose area (teamRole)
 * is one of the given allowed areas.
 * Mount AFTER requireAuth + requireApproved.
 */
export function requireArea(...areas: Area[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (hasArea(req.user as AreaCheckUser, ...areas)) {
      next();
      return;
    }
    res.status(403).json({ error: "No tienes acceso a esta sección" });
  };
}
