/**
 * @workspace/areas — single source of truth for area-based access control.
 * Importable by both the backend (Express) and the frontend (Vite/React).
 * No Node.js–only dependencies.
 */

export type Area = "ceo" | "ejecutivo" | "edicion" | "marketing" | "rrhh";

export const AREAS: readonly Area[] = [
  "ceo",
  "ejecutivo",
  "edicion",
  "marketing",
  "rrhh",
] as const;

export const AREA_LABELS: Record<Area, string> = {
  ceo:       "CEO",
  ejecutivo: "Ejecutivo",
  edicion:   "Edición",
  marketing: "Marketing",
  rrhh:      "RRHH",
};

/** Badge colours for each area (CSS strings safe in both dark and light themes). */
export const AREA_BADGE: Record<Area, { bg: string; text: string }> = {
  ceo:       { bg: "rgba(212,175,55,0.18)",  text: "#D4AF37" },
  ejecutivo: { bg: "rgba(59,130,246,0.18)",  text: "#3B82F6" },
  edicion:   { bg: "rgba(139,92,246,0.18)",  text: "#8B5CF6" },
  marketing: { bg: "rgba(34,197,94,0.18)",   text: "#22C55E" },
  rrhh:      { bg: "rgba(244,114,182,0.18)", text: "#F472B6" },
};

/**
 * Frontend page routes each area may visit.
 * "*" = unrestricted (all pages).
 * Paths are matched exactly or as a prefix (e.g. "/biblioteca" also covers "/campanas/:id").
 */
export const AREA_PAGES: Record<Area, string[] | "*"> = {
  ceo:       "*",
  // /drive y /mis-tareas estaban en ROLES pero NO aquí, y el guardia de área
  // manda: el ítem salía en el menú y al pulsarlo daba "acceso restringido".
  // El área "ejecutivo" cubre a ventas y a desarrollo, que son justo quienes
  // necesitan la carpeta del proyecto. Las páginas del ex-Hub Ejecutivo son
  // ahora rutas propias del sidebar (ver @workspace/roles para el detalle
  // fino por rol); aquí va la unión de lo que ventas + desarrollo necesitan.
  ejecutivo: [
    "/dashboard-ejecutivo", "/proyectos", "/clientes", "/reuniones", "/notas",
    "/contratos", "/ventas", "/cobros", "/servicios", "/equipo-hoy",
    "/asistencia", "/drive-hub",
    "/mis-tareas", "/drive", "/mi-dia", "/ayuda",
  ],
  edicion:   ["/", "/schedule", "/cuentas", "/videos", "/cover", "/estudio", "/transcriptor", "/drive", "/biblioteca", "/descripciones", "/mi-dia", "/ayuda"],
  marketing: ["/insights", "/historias", "/descripciones", "/schedule", "/cuentas", "/mi-dia", "/ayuda"],
  rrhh:      ["/dashboard-ejecutivo", "/equipo-hoy", "/drive-hub", "/asistencia", "/equipo", "/", "/mi-dia", "/ayuda"],
};

/**
 * /api route prefixes (without /api) each area may call.
 * "*" = unrestricted.
 * These map to the backend router prefixes applied in requireArea middleware.
 *
 * Algunos prefijos NO aparecen acá a propósito: su gate real es por ROL, no
 * por área, porque `requireArea` no puede distinguir roles que comparten
 * área (p.ej. `/ideas`, exclusivo de Editora + Redes sociales — ver
 * artifacts/api-server/src/lib/ideas-gate.ts). No agregar `/ideas` acá bajo
 * "marketing" solo porque Redes está ahí: se lo daría también a Marketing.
 */
export const AREA_API_PREFIXES: Record<Area, string[] | "*"> = {
  ceo: "*",
  ejecutivo: ["/hub", "/cotizaciones"],
  edicion:   [
    "/content", "/studio", "/youtube", "/tiktok", "/instagram",
    "/linkedin", "/x", "/facebook", "/drive", "/library",
    "/transcriber", "/calendar", "/onboarding",
    "/saved-views", "/connections", "/notifications", "/social",
    "/credentials", "/settings", "/hub/tasks",
    // Solo Posts IA (descripciones/interactivo); Historias
    // sigue exclusivo de marketing — ver community-gate.ts en el backend.
    "/community",
  ],
  marketing: [
    "/analytics", "/community", "/inspirations", "/library",
    "/calendar", "/connections", "/notifications", "/social",
    "/credentials", "/settings", "/hub/tasks",
  ],
  rrhh: ["/hub/tasks"],
};

/** Default landing page after login for each area. */
export const AREA_HOME: Record<Area, string> = {
  ceo:       "/",
  ejecutivo: "/dashboard-ejecutivo",
  edicion:   "/",
  marketing: "/insights",
  rrhh:      "/dashboard-ejecutivo",
};

/**
 * Returns true when the given area is allowed to view the given page route.
 * Falls back to "ceo" (full access) for unknown/null areas.
 */
export function areaCanAccessPage(area: Area | string | null | undefined, route: string): boolean {
  const a = (AREAS.includes(area as Area) ? area : "ceo") as Area;
  const allowed = AREA_PAGES[a];
  if (allowed === "*") return true;
  return (allowed as string[]).some(p => {
    if (p === "/") return route === "/";
    return route === p || route.startsWith(p + "/");
  });
}

/** Normalises an unknown teamRole value to a valid Area (defaults to "ceo"). */
/**
 * Roles del equipo (@workspace/roles) → áreas de acceso.
 *
 * Las áreas guardan las rutas del backend (`requireArea`) y nacieron antes que
 * los roles. Sin esta traducción, la editora quedaría fuera del Estudio y
 * ventas y programación fuera del Hub: sus roles no existen como áreas.
 */
const ROLE_TO_AREA: Record<string, Area> = {
  ceo: "ceo",
  // Cuenta de revisión (TikTok review): mismo alcance que dirección.
  tester: "ceo",
  // Trabajan sobre el tablero ejecutivo (cartera, proyectos, tareas).
  ventas: "ejecutivo",
  dev: "ejecutivo",
  contador: "ejecutivo",
  // Producción de contenido.
  editora: "edicion",
  social: "marketing",
  marketing: "marketing",
  rrhh: "rrhh",
  // Roles anteriores a los roles por área.
  editor: "edicion",
  reviewer: "ceo",
};

/**
 * Traducción estricta rol → área: `null` cuando no se reconoce.
 * Las guardas del backend usan esta: un valor desconocido debe denegar, no
 * caer en un área con permisos.
 */
export function areaOfRole(teamRole: string | null | undefined): Area | null {
  if (!teamRole) return null;
  if (AREAS.includes(teamRole as Area)) return teamRole as Area;
  return ROLE_TO_AREA[teamRole] ?? null;
}

/** Versión tolerante para mostrar en pantalla: nunca falla, cae en "ceo". */
export function toArea(teamRole: string | null | undefined): Area {
  return areaOfRole(teamRole) ?? "ceo";
}
