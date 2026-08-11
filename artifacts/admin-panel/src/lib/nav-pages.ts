import type { Translations } from "@/lib/lang";

/**
 * Canonical list of top-level pages surfaced by BOTH global navigation
 * affordances that sit outside the sidebar: the command palette's "Páginas"
 * group and the "g <key>" keyboard shortcuts (see command-palette.tsx and
 * global-shortcuts-provider.tsx). Icons/handlers stay in those UI files;
 * this module only holds the route-identifying data, so a role's revoked
 * route disappears consistently from both surfaces (and from the sidebar,
 * which already filters through the same `hasAccess`/`routesInclude`
 * check) instead of drifting out of sync. See nav-pages.test.ts.
 */
export type NavPageId =
  | "home"
  | "videos"
  | "schedule"
  | "cuentas"
  | "insights"
  | "biblioteca"
  | "cover"
  | "historias"
  | "descripciones"
  | "drive"
  | "estudio"
  | "transcriptor"
  | "equipo"
  | "ajustes"
  | "ayuda"
  | "hub";

export type NavPageSpec = {
  id: NavPageId;
  href: string;
  label: (t: Translations) => string;
  /** Key used in the "g <key>" shortcut sequence. Omit if not reachable via shortcut. */
  shortcutKey?: string;
  /**
   * Fixed Spanish text shown in the shortcuts-help dialog, independent of
   * the active UI language (matches this app's existing shortcuts text —
   * intentionally NOT derived from `label`, whose translation can differ
   * from the historical shortcut wording, e.g. navCalendar's full label).
   */
  shortcutDescription?: string;
};

export const NAV_PAGES: NavPageSpec[] = [
  { id: "home", href: "/", label: (t) => t.navHome, shortcutKey: "i", shortcutDescription: "Ir a Inicio" },
  { id: "videos", href: "/videos", label: (t) => t.navVideos, shortcutKey: "v", shortcutDescription: "Ir a Videos" },
  { id: "schedule", href: "/schedule", label: (t) => t.navCalendar, shortcutKey: "c", shortcutDescription: "Ir a Calendario" },
  { id: "cuentas", href: "/cuentas", label: (t) => t.navAccounts, shortcutKey: "u", shortcutDescription: "Ir a Cuentas" },
  { id: "insights", href: "/insights", label: (t) => t.navInsights, shortcutKey: "s", shortcutDescription: "Ir a Insights" },
  { id: "biblioteca", href: "/biblioteca", label: (t) => t.navLibrary, shortcutKey: "b", shortcutDescription: "Ir a Biblioteca" },
  { id: "cover", href: "/cover", label: (t) => t.navCovers, shortcutKey: "p", shortcutDescription: "Ir a Portadas" },
  { id: "historias", href: "/historias", label: (t) => t.navStories },
  { id: "descripciones", href: "/descripciones", label: (t) => t.navDescriptions, shortcutKey: "d", shortcutDescription: "Ir a Descripciones" },
  { id: "drive", href: "/drive", label: (t) => t.navDrive },
  { id: "estudio", href: "/estudio", label: (t) => t.navStudio, shortcutKey: "e", shortcutDescription: "Ir a Estudio" },
  { id: "transcriptor", href: "/transcriptor", label: (t) => t.navTranscriber, shortcutKey: "t", shortcutDescription: "Ir a Transcriptor" },
  { id: "equipo", href: "/equipo", label: (t) => t.navTeam, shortcutKey: "q", shortcutDescription: "Ir a Equipo" },
  { id: "ajustes", href: "/ajustes", label: (t) => t.navSettings, shortcutKey: "a", shortcutDescription: "Ir a Ajustes" },
  { id: "ayuda", href: "/ayuda", label: (t) => t.navHelp },
  { id: "hub", href: "/dashboard-ejecutivo", label: (t) => t.navHub, shortcutKey: "h", shortcutDescription: "Ir a Hub Ejecutivo" },
];

/**
 * Filter any list of items that carry an optional navigable `href` down to
 * those the current effective role can access. Items with no `href` (e.g.
 * an action that only toggles the theme) are always kept.
 */
export function filterByRouteAccess<T extends { href?: string }>(
  items: readonly T[],
  hasAccess: (href: string) => boolean,
): T[] {
  return items.filter((item) => !item.href || hasAccess(item.href));
}
