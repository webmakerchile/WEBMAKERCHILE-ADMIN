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
  ejecutivo: ["/ejecutivo", "/mi-dia", "/ayuda"],
  edicion:   ["/", "/schedule", "/cuentas", "/videos", "/cover", "/estudio", "/transcriptor", "/drive", "/biblioteca", "/mi-dia", "/ayuda"],
  marketing: ["/insights", "/historias", "/descripciones", "/schedule", "/cuentas", "/mi-dia", "/ayuda"],
  rrhh:      ["/ejecutivo", "/equipo", "/", "/mi-dia", "/ayuda"],
};

/**
 * /api route prefixes (without /api) each area may call.
 * "*" = unrestricted.
 * These map to the backend router prefixes applied in requireArea middleware.
 */
export const AREA_API_PREFIXES: Record<Area, string[] | "*"> = {
  ceo: "*",
  ejecutivo: ["/hub"],
  edicion:   [
    "/content", "/studio", "/youtube", "/tiktok", "/instagram",
    "/linkedin", "/x", "/facebook", "/drive", "/library",
    "/transcriber", "/calendar", "/ideas", "/onboarding",
    "/saved-views", "/connections", "/notifications", "/social",
    "/credentials", "/settings",
  ],
  marketing: [
    "/analytics", "/community", "/inspirations", "/library",
    "/calendar", "/connections", "/notifications", "/social",
    "/credentials", "/settings",
  ],
  rrhh: ["/hub/tasks"],
};

/** Default landing page after login for each area. */
export const AREA_HOME: Record<Area, string> = {
  ceo:       "/",
  ejecutivo: "/ejecutivo",
  edicion:   "/",
  marketing: "/insights",
  rrhh:      "/ejecutivo",
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
export function toArea(teamRole: string | null | undefined): Area {
  return AREAS.includes(teamRole as Area) ? (teamRole as Area) : "ceo";
}
