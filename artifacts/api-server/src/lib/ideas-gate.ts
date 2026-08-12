import { type Request, type Response, type NextFunction } from "express";
import { normalizeRole, type TeamRole } from "@workspace/roles";
import type { AreaCheckUser } from "./require-area";

/**
 * Quién entra al tablero de Ideas (Editora + Redes sociales, más los roles
 * de acceso total).
 *
 * Redes sociales y Marketing comparten la misma ÁREA ("marketing" en
 * @workspace/areas — ver ROLE_TO_AREA), así que un gate por área nunca
 * podría dejar entrar a Redes sin dejar entrar también a Marketing. Esta
 * sección es exclusiva de Editora y Redes sociales: Marketing NO debe entrar
 * solo por compartir área con Redes. Por eso el gate compara el ROL
 * normalizado directamente en vez de usar `requireArea`/`hasArea` — mismo
 * patrón que `community-gate.ts` usa para Historias.
 */
const IDEAS_ROLES: readonly TeamRole[] = ["ceo", "tester", "editora", "social"];

export function puedeVerIdeas(user: AreaCheckUser): boolean {
  const rol = normalizeRole(user?.teamRole, user?.role === "superadmin");
  return (IDEAS_ROLES as readonly string[]).includes(rol);
}

/** Mount AFTER requireAuth + requireApproved. */
export function requireIdeas(req: Request, res: Response, next: NextFunction): void {
  if (puedeVerIdeas(req.user as AreaCheckUser)) {
    next();
    return;
  }
  res.status(403).json({ error: "No tienes acceso a esta sección" });
}
