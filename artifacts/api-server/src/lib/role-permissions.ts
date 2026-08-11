import { db } from "@workspace/db";
import { rolePermissions } from "@workspace/db/schema";
import {
  TEAM_ROLES,
  ROLES,
  SECTION_CATALOG,
  roleHome,
  type TeamRole,
} from "@workspace/roles";

const VALID_PATHS = new Set(SECTION_CATALOG.map((s) => s.path));

export type RoleRoutesMap = Record<TeamRole, string[] | "*">;

/**
 * Rutas efectivas de todos los roles: la fila de `role_permissions` si existe,
 * si no el default estático de `ROLES[role].routes`. CEO y tester siempre
 * `"*"` — nunca tienen fila y nunca se editan desde acá.
 *
 * Se calcula completo (todos los roles) porque el frontend lo usa tanto para
 * el propio rol del usuario como, vía "Ver como", para simular cualquier
 * otro — así el simulador siempre refleja la config vigente, no un default
 * viejo cacheado en el bundle.
 *
 * Dos garantías por encima del override guardado:
 * - Rutas estáticas del rol que NO están en el catálogo (ej. `/ajustes` para
 *   `dev`, deliberadamente fuera de SECTION_CATALOG por no ser togglable)
 *   sobreviven siempre, se haya guardado una fila o no. Si no se hiciera esto,
 *   el primer guardado de permisos de `dev` dejaría a `dev` sin cómo volver a
 *   la única pantalla donde se administra esto.
 * - Si la lectura a la base falla (tabla no migrada, DB caída, mock de test
 *   incompleto), se degrada a los defaults estáticos para todos los roles en
 *   vez de tumbar `/auth/me` — este endpoint es el bootstrap de sesión de
 *   toda la app, nunca debe depender de que una tabla secundaria responda.
 */
export async function getAllEffectiveRoutes(): Promise<RoleRoutesMap> {
  let overrides = new Map<string, string[]>();
  try {
    const rows = await db.select().from(rolePermissions);
    overrides = new Map(rows.map((r) => [r.role, r.routes as string[]]));
  } catch (err) {
    console.error("[role-permissions] No se pudo leer overrides, se usan defaults estáticos:", err);
  }

  const result = {} as RoleRoutesMap;
  for (const role of TEAM_ROLES) {
    if (role === "ceo" || role === "tester") {
      result[role] = "*";
      continue;
    }
    const staticRoutes = ROLES[role].routes;
    const mandatoryExtras = staticRoutes.filter((r) => !VALID_PATHS.has(r));
    const base = overrides.get(role) ?? staticRoutes;
    result[role] = Array.from(new Set([...base, ...mandatoryExtras]));
  }
  return result;
}

/**
 * Guarda el override de un rol editable. Filtra cualquier ruta que no esté
 * en el catálogo (typos, rutas viejas) y siempre garantiza que la ruta de
 * inicio del rol quede incluida — así nunca se puede guardar una config que
 * deje a ese rol sin dónde aterrizar al entrar.
 */
export async function saveRolePermissions(
  role: TeamRole,
  routes: string[],
  updatedBy: string | null
): Promise<string[]> {
  const home = roleHome(role);
  const clean = Array.from(new Set(routes.filter((r) => VALID_PATHS.has(r))));
  if (!clean.includes(home)) clean.push(home);

  await db
    .insert(rolePermissions)
    .values({ role, routes: clean, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: rolePermissions.role,
      set: { routes: clean, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });

  return clean;
}
