import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { normalizeRole, routesInclude, canRoleSeeWmcSections, type TeamRole } from "@workspace/roles";
import { getAllEffectiveRoutes } from "../role-permissions";

/**
 * Lista fija histórica de acceso a wmc. Ya NO gatea las pantallas
 * `/admin/proposals` / `/admin/projects` (ver `requireWmcAccess` más abajo,
 * que ahora sigue Permisos por rol) -- esto sigue vivo únicamente para el
 * modo "acotado" propio de Agencia (`puedeProyectos` en routes/panel/index.ts),
 * que es una decisión de producto aparte y no debe moverse con Permisos.
 */
export const WMC_ALLOWED_ROLES: readonly TeamRole[] = ["dev", "ventas", "ceo"];

export function hasWmcAccess(role: TeamRole): boolean {
  return WMC_ALLOWED_ROLES.includes(role);
}

const PROPOSALS_PATH = "/admin/proposals";
const PROJECTS_PATH = "/admin/projects";

/**
 * Primer segmento de la URL bajo /api/wmc/ → a qué pantalla pertenece.
 * Clasificado a mano según qué página del frontend llama a cada prefijo HOY
 * (artifacts/admin-panel/src/pages/wmc/*.tsx) -- no por el nombre del
 * recurso en el origen, que no conocemos. `clients` es la única data
 * genuinamente compartida por las dos pantallas (nombre/contacto/RUT de
 * cliente; ninguna cifra de una propuesta o proyecto puntual).
 *
 * Ojo con `projects` (bare, listado completo): `proposal-details.tsx`
 * también lo pide para mostrar el proyecto vinculado a una propuesta ganada,
 * pero es el LISTADO COMPLETO de proyectos -- exactamente el dato que
 * "Proyectos (WMC)" existe para proteger. Se clasifica como projects-only a
 * propósito: un rol con SOLO el permiso de propuestas pierde ese widget de
 * "proyecto vinculado" (se oculta solo, `allProjects` queda `undefined` vía
 * react-query en error, no revienta la página), en vez de heredar acceso de
 * lectura al proyecto completo de cualquier cliente.
 */
const PROPOSALS_ONLY_PREFIXES = new Set([
  "proposals",
  "proposal-items",
  "coupons",
  "agreement-templates",
  "service-agreements",
  "services",
  "settings",
]);

const PROJECTS_ONLY_PREFIXES = new Set([
  "projects",
  "project-logs",
  "developers",
  "addons",
  "payments",
  "uploads",
]);

const SHARED_PREFIXES = new Set(["clients"]);

/**
 * ¿La ruta efectiva de este rol alcanza para el sub-path pedido?
 * - Prefijo de una sola pantalla → exige ESA casilla puntual.
 * - Prefijo compartido → alcanza con CUALQUIERA de las dos.
 * - Prefijo que no reconocemos (el origen agregó algo nuevo, todavía sin
 *   clasificar acá) → exige LAS DOS, el mismo nivel de acceso que
 *   dev/ventas/ceo ya tienen por default. Nunca al revés: lo desconocido
 *   jamás debe ser MÁS permisivo que lo clasificado.
 */
function isSubPathAllowed(subPath: string, routes: string[] | "*"): boolean {
  const prefix = subPath.split("/")[0] || "";
  const hasProposals = routesInclude(routes, PROPOSALS_PATH);
  const hasProjects = routesInclude(routes, PROJECTS_PATH);
  if (PROPOSALS_ONLY_PREFIXES.has(prefix)) return hasProposals;
  if (PROJECTS_ONLY_PREFIXES.has(prefix)) return hasProjects;
  if (SHARED_PREFIXES.has(prefix)) return hasProposals || hasProjects;
  return hasProposals && hasProjects;
}

/**
 * Mount AFTER requireAuth + requireApproved. Responde 403 SIN reenviar al
 * origen cuando el rol no está permitido -- la service key nunca debe
 * gastarse en nombre de alguien que no debería llegar al origen.
 *
 * El rol se lee SIEMPRE de la base, nunca de la sesión (mismo patrón que
 * /panel): un cambio de rol pega al siguiente request, no hay que
 * re-loguearse.
 *
 * El acceso sale de Permisos por rol (`role_permissions`, vía
 * `getAllEffectiveRoutes`), no de una lista fija -- pero por pantalla: tener
 * SOLO `/admin/proposals` no alcanza para pedir sub-paths de `/admin/projects`
 * y viceversa (ver `isSubPathAllowed`). El frontend (`WmcRouteShell`) ya
 * elegía qué pantalla mostrar por rol; esto hace que el proxy respete la
 * misma frontera en vez de confiar solo en que la UI no ofrezca el link.
 *
 * `canRoleSeeWmcSections` corta aparte a "tester": esa cuenta tiene `"*"` en
 * todo lo demás pero wmc expone datos reales de un negocio externo, así que
 * el wildcard no debe alcanzarle acá (ver el doc del helper en @workspace/roles).
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
    const effectiveRoutes = await getAllEffectiveRoutes();
    const routes = effectiveRoutes[rol];
    const subPath = (req.path || "").replace(/^\/+/, "");
    const allowed = canRoleSeeWmcSections(rol) && isSubPathAllowed(subPath, routes);
    if (allowed) {
      next();
      return;
    }
    res.status(403).json({ error: "No tienes acceso a esta sección" });
  } catch (err) {
    next(err);
  }
}
