/**
 * Roles del equipo — fuente única de verdad compartida por el API y el panel.
 *
 * El rol vive en `users.team_role` (texto libre en la DB). Aquí se define qué
 * significa cada rol: qué rutas ve, dónde aterriza al entrar y qué puede hacer.
 *
 * Reglas de oro:
 *  - El rol NUNCA es la única defensa: el backend valida permisos por endpoint.
 *    Lo de aquí decide navegación y accesos de UI.
 *  - Un usuario con `role === "superadmin"` (primer email de ALLOWED_ADMIN_EMAILS)
 *    siempre es CEO, pase lo que pase con team_role. Evita quedar fuera del panel.
 */

export const TEAM_ROLES = [
  "ceo",
  "editora",
  "social",
  "ventas",
  "dev",
  "marketing",
  "contador",
  "rrhh",
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export interface RoleDef {
  id: TeamRole;
  /** Nombre visible del rol. */
  label: string;
  /** Qué hace esta persona, para la pantalla de Equipo. */
  description: string;
  /** Ruta a la que aterriza al entrar al panel. */
  home: string;
  /**
   * Rutas permitidas. `"*"` = todas. Las rutas anidadas heredan del prefijo
   * (`/campanas` habilita `/campanas/:id`).
   */
  routes: readonly string[];
  /** Puede cambiar los roles del equipo. */
  canManageTeam: boolean;
  /** Puede ver y editar las fichas laborales y aprobar accesos (RRHH). */
  canManagePeople: boolean;
  /** Puede aprobar contenido que está en revisión. */
  canReview: boolean;
  /** Colecciones del Hub Ejecutivo que puede leer (ver `/api/hub/owner`). */
  hubScopes: readonly HubScope[];
}

/** Colecciones del blob del Hub Ejecutivo. */
export type HubScope = "projects" | "tasks" | "clients" | "meetings" | "notes" | "contracts";

const ALL_HUB_SCOPES: readonly HubScope[] = ["projects", "tasks", "clients", "meetings", "notes", "contracts"];

/** Rutas que cualquier persona autenticada puede ver. */
export const COMMON_ROUTES = ["/ayuda", "/ajustes"] as const;

export const ROLES: Record<TeamRole, RoleDef> = {
  ceo: {
    id: "ceo",
    label: "CEO / Dirección",
    description: "Acceso completo: Hub Ejecutivo, contenido, reportes y gestión del equipo.",
    home: "/",
    routes: ["*"],
    canManageTeam: true,
    canManagePeople: true,
    canReview: true,
    hubScopes: ALL_HUB_SCOPES,
  },
  editora: {
    id: "editora",
    label: "Editora de video",
    description: "Edición y producción: videos, estudio de grabación, portadas y transcripciones.",
    home: "/videos",
    routes: ["/videos", "/estudio", "/cover", "/transcriptor", "/drive", "/biblioteca", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canReview: false,
    hubScopes: [],
  },
  social: {
    id: "social",
    label: "Redes sociales",
    description: "Calendario de publicaciones, cuentas conectadas, historias y descripciones.",
    home: "/",
    routes: ["/", "/schedule", "/cuentas", "/videos", "/historias", "/descripciones", "/insights", "/biblioteca", "/campanas", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canReview: false,
    hubScopes: [],
  },
  ventas: {
    id: "ventas",
    label: "Ejecutivo de ventas",
    description: "Cartera de clientes, reuniones y contratos con sus cotizaciones.",
    home: "/ventas",
    routes: ["/ventas", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canReview: false,
    hubScopes: ["contracts", "clients", "meetings"],
  },
  dev: {
    id: "dev",
    label: "Programador",
    description: "Proyectos asignados y tablero de tareas por etapa.",
    home: "/mis-tareas",
    routes: ["/mis-tareas", "/drive", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canReview: false,
    hubScopes: ["projects", "tasks"],
  },
  marketing: {
    id: "marketing",
    label: "Marketing",
    description: "Métricas, campañas, biblioteca de contenido y aprobación de publicaciones.",
    home: "/insights",
    routes: ["/", "/insights", "/schedule", "/biblioteca", "/campanas", "/videos", "/historias", "/descripciones", "/cuentas", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canReview: true,
    hubScopes: [],
  },
  rrhh: {
    id: "rrhh",
    label: "Recursos Humanos",
    description: "Fichas laborales del equipo, contratos, ingresos y solicitudes de acceso.",
    home: "/rrhh",
    routes: ["/rrhh", "/equipo", ...COMMON_ROUTES],
    canManageTeam: true,
    canManagePeople: true,
    canReview: false,
    hubScopes: [],
  },
  contador: {
    id: "contador",
    label: "Contador",
    description: "Reporte financiero: contratos facturados, IVA, vencimientos y cobros.",
    home: "/reportes",
    routes: ["/reportes", "/ayuda"],
    canManageTeam: false,
    canManagePeople: false,
    canReview: false,
    hubScopes: ["contracts"],
  },
};

/**
 * Roles antiguos → roles nuevos. `reviewer` era quien aprobaba contenido y
 * asignaba roles (o sea, la dirección); `editor` era el rol por defecto.
 */
const LEGACY_ALIASES: Record<string, TeamRole> = {
  reviewer: "ceo",
  editor: "editora",
};

export const DEFAULT_ROLE: TeamRole = "editora";

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

/**
 * Normaliza lo que venga de la DB a un rol válido.
 * `isSuperAdmin` fuerza CEO: es la salvaguarda contra dejarte fuera del panel.
 */
export function normalizeRole(raw: unknown, isSuperAdmin = false): TeamRole {
  if (isSuperAdmin) return "ceo";
  if (isTeamRole(raw)) return raw;
  if (typeof raw === "string" && LEGACY_ALIASES[raw]) return LEGACY_ALIASES[raw];
  return DEFAULT_ROLE;
}

export function roleDef(role: unknown, isSuperAdmin = false): RoleDef {
  return ROLES[normalizeRole(role, isSuperAdmin)];
}

export function roleHome(role: unknown, isSuperAdmin = false): string {
  return roleDef(role, isSuperAdmin).home;
}

export function canManageTeam(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canManageTeam;
}

export function canManagePeople(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canManagePeople;
}

export function canReview(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canReview;
}

export function hubScopesFor(role: unknown, isSuperAdmin = false): readonly HubScope[] {
  return roleDef(role, isSuperAdmin).hubScopes;
}

/**
 * ¿Puede este rol entrar a esta ruta? Compara por prefijo de segmento, así
 * `/campanas/12` hereda el permiso de `/campanas` sin que `/videos-x` cuele
 * por `/videos`.
 */
export function canAccessRoute(role: unknown, path: string, isSuperAdmin = false): boolean {
  const def = roleDef(role, isSuperAdmin);
  if (def.routes.includes("*")) return true;
  const clean = normalizePath(path);
  return def.routes.some(allowed => {
    const a = normalizePath(allowed);
    if (a === "/") return clean === "/";
    return clean === a || clean.startsWith(`${a}/`);
  });
}

function normalizePath(path: string): string {
  const p = (path || "/").split("?")[0].split("#")[0];
  if (p === "/") return "/";
  return p.replace(/\/+$/, "") || "/";
}
