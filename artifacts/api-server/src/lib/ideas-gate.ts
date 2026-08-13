import { type Request, type Response, type NextFunction } from "express";
import { normalizeRole, type TeamRole } from "@workspace/roles";
import type { AreaCheckUser } from "./require-area";
import { routesInclude } from "@workspace/roles";
import { getAllEffectiveRoutes } from "./role-permissions";

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
  // Acceso a la seccion = uso: si en Ajustes le concedieron "/ideas" al rol,
  // el tablero tambien se abre (ver lib/require-area.ts, requireAreaOSeccion).
  void (async () => {
    try {
      const rol = (req.user as AreaCheckUser | undefined)?.teamRole;
      if (rol) {
        const mapa = await getAllEffectiveRoutes();
        const efectivas = (mapa as Record<string, readonly string[] | "*" | undefined>)[rol];
        if (efectivas && routesInclude(efectivas, "/ideas")) {
          next();
          return;
        }
      }
    } catch {
      // sin permisos legibles: cae al 403
    }
    res.status(403).json({ error: "No tienes acceso a esta sección" });
  })();
}
