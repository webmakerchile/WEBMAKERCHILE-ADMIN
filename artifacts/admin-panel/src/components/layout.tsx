import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Video,
  Image as ImageIcon,
  FolderTree,
  CalendarClock,
  Clapperboard,
  Sparkles,
  MessageSquareText,
  Users2,
  UserCog,
  Library,
  AudioLines,
  BarChart3,
  HelpCircle,
  Settings,
  LogOut,
  Menu,
  X,
  Languages,
  CheckSquare2,
  LayoutGrid,
  Receipt,
  ListChecks,
  ClipboardList,
  IdCard,
  Ticket as TicketIcon,
  Scissors,
  Share2,
  Megaphone,
  Target,
  TrendingUp,
  Landmark,
  Gauge,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  FileCheck2,
  Handshake,
  HandCoins,
  Package,
  Activity,
  Clock3,
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import { canAccessRoute } from "@workspace/roles";
import { useEffectiveRole, useViewAs } from "@/lib/view-as";
import { ViewAsBar } from "@/components/view-as-bar";
import { NavCustomizer, useHiddenNav } from "@/components/nav-customizer";

type NavItem = { href: string; icon: LucideIcon; label: string; tour: string };
type NavSection = { label: string; items: NavItem[] };
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { OnboardingTour } from "@/components/onboarding-tour";
import { GlobalShortcutsProvider } from "@/components/global-shortcuts-provider";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { NotificationsBell } from "@/components/notifications-bell";
import { InstallBanner } from "@/components/install-banner";
import { JornadaChip } from "@/components/jornada-card";
import { useLang } from "@/lib/lang";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export function Layout({ children, chromeHidden = false }: { children: React.ReactNode; chromeHidden?: boolean }) {
  const [location] = useLocation();
  const user = useAuth();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t, toggleLang, lang } = useLang();

  const { viewAs } = useViewAs();
  const effectiveRole = useEffectiveRole();
  // Simulando un rol, el superadmin no se salta nada: se ve el panel real de esa persona.
  const isSuperAdmin = !viewAs && user?.role === "superadmin";
  /** Cada rol solo ve en el menú las rutas que su rol permite. */
  const allRoleSections: NavSection[] = [
    {
      label: t.navSectionContent,
      items: [
        { href: "/", icon: LayoutDashboard, label: t.navHome, tour: "nav-inicio" },
        { href: "/mi-dia", icon: CheckSquare2, label: t.navMyDay, tour: "nav-mi-dia" },
        { href: "/mis-pendientes", icon: ClipboardList, label: t.navMisPendientes, tour: "nav-mis-pendientes" },
        { href: "/schedule", icon: CalendarClock, label: t.navPosts, tour: "nav-schedule" },
        { href: "/cuentas", icon: Users2, label: t.navAccounts, tour: "nav-cuentas" },
        { href: "/videos", icon: Video, label: t.navVideos, tour: "nav-videos" },
        { href: "/insights", icon: BarChart3, label: t.navInsights, tour: "nav-insights" },
      ],
    },
    {
      label: t.navSectionTools,
      items: [
        { href: "/cover", icon: ImageIcon, label: t.navCovers, tour: "nav-cover" },
        { href: "/historias", icon: Sparkles, label: t.navStories, tour: "nav-historias" },
        { href: "/descripciones", icon: MessageSquareText, label: t.navDescriptions, tour: "nav-descripciones" },
        { href: "/estudio", icon: Clapperboard, label: t.navStudio, tour: "nav-estudio" },
        { href: "/transcriptor", icon: AudioLines, label: t.navTranscriber, tour: "nav-transcriptor" },
        { href: "/drive", icon: FolderTree, label: t.navDrive, tour: "nav-drive" },
        { href: "/biblioteca", icon: Library, label: t.navLibrary, tour: "nav-biblioteca" },
      ],
    },
    {
      label: t.navSectionAreas,
      items: [
        { href: "/edicion", icon: Scissors, label: t.navEdicion, tour: "nav-edicion" },
        { href: "/redes", icon: Share2, label: t.navRedes, tour: "nav-redes" },
        { href: "/marketing", icon: Megaphone, label: t.navMarketing, tour: "nav-marketing" },
        { href: "/metas", icon: Target, label: t.navMetas, tour: "nav-metas" },
        { href: "/tickets", icon: TicketIcon, label: t.navTickets, tour: "nav-tickets" },
        { href: "/mis-tareas", icon: ListChecks, label: t.navMyTasks, tour: "nav-mis-tareas" },
        { href: "/reportes", icon: Receipt, label: t.navReports, tour: "nav-reportes" },
        { href: "/proyecciones", icon: TrendingUp, label: t.navProyecciones, tour: "nav-proyecciones" },
        { href: "/rrhh", icon: IdCard, label: t.navHr, tour: "nav-rrhh" },
      ],
    },
    {
      label: t.navSectionHub,
      items: [
        { href: "/dashboard-ejecutivo", icon: LayoutGrid, label: t.navHubDash, tour: "nav-hub-dash" },
        { href: "/torre-ceo", icon: Gauge, label: t.navHubTorre, tour: "nav-hub-torre" },
        { href: "/proyectos", icon: Briefcase, label: t.navHubProj, tour: "nav-hub-proj" },
        { href: "/clientes", icon: Building2, label: t.navHubClients, tour: "nav-hub-clients" },
        { href: "/ventas", icon: Handshake, label: t.navHubVentas, tour: "nav-hub-ventas" },
        { href: "/cobros", icon: HandCoins, label: t.navHubCobros, tour: "nav-hub-cobros" },
        { href: "/servicios", icon: Package, label: t.navHubSvc, tour: "nav-hub-svc" },
        { href: "/contratos", icon: FileCheck2, label: t.navHubContracts, tour: "nav-hub-contracts" },
        { href: "/reuniones", icon: CalendarDays, label: t.navHubMeet, tour: "nav-hub-meet" },
        { href: "/notas", icon: FileText, label: t.navHubNotes, tour: "nav-hub-notes" },
        { href: "/equipo-hoy", icon: Activity, label: t.navHubTeam, tour: "nav-hub-team" },
        { href: "/asistencia", icon: Clock3, label: t.navHubAtt, tour: "nav-hub-att" },
        { href: "/drive-hub", icon: HardDrive, label: t.navHubDrive, tour: "nav-hub-drive" },
      ],
    },
    {
      label: t.navSectionAdmin,
      items: [
        { href: "/agencia", icon: Landmark, label: t.navAgencia, tour: "nav-agencia" },
        { href: "/equipo", icon: UserCog, label: t.navTeam, tour: "nav-equipo" },
        { href: "/ajustes", icon: Settings, label: t.navSettings, tour: "nav-ajustes" },
        { href: "/ayuda", icon: HelpCircle, label: t.navHelp, tour: "nav-help" },
      ],
    },
  ];

  // Wmc: pantallas portadas 1:1 desde webmakerlatam.com (propuestas/proyectos
  // del origen — no confundir con "Proyectos" del Hub). Gate por EMAIL
  // (user.wmcAccess), no por rol: por eso vive aparte de allRoleSections y se
  // agrega DESPUÉS del filtro de canAccessRoute, no adentro de él.
  const wmcSection: NavSection = {
    label: "WebMaker LATAM",
    items: [
      { href: "/admin/proposals", icon: FileText, label: "Propuestas", tour: "nav-wmc-proposals" },
      { href: "/admin/projects", icon: Briefcase, label: "Proyectos", tour: "nav-wmc-projects" },
    ],
  };

  // Primero el permiso (qué puede ver el rol), después el gusto (qué eligió ocultar).
  const hiddenNav = useHiddenNav();
  const permitidas = allRoleSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRoute(effectiveRole, item.href, isSuperAdmin)),
    }))
    .filter((section) => section.items.length > 0);

  const navSections: NavSection[] = permitidas
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !hiddenNav.includes(item.href)),
    }))
    .filter((section) => section.items.length > 0)
    .concat(
      user?.wmcAccess
        ? [{ ...wmcSection, items: wmcSection.items.filter((item) => !hiddenNav.includes(item.href)) }]
        : [],
    )
    .filter((section) => section.items.length > 0);

  /** Lo que el personalizador ofrece esconder: solo lo que este rol ve. */
  const navOptions = permitidas
    .flatMap((s) => s.items.map((i) => ({ href: i.href, label: i.label })))
    .concat(user?.wmcAccess ? wmcSection.items.map((i) => ({ href: i.href, label: i.label })) : []);

  // The mobile bottom-nav shows the first 5 items (the "Contenido" section).
  const navItems = navSections.flatMap((s) => s.items);

  // Prefix-aware active state so nested routes highlight their parent item
  // (e.g. /campanas/:id lights up Biblioteca). "/" only matches exactly.
  const isNavActive = (href: string) => {
    if (href === "/") return location === "/";
    if (location === href || location.startsWith(`${href}/`)) return true;
    if (href === "/biblioteca" && location.startsWith("/campanas")) return true;
    return false;
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("wm_hub") || key === "wm_auth_hint") localStorage.removeItem(key);
      }
    } catch {}
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    window.location.reload();
  };

  const LangToggle = ({ full }: { full?: boolean }) => (
    <button
      onClick={toggleLang}
      title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
      className={cn(
        "flex items-center gap-1.5 rounded-lg text-xs font-semibold border border-foreground/15 transition-base hover:bg-foreground/10",
        full ? "px-3 py-2.5 w-full justify-center" : "px-2 py-1.5",
      )}
    >
      <Languages className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{t.langLabel}</span>
    </button>
  );

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden">
      <OnboardingTour />
      <GlobalShortcutsProvider />
      {!chromeHidden && (
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r border-foreground/10 bg-card/60 backdrop-blur-xl flex-col relative z-20">
        <div className="h-16 flex items-center px-6 border-b border-foreground/10">
          <img src="/icon-192.png" alt="Logo" className="w-7 h-7 rounded-lg mr-3" />
          <h1 className="font-display font-bold text-xl tracking-tight text-gradient">
            WebMaker<span className="text-primary">Admin</span>
          </h1>
        </div>

        <div className="px-3 pt-4">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/10 text-muted-foreground hover:text-foreground transition-base text-sm"
          >
            <span className="flex-1 text-left">{t.navSearch}</span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = isNavActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-tour={item.tour}
                      className={cn(
                        "flex items-center px-3 py-3 rounded-xl transition-base group relative",
                        isActive
                          ? "text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="active-nav"
                          className="absolute inset-0 bg-gradient-to-r from-primary/90 to-orange-500/80 rounded-xl shadow-lg shadow-primary/20"
                          initial={false}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <Icon className={cn("w-5 h-5 mr-3 relative z-10", isActive ? "text-white" : "group-hover:text-primary transition-base")} />
                      <span className="relative z-10">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-foreground/10 space-y-3">
          <JornadaChip />
          {user && (
            <div className="flex items-center gap-3 px-1">
              {user.picture ? (
                <img src={user.picture} alt={user.name || ""} className="w-8 h-8 rounded-full border border-foreground/15" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {(user.name || user.email || "?")[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name || "Admin"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
              <NotificationsBell />
              <ThemeToggle />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleLogout}
              className="flex items-center flex-1 px-3 py-3 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-base"
            >
              <LogOut className="w-4 h-4 mr-3" />
              {t.navLogout}
            </button>
            <LangToggle />
          </div>
        </div>
      </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {!chromeHidden && (
        <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b border-foreground/10 bg-card/80 backdrop-blur-xl relative z-30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Logo" className="w-7 h-7 rounded-lg" />
            <span className="font-display font-bold text-lg text-gradient">
              WebMaker<span className="text-primary">Admin</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LangToggle />
            <NotificationsBell />
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-foreground/10 transition-base"
              aria-label={mobileMenuOpen ? t.navCloseMenu : t.navOpenMenu}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </header>
        )}

        <AnimatePresence>
          {!chromeHidden && mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="lg:hidden fixed top-0 right-0 bottom-0 w-72 bg-card border-l border-foreground/10 z-50 flex flex-col"
              >
                <div className="h-14 flex items-center justify-between px-4 border-b border-foreground/10">
                  <span className="font-display font-bold text-lg">{t.navMenu}</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-foreground/10 transition-base" aria-label={t.navCloseMenu}>
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
                  {navSections.map((section) => (
                    <div key={section.label}>
                      <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {section.label}
                      </p>
                      <div className="space-y-1">
                        {section.items.map((item) => {
                          const isActive = isNavActive(item.href);
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              data-tour={`mobile-${item.tour}`}
                              className={cn(
                                "flex items-center px-4 py-3.5 rounded-xl transition-base",
                                isActive
                                  ? "bg-gradient-to-r from-primary/90 to-orange-500/80 text-white font-medium shadow-lg shadow-primary/20"
                                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                              )}
                            >
                              <Icon className={cn("w-5 h-5 mr-3", isActive ? "text-white" : "")} />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>

                <div className="p-4 border-t border-foreground/10 space-y-3">
                  <JornadaChip />
                  {user && (
                    <div className="flex items-center gap-3 px-1">
                      {user.picture ? (
                        <img src={user.picture} alt={user.name || ""} className="w-9 h-9 rounded-full border border-foreground/15" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                          {(user.name || user.email || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name || "Admin"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                  )}
                  <ThemeToggle variant="full" />
                  <LangToggle full />
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-3 py-3 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-base"
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    {t.navLogout}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <ViewAsBar />

        <main className="flex-1 relative overflow-y-auto overflow-x-hidden bg-background">
          {!chromeHidden && (
            <>
              <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] pointer-events-none bg-halo-1" />
              <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[100px] pointer-events-none bg-halo-2" />
            </>
          )}

          <div className={cn("relative z-10", chromeHidden ? "h-full" : "min-h-full px-4 py-6 lg:p-8 max-w-7xl mx-auto")}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className={cn(chromeHidden && "h-full")}
            >
              {children}
            </motion.div>
          </div>
        </main>

        {!chromeHidden && (
        <nav className="lg:hidden flex-shrink-0 border-t border-foreground/10 bg-card/80 backdrop-blur-xl safe-bottom">
          <div className="flex items-center justify-around h-16 px-1">
            {navItems.slice(0, 5).map((item) => {
              const isActive = isNavActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-base min-w-0 flex-1",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
                  <span className={cn("text-[10px] leading-tight truncate max-w-full", isActive && "font-semibold")}>{item.label.split(" ")[0]}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg text-muted-foreground min-w-0 flex-1 transition-base"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] leading-tight">{t.navMore}</span>
            </button>
          </div>
        </nav>
        )}
      </div>

      <InstallBanner />
    </div>
  );
}
