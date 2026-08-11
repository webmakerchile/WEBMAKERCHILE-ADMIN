import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { useKeyboardShortcuts, type ShortcutDefinition } from "@/hooks/use-keyboard-shortcuts";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/App";
import { useEffectiveRole, useViewAs } from "@/lib/view-as";
import { normalizeRole, routesInclude, canAccessRoute } from "@workspace/roles";
import { NAV_PAGES, filterByRouteAccess } from "@/lib/nav-pages";

export function GlobalShortcutsProvider() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { cycle: cycleTheme } = useTheme();

  const user = useAuth();
  const { viewAs } = useViewAs();
  const effectiveRole = useEffectiveRole();
  const isSuperAdmin = !viewAs && user?.role === "superadmin";
  const dynamicRoutes = user?.roleRoutes?.[normalizeRole(effectiveRole, isSuperAdmin)];
  const hasAccess = (href: string) =>
    dynamicRoutes ? routesInclude(dynamicRoutes, href) : canAccessRoute(effectiveRole, href, isSuperAdmin);

  // Trigger "new video" reliably from anywhere: if we're already on /videos,
  // dispatch an event the page listens for; otherwise navigate with the
  // ?new=1 deep-link query so the freshly-mounted page picks it up.
  const triggerNewVideo = useCallback(() => {
    if (location === "/videos") {
      window.dispatchEvent(new CustomEvent("videos:new"));
    } else {
      setLocation("/videos?new=1");
    }
  }, [location, setLocation]);

  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener("open-shortcuts", open as EventListener);
    return () => window.removeEventListener("open-shortcuts", open as EventListener);
  }, []);

  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener("open-command-palette", open as EventListener);
    return () => window.removeEventListener("open-command-palette", open as EventListener);
  }, []);

  // "g <key>" shortcuts are derived from the shared NAV_PAGES list (see
  // lib/nav-pages) so they always target the same routes as the command
  // palette. Both this array and the two standalone nav shortcuts below
  // (n, plain s) carry an `href` used only to filter by `hasAccess` -- it's
  // stripped before reaching useKeyboardShortcuts.
  const goToShortcuts: (ShortcutDefinition & { href?: string })[] = NAV_PAGES.filter(
    (p) => p.shortcutKey,
  ).map((p) => ({
    key: p.shortcutKey!,
    prefix: "g",
    href: p.href,
    description: p.shortcutDescription,
    handler: () => setLocation(p.href),
  }));

  const allShortcuts: (ShortcutDefinition & { href?: string })[] = [
    { key: "k", meta: true, allowInInput: true, description: "Paleta de comandos", handler: () => setPaletteOpen((v) => !v) },
    { key: "?", description: "Ver atajos", handler: () => setHelpOpen((v) => !v) },
    { key: "n", href: "/videos", description: "Nuevo video", handler: triggerNewVideo },
    { key: "s", href: "/schedule", description: "Programar publicaciones", handler: () => setLocation("/schedule") },
    { key: "t", description: "Cambiar tema", handler: cycleTheme },
    ...goToShortcuts,
  ];

  useKeyboardShortcuts(filterByRouteAccess(allShortcuts, hasAccess));

  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
