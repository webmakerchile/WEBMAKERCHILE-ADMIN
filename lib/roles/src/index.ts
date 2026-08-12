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
  "tester",
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
  /** Puede poner metas diarias, semanales o mensuales a otras personas. */
  canAssignGoals: boolean;
  /** Puede aprobar contenido que está en revisión. */
  canReview: boolean;
  /**
   * Puede ver montos: valores de contratos, precios por módulo, forma de pago y
   * el PDF comercial. Quien no lo tenga recibe los contratos ya censurados en el
   * servidor — nunca se le envía el dato y luego se oculta en pantalla.
   */
  canSeeMoney: boolean;
  /** Puede gestionar el catálogo de servicios y la torre de ventas/cobros del Hub Ejecutivo. */
  canManageSales: boolean;
  /** Puede ver la asistencia del equipo (pase de lista) dentro del Hub Ejecutivo. */
  canSeeAttendance: boolean;
  /** Colecciones del tablero (Hub) que puede leer. */
  hubScopes: readonly HubScope[];
  /**
   * Colecciones del tablero que puede modificar. Siempre subconjunto de
   * `hubScopes`: el servidor ignora los cambios que lleguen fuera de esta lista.
   */
  hubWrite: readonly HubScope[];
  /** Áreas de las que este rol es responsable: recibe los tickets dirigidos a ellas. */
  ticketAreas: readonly TicketArea[];
}

/** Colecciones del blob del Hub Ejecutivo. */
export type HubScope = "projects" | "tasks" | "clients" | "meetings" | "notes" | "contracts";

export const ALL_HUB_SCOPES: readonly HubScope[] = ["projects", "tasks", "clients", "meetings", "notes", "contracts"];

/**
 * Áreas a las que se puede dirigir un ticket. Son las "bandejas de entrada"
 * del equipo: quien pide no necesita saber el nombre de la persona.
 */
export const TICKET_AREAS = ["direccion", "ventas", "desarrollo", "contenido", "redes", "marketing", "rrhh", "finanzas"] as const;
export type TicketArea = (typeof TICKET_AREAS)[number];

export const TICKET_AREA_LABELS: Record<TicketArea, string> = {
  direccion: "Dirección",
  ventas: "Ventas",
  desarrollo: "Desarrollo",
  contenido: "Contenido / Video",
  redes: "Redes sociales",
  marketing: "Marketing",
  rrhh: "Recursos Humanos",
  finanzas: "Finanzas",
};

/** Rutas que cualquier persona autenticada puede ver. */
/** Rutas que cualquier persona autenticada puede ver (los tickets son el canal común del equipo). */
/**
 * Rutas de todo el equipo: su jornada, sus tickets y la ayuda.
 * `/ajustes` NO está aquí a propósito: guarda credenciales de API y gestión de
 * usuarios, así que es de dirección.
 */
export const COMMON_ROUTES = ["/mi-dia", "/mis-pendientes", "/metas", "/tickets", "/ayuda"] as const;

export const ROLES: Record<TeamRole, RoleDef> = {
  ceo: {
    id: "ceo",
    label: "CEO / Dirección",
    description: "Acceso completo: Hub Ejecutivo, contenido, reportes y gestión del equipo.",
    home: "/",
    routes: ["*"],
    canManageTeam: true,
    canManagePeople: true,
    canAssignGoals: true,
    canReview: true,
    canSeeMoney: true,
    canManageSales: true,
    canSeeAttendance: true,
    hubScopes: ALL_HUB_SCOPES,
    hubWrite: ALL_HUB_SCOPES,
    ticketAreas: ["direccion"],
  },
  editora: {
    id: "editora",
    label: "Editora de video",
    description: "Edición y producción: videos, estudio de grabación, portadas y transcripciones.",
    home: "/edicion",
    routes: ["/edicion", "/videos", "/estudio", "/cover", "/descripciones", "/transcriptor", "/drive", "/biblioteca", "/mis-tareas", "/ideas", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canAssignGoals: false,
    canReview: false,
    canSeeMoney: false,
    canManageSales: false,
    canSeeAttendance: false,
    hubScopes: [],
    hubWrite: [],
    ticketAreas: ["contenido"],
  },
  social: {
    id: "social",
    label: "Redes sociales",
    description: "Calendario de publicaciones, cuentas conectadas, historias y descripciones.",
    home: "/redes",
    routes: ["/redes", "/", "/schedule", "/cuentas", "/videos", "/historias", "/descripciones", "/cover", "/insights", "/biblioteca", "/campanas", "/mis-tareas", "/ideas", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canAssignGoals: false,
    canReview: false,
    canSeeMoney: false,
    canManageSales: false,
    canSeeAttendance: false,
    hubScopes: [],
    hubWrite: [],
    ticketAreas: ["redes"],
  },
  ventas: {
    id: "ventas",
    label: "Ejecutivo de ventas",
    description: "Hub Ejecutivo: cartera, reuniones y contratos con sus cotizaciones.",
    home: "/dashboard-ejecutivo",
    routes: [
      "/dashboard-ejecutivo",
      "/proyectos",
      "/clientes",
      "/reuniones",
      "/contratos",
      "/ventas",
      "/cobros",
      "/servicios",
      "/equipo-hoy",
      "/asistencia",
      "/drive-hub",
      "/proyecciones",
      "/agencia",
      "/admin/proposals",
      "/admin/projects",
      ...COMMON_ROUTES,
    ],
    canManageTeam: false,
    canManagePeople: false,
    canAssignGoals: true,
    canReview: false,
    canSeeMoney: true,
    canManageSales: true,
    canSeeAttendance: true,
    hubScopes: ["contracts", "clients", "meetings", "projects", "tasks"],
    hubWrite: ["contracts", "clients", "meetings", "projects", "tasks"],
    ticketAreas: ["ventas"],
  },
  dev: {
    id: "dev",
    label: "Programador",
    description: "Proyectos asignados y tablero de tareas por etapa.",
    home: "/mis-tareas",
    routes: [
      "/mis-tareas",
      "/dashboard-ejecutivo",
      "/proyectos",
      "/notas",
      "/contratos",
      "/equipo-hoy",
      "/drive-hub",
      "/drive",
      "/agencia",
      "/admin/proposals",
      "/admin/projects",
      // Necesita entrar a Ajustes para la tarjeta de Permisos por rol (no ve
      // la sección de credenciales de redes: esa sigue siendo solo dirección).
      "/ajustes",
      ...COMMON_ROUTES,
    ],
    canManageTeam: false,
    canManagePeople: false,
    canAssignGoals: false,
    canReview: false,
    canSeeMoney: false,
    canManageSales: false,
    canSeeAttendance: false,
    hubScopes: ["projects", "tasks", "notes", "contracts"],
    hubWrite: ["projects", "tasks"],
    ticketAreas: ["desarrollo"],
  },
  marketing: {
    id: "marketing",
    label: "Marketing",
    description: "Métricas, campañas, biblioteca de contenido y aprobación de publicaciones.",
    home: "/marketing",
    routes: ["/marketing", "/", "/insights", "/schedule", "/biblioteca", "/campanas", "/videos", "/historias", "/descripciones", "/cuentas", "/mis-tareas", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canAssignGoals: false,
    canReview: true,
    canSeeMoney: false,
    canManageSales: false,
    canSeeAttendance: false,
    hubScopes: ["projects", "tasks", "clients", "contracts"],
    hubWrite: ["tasks"],
    ticketAreas: ["marketing"],
  },
  rrhh: {
    id: "rrhh",
    label: "Recursos Humanos",
    description: "Fichas laborales del equipo, contratos, ingresos y solicitudes de acceso.",
    home: "/rrhh",
    // RRHH necesita entrar a estas páginas del Hub para la de Asistencia
    // (pase de lista del equipo) — ver canSeeAttendance.
    routes: [
      "/rrhh",
      "/equipo",
      "/dashboard-ejecutivo",
      "/equipo-hoy",
      "/drive-hub",
      "/asistencia",
      "/mis-tareas",
      "/proyecciones",
      ...COMMON_ROUTES,
    ],
    canManageTeam: true,
    canManagePeople: true,
    canAssignGoals: true,
    canReview: false,
    canSeeMoney: false,
    canManageSales: false,
    canSeeAttendance: true,
    hubScopes: [],
    hubWrite: [],
    ticketAreas: ["rrhh"],
  },
  contador: {
    id: "contador",
    label: "Contador",
    description: "Reporte financiero: contratos facturados, IVA, vencimientos y cobros.",
    home: "/reportes",
    routes: ["/reportes", "/agencia", ...COMMON_ROUTES],
    canManageTeam: false,
    canManagePeople: false,
    canAssignGoals: false,
    canReview: false,
    canSeeMoney: true,
    canManageSales: false,
    canSeeAttendance: false,
    hubScopes: ["contracts"],
    hubWrite: [],
    ticketAreas: ["finanzas"],
  },
  tester: {
    id: "tester",
    label: "Tester TikTok",
    description: "Cuenta de revisión: acceso completo de solo recorrido para verificar la app (TikTok review).",
    home: "/",
    routes: ["*"],
    canManageTeam: true,
    canManagePeople: true,
    canAssignGoals: true,
    canReview: true,
    canSeeMoney: true,
    canManageSales: true,
    canSeeAttendance: true,
    hubScopes: ALL_HUB_SCOPES,
    hubWrite: ALL_HUB_SCOPES,
    ticketAreas: ["direccion"],
  },
};

/**
 * Roles antiguos → roles nuevos. `reviewer` era quien aprobaba contenido y
 * asignaba roles (o sea, la dirección); `editor` era el rol por defecto.
 */
const LEGACY_ALIASES: Record<string, TeamRole> = {
  reviewer: "ceo",
  editor: "editora",
  // Vocabulario de "áreas" que convivió con los roles: cualquier valor viejo
  // guardado en users.team_role se resuelve al rol equivalente, para que
  // Equipo, Ajustes y el Hub muestren siempre lo mismo.
  ejecutivo: "ventas",
  edicion: "editora",
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

/** ¿Puede este rol poner metas a otras personas? */
export function canAssignGoals(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canAssignGoals;
}

export function canReview(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canReview;
}

/** ¿Este rol puede ver montos (valores, precios por módulo, PDF comercial)? */
export function canSeeMoney(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canSeeMoney;
}

/** ¿Puede este rol gestionar el catálogo de servicios y la torre de ventas/cobros del Hub? */
export function canManageSales(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canManageSales;
}

/** ¿Puede este rol ver la asistencia del equipo (pase de lista) en el Hub Ejecutivo? */
export function canSeeAttendance(role: unknown, isSuperAdmin = false): boolean {
  return roleDef(role, isSuperAdmin).canSeeAttendance;
}

export function hubScopesFor(role: unknown, isSuperAdmin = false): readonly HubScope[] {
  return roleDef(role, isSuperAdmin).hubScopes;
}

/** Colecciones del tablero que este rol puede modificar. */
export function hubWriteScopesFor(role: unknown, isSuperAdmin = false): readonly HubScope[] {
  return roleDef(role, isSuperAdmin).hubWrite;
}

/** Áreas cuyos tickets aterrizan en la bandeja de este rol. */
export function ticketAreasFor(role: unknown, isSuperAdmin = false): readonly TicketArea[] {
  return roleDef(role, isSuperAdmin).ticketAreas;
}

export function isTicketArea(value: unknown): value is TicketArea {
  return typeof value === "string" && (TICKET_AREAS as readonly string[]).includes(value);
}

/**
 * ¿Esta lista de rutas cubre este path? Compara por prefijo de segmento, así
 * `/campanas/12` hereda el permiso de `/campanas` sin que `/videos-x` cuele
 * por `/videos`. `"*"` (como valor único o dentro de la lista) = todo.
 *
 * Extraído de `canAccessRoute` para poder aplicarlo también a listas de rutas
 * dinámicas (overrides guardados en DB por la pantalla de Permisos), sin
 * pasar por `ROLES`/`roleDef`.
 */
export function routesInclude(routes: readonly string[] | "*", path: string): boolean {
  if (routes === "*" || routes.includes("*")) return true;
  const clean = normalizePath(path);
  return routes.some(allowed => {
    const a = normalizePath(allowed);
    if (a === "/") return clean === "/";
    return clean === a || clean.startsWith(`${a}/`);
  });
}

/**
 * ¿Puede este rol entrar a esta ruta? Compara por prefijo de segmento, así
 * `/campanas/12` hereda el permiso de `/campanas` sin que `/videos-x` cuele
 * por `/videos`.
 */
export function canAccessRoute(role: unknown, path: string, isSuperAdmin = false): boolean {
  return routesInclude(roleDef(role, isSuperAdmin).routes, path);
}

/**
 * ¿Puede este rol ver las pantallas wmc (Presupuestos/Proyectos portadas de
 * webmakerlatam.com), aunque Permisos le habilite la ruta? Único caso
 * especial: "tester" es la cuenta de revisión de TikTok, con `"*"` en todo
 * lo demás, pero wmc expone datos reales de clientes y plata de un negocio
 * externo que un reviewer nunca debe ver — el mismo motivo por el que ya
 * queda afuera de `CONFIGURABLE_ROLES` (no es un puesto real del equipo).
 * Vive acá (no como excepción dentro de `routesInclude`) porque es un
 * recorte propio de wmc, no una regla general de rutas.
 */
export function canRoleSeeWmcSections(role: TeamRole): boolean {
  return role !== "tester";
}

function normalizePath(path: string): string {
  const p = (path || "/").split("?")[0].split("#")[0];
  if (p === "/") return "/";
  return p.replace(/\/+$/, "") || "/";
}

/**
 * Grupos de la pantalla de Permisos (Ajustes): reflejan los mismos bloques
 * del menú lateral (`allRoleSections` en layout.tsx), para que activar/
 * desactivar una sección se sienta igual a como está organizado el menú.
 */
export const SECTION_GROUPS = ["contenido", "herramientas", "area", "hub", "administracion"] as const;
export type SectionGroup = (typeof SECTION_GROUPS)[number];

export interface SectionDef {
  /** Ruta real: es lo mismo que compara `canAccessRoute`/`routesInclude`. */
  path: string;
  group: SectionGroup;
}

/**
 * Catálogo de secciones que la pantalla de Permisos puede prender/apagar por
 * rol. Es deliberadamente más chico que todas las rutas de `App.tsx`: no
 * incluye páginas de detalle sin entrada de menú ni `/ajustes` (el
 * contenedor de Permisos: su acceso queda fijo en dirección + dev).
 *
 * `/admin/proposals` y `/admin/projects` son las pantallas portadas de
 * webmakerlatam.com (Presupuestos/Proyectos WMC). `/admin/proposal-builder`
 * no tiene casilla propia: comparte la de `/admin/proposals` (ver
 * `WmcRouteShell` en App.tsx, que gatea por un `section` fijo y no por la
 * URL real del navegador).
 *
 * ⚠️ Debe reflejar los mismos `href` que `allRoleSections` en
 * `artifacts/admin-panel/src/components/layout.tsx` — si se agrega una
 * página nueva al menú, agregarla acá también para que se pueda configurar.
 */
export const SECTION_CATALOG: readonly SectionDef[] = [
  { path: "/", group: "contenido" },
  { path: "/mi-dia", group: "contenido" },
  { path: "/mis-pendientes", group: "contenido" },
  { path: "/schedule", group: "contenido" },
  { path: "/cuentas", group: "contenido" },
  { path: "/videos", group: "contenido" },
  { path: "/insights", group: "contenido" },

  { path: "/cover", group: "herramientas" },
  { path: "/historias", group: "herramientas" },
  { path: "/descripciones", group: "herramientas" },
  { path: "/estudio", group: "herramientas" },
  { path: "/transcriptor", group: "herramientas" },
  { path: "/drive", group: "herramientas" },
  { path: "/biblioteca", group: "herramientas" },
  { path: "/ideas", group: "herramientas" },

  { path: "/edicion", group: "area" },
  { path: "/redes", group: "area" },
  { path: "/marketing", group: "area" },
  { path: "/metas", group: "area" },
  { path: "/tickets", group: "area" },
  { path: "/mis-tareas", group: "area" },
  { path: "/reportes", group: "area" },
  { path: "/proyecciones", group: "area" },
  { path: "/rrhh", group: "area" },

  { path: "/dashboard-ejecutivo", group: "hub" },
  { path: "/torre-ceo", group: "hub" },
  { path: "/proyectos", group: "hub" },
  { path: "/clientes", group: "hub" },
  { path: "/ventas", group: "hub" },
  { path: "/cobros", group: "hub" },
  { path: "/servicios", group: "hub" },
  { path: "/contratos", group: "hub" },
  { path: "/reuniones", group: "hub" },
  { path: "/notas", group: "hub" },
  { path: "/equipo-hoy", group: "hub" },
  { path: "/asistencia", group: "hub" },
  { path: "/drive-hub", group: "hub" },

  { path: "/agencia", group: "administracion" },
  { path: "/equipo", group: "administracion" },
  { path: "/ayuda", group: "administracion" },
  { path: "/admin/proposals", group: "administracion" },
  { path: "/admin/projects", group: "administracion" },
];

/**
 * Roles editables desde la pantalla de Permisos: todos menos CEO (acceso
 * total fijo, así quien configura permisos nunca puede dejarse afuera) y
 * tester (cuenta de revisión para TikTok, no un puesto real del equipo).
 */
export const CONFIGURABLE_ROLES: readonly TeamRole[] = TEAM_ROLES.filter(
  (r): r is TeamRole => r !== "ceo" && r !== "tester"
);
