import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LogOut, Plus, Menu, X, ChevronLeft,
  LayoutDashboard, Briefcase, ListChecks, Users2, CalendarClock, FileText, FileCheck2, Calculator, FolderTree, Package,
} from "lucide-react";
import { API_BASE } from "./api";
import { buildExport, importHubJson, summarizeImport } from "./backup";
import { LS_TAB, TAB_LABELS, TAB_TITLES } from "./constants";
import { useHubData, useHubOverview, useInvalidateHub, useMigrateLegacy } from "./hooks";
import { clearHubStorage } from "./lib";
import { SheetContent } from "./sheets";
import { HubDriveView } from "./shared";
import {
  ClientsView, ContractsView, DashView, GlobalSearch, MeetView, NotesView,
  ProjView, QuotesView, SvcView, TasksView,
} from "./views";
import type { ProjView as ProjViewMode, SheetKind, Tab } from "./types";
import "../ejecutivo.css";

/* ============================================================
   HUB EJECUTIVO — página principal
   Estado de datos: servidor (/api/hub/*) vía TanStack Query.
   localStorage: solo la tab activa. Tab también en la URL (?tab=).
   ============================================================ */

const TAB_IDS: readonly Tab[] = ["dashboard", "proyectos", "tareas", "clientes", "reuniones", "notas", "contratos", "presupuestos", "servicios", "drive"];
function isTab(v: string | null | undefined): v is Tab {
  return !!v && (TAB_IDS as readonly string[]).includes(v);
}

const HubTabIcons: Record<Tab, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  proyectos: Briefcase,
  tareas: ListChecks,
  clientes: Users2,
  reuniones: CalendarClock,
  notas: FileText,
  contratos: FileCheck2,
  presupuestos: Calculator,
  drive: FolderTree,
  servicios: Package,
};

/** Tabs con acción de creación (sidebar “+ Nuevo” y FAB móvil). */
const CREATABLE_TABS: readonly Tab[] = ["proyectos", "tareas", "clientes", "reuniones", "notas", "contratos", "presupuestos"];

export default function EjecutivoPage() {
  const authUser = useAuth();
  const isAdmin = authUser?.role === "superadmin" || authUser?.role === "admin";
  const queryClient = useQueryClient();
  const invalidateHub = useInvalidateHub();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { clients, projects, tasks, meetings, notes, contracts, quotes, isLoading, isError } = useHubData();
  const overviewQ = useHubOverview();
  const migrateLegacy = useMigrateLegacy();

  /* ---- Tab activa: URL (?tab=) como fuente, localStorage como preferencia ---- */
  const search = useSearch();
  const [, setLocation] = useLocation();

  const [tab, setTabRaw] = useState<Tab>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("tab");
      if (isTab(fromUrl)) return fromUrl;
      const stored = localStorage.getItem(LS_TAB);
      if (isTab(stored)) return stored;
    } catch { /* ignore */ }
    return "dashboard";
  });

  const setTab = useCallback((t: Tab) => {
    setTabRaw(t);
    try { localStorage.setItem(LS_TAB, t); } catch { /* ignore */ }
    setLocation(`/ejecutivo?tab=${t}`, { replace: true });
  }, [setLocation]);

  /* La URL manda: si cambia por fuera (link de push, back/forward), seguimos la tab. */
  useEffect(() => {
    const fromUrl = new URLSearchParams(search).get("tab");
    if (isTab(fromUrl)) {
      setTabRaw(prev => (prev === fromUrl ? prev : fromUrl));
      try { localStorage.setItem(LS_TAB, fromUrl); } catch { /* ignore */ }
    }
  }, [search]);

  /* Refleja la tab inicial en la URL si llegó sin query param. */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl !== tab) setLocation(`/ejecutivo?tab=${tab}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "servicios" && !isAdmin) setTab("dashboard");
  }, [tab, isAdmin, setTab]);

  const navigate = useCallback((t: Tab) => { setTab(t); window.scrollTo(0, 0); }, [setTab]);

  /* ---- UI local ---- */
  const [projView, setProjView] = useState<ProjViewMode>("board");
  const [projSearch, setProjSearch] = useState("");
  const [projPrio, setProjPrio] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskPrio, setTaskPrio] = useState("");
  const [taskMine, setTaskMine] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [noteScopeFilter, setNoteScopeFilter] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; onYes: () => void } | null>(null);
  const [importing, setImporting] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2600);
  }, []);

  const openSheet = useCallback((s: SheetKind) => setSheet(s), []);

  /* ---- Migración automática del blob legacy (solo admin, tablas vacías) ---- */
  const migrationTried = useRef(false);
  useEffect(() => {
    if (migrationTried.current || !isAdmin || !overviewQ.data) return;
    migrationTried.current = true;
    const counts = overviewQ.data.counts;
    const allZero = counts && Object.values(counts).every(v => !v);
    if (!allZero) return;
    migrateLegacy.mutate(undefined, {
      onSuccess: res => {
        if (!res.migrated) return;
        invalidateHub();
        const parts = res.counts
          ? Object.entries(res.counts).filter(([, v]) => typeof v === "number" && v > 0).map(([k, v]) => `${v} ${k}`)
          : [];
        showToast(parts.length
          ? `Datos migrados al Hub del equipo: ${parts.join(" · ")}`
          : "Datos migrados al Hub del equipo ✓");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewQ.data, isAdmin]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    clearHubStorage();
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    window.location.reload();
  };

  const handleNew = () => {
    if (tab === "clientes") openSheet({ kind: "new-client" });
    else if (tab === "reuniones") openSheet({ kind: "new-meet" });
    else if (tab === "notas") openSheet({ kind: "new-note" });
    else if (tab === "contratos") openSheet({ kind: "new-contract-mode" });
    else if (tab === "tareas") openSheet({ kind: "new-task" });
    else if (tab === "presupuestos") openSheet({ kind: "quote-wizard" });
    else openSheet({ kind: "new-proj" });
  };

  /* ---- Export/Import (datos del servidor) ---- */
  const handleExport = () => {
    const payload = buildExport({ clients, projects, tasks, meetings, notes, contracts, quotes });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "webmaker-hub-respaldo-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast("Respaldo descargado");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data: unknown = JSON.parse(reader.result as string);
        if (!data || typeof data !== "object") { showToast("Archivo de respaldo no válido"); return; }
        const obj = data as Record<string, unknown>;
        const total = ["clients", "projects", "tasks", "meetings", "notes", "contracts", "quotes"]
          .reduce((a, k) => a + (Array.isArray(obj[k]) ? (obj[k] as unknown[]).length : 0), 0);
        if (!total) { showToast("El respaldo no contiene elementos reconocibles"); return; }
        setConfirm({
          msg: `Se crearán hasta ${total} elemento${total !== 1 ? "s" : ""} nuevo${total !== 1 ? "s" : ""} en el Hub del equipo (no se reemplaza lo existente). ¿Continuar?`,
          onYes: () => {
            setImporting(true);
            void importHubJson(data, clients)
              .then(summary => { invalidateHub(); showToast(summarizeImport(summary)); })
              .catch(() => showToast("Error durante la importación"))
              .finally(() => setImporting(false));
          },
        });
      } catch { showToast("No se pudo leer el respaldo"); }
      finally { if (importRef.current) importRef.current.value = ""; }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const [tt, tsub] = TAB_TITLES[tab] || TAB_TITLES.dashboard;
  const TABS: { id: Tab; cnt?: number }[] = [
    { id: "dashboard" },
    { id: "proyectos", cnt: projects.length },
    { id: "tareas", cnt: tasks.length },
    { id: "clientes", cnt: clients.length },
    { id: "reuniones", cnt: meetings.length },
    { id: "notas", cnt: notes.length },
    { id: "contratos", cnt: contracts.length },
    { id: "presupuestos", cnt: quotes.length },
    { id: "drive" },
    ...(isAdmin ? [{ id: "servicios" as Tab }] : []),
  ];

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@300;400;500&family=Oswald:wght@500;600&display=swap" rel="stylesheet" />

      <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden">

        {/* ======= MAIN CONTENT AREA ======= */}
        <div className="hub-root flex-1 min-w-0 flex flex-col overflow-hidden relative">

          {/* ---- MOBILE HEADER ---- */}
          <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b border-foreground/10 bg-card/80 backdrop-blur-xl relative z-30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src="/icon-192.png" alt="Hub" className="w-7 h-7 rounded-lg" />
              <span className="font-bold text-lg">WebMaker<span className="text-primary"> Hub</span></span>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg hover:bg-foreground/10 transition-colors" aria-label="Menú">
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </header>

          {/* ---- MOBILE SLIDE-IN MENU ---- */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <motion.div
                  initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                  className="lg:hidden fixed top-0 right-0 bottom-0 w-72 bg-card border-l border-foreground/10 z-50 flex flex-col"
                >
                  <div className="h-14 flex items-center justify-between px-4 border-b border-foreground/10">
                    <span className="font-bold text-lg">Hub Ejecutivo</span>
                    <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-foreground/10 transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                  <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {TABS.map(({ id, cnt }) => {
                      const isActive = tab === id;
                      const Icon = HubTabIcons[id];
                      return (
                        <button
                          key={id}
                          onClick={() => { navigate(id); setMobileMenuOpen(false); }}
                          className={cn(
                            "flex items-center w-full px-4 py-3.5 rounded-xl transition-colors",
                            isActive
                              ? "bg-gradient-to-r from-primary/90 to-orange-500/80 text-white font-medium shadow-lg shadow-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                          )}
                        >
                          <Icon className={cn("w-5 h-5 mr-3", isActive ? "text-white" : "")} />
                          <span className="flex-1 text-left">{TAB_LABELS[id]}</span>
                          {cnt !== undefined && cnt > 0 && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", isActive ? "bg-white/20 text-white" : "bg-foreground/10 text-muted-foreground")}>{cnt}</span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="p-4 border-t border-foreground/10 space-y-2">
                    {authUser && (
                      <div className="flex items-center gap-3 px-1 mb-3">
                        {authUser.picture ? (
                          <img src={authUser.picture} alt={authUser.name || ""} className="w-9 h-9 rounded-full border border-foreground/15" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">{(authUser.name || authUser.email || "?")[0].toUpperCase()}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{authUser.name || "Admin"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{authUser.email}</p>
                        </div>
                      </div>
                    )}
                    <ThemeToggle variant="full" />
                    <button onClick={handleLogout} className="flex items-center w-full px-3 py-3 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors">
                      <LogOut className="w-4 h-4 mr-3" />Cerrar sesión
                    </button>
                    <Link href="/" className="flex items-center px-3 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors">
                      <ChevronLeft className="w-4 h-4 mr-2" />Volver al panel
                    </Link>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* ---- MAIN SCROLLABLE CONTENT ---- */}
          <div className="main">
            <div className="topbar">
              <div className="ptitle"><span>{tt}</span><small>{tsub}</small></div>
              <GlobalSearch onOpen={openSheet} onNavigate={navigate} />
            </div>
            {isError && <div className="hub-sync-error">No se pudo sincronizar con el servidor — reintentando automáticamente…</div>}
            {isLoading && tab !== "drive" && tab !== "servicios" ? (
              <div className="hub-loading">Sincronizando datos del equipo…</div>
            ) : (
              <>
                {tab === "dashboard" && <DashView onOpenProject={id => openSheet({ kind: "proj", id })} onNavigate={navigate} onToast={showToast} />}
                {tab === "proyectos" && <ProjView onOpenProject={id => openSheet({ kind: "proj", id })} onToast={showToast} projView={projView} setProjView={setProjView} searchQ={projSearch} setSearchQ={setProjSearch} filterPrio={projPrio} setFilterPrio={setProjPrio} />}
                {tab === "tareas" && <TasksView onOpenTask={id => openSheet({ kind: "task", id })} onToast={showToast} searchQ={taskSearch} setSearchQ={setTaskSearch} filterPrio={taskPrio} setFilterPrio={setTaskPrio} mineOnly={taskMine} setMineOnly={setTaskMine} />}
                {tab === "clientes" && <ClientsView onOpen={id => openSheet({ kind: "client", id })} searchQ={clientSearch} setSearchQ={setClientSearch} />}
                {tab === "reuniones" && <MeetView onOpen={id => openSheet({ kind: "meet", id })} />}
                {tab === "notas" && <NotesView onOpen={id => openSheet({ kind: "note", id })} filterScope={noteScopeFilter} setFilterScope={setNoteScopeFilter} searchQ={noteSearch} setSearchQ={setNoteSearch} />}
                {tab === "contratos" && <ContractsView onOpen={id => openSheet({ kind: "contract", id })} onNewQuote={() => { navigate("presupuestos"); openSheet({ kind: "quote-wizard" }); }} />}
                {tab === "presupuestos" && <QuotesView onOpen={id => openSheet({ kind: "quote", id })} onNew={() => openSheet({ kind: "quote-wizard" })} />}
                {tab === "drive" && <HubDriveView />}
                {tab === "servicios" && isAdmin && <SvcView />}
              </>
            )}
          </div>

          {/* ---- MOBILE FAB: crear según el tab activo ---- */}
          {CREATABLE_TABS.includes(tab) && !sheet && (
            <button className="hub-fab" onClick={handleNew} aria-label="Crear nuevo">
              <Plus className="w-6 h-6" />
            </button>
          )}

          {/* ---- MOBILE BOTTOM NAV ---- */}
          <nav className="lg:hidden flex-shrink-0 border-t border-foreground/10 bg-card/80 backdrop-blur-xl safe-bottom">
            <div className="flex items-center justify-around h-16 px-1">
              {TABS.slice(0, 5).map(({ id }) => {
                const isActive = tab === id;
                const Icon = HubTabIcons[id];
                return (
                  <button
                    key={id}
                    onClick={() => navigate(id)}
                    className={cn("flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-colors min-w-0 flex-1", isActive ? "text-primary" : "text-muted-foreground")}
                  >
                    <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
                    <span className={cn("text-[10px] leading-tight truncate max-w-full", isActive && "font-semibold")}>{TAB_LABELS[id].split(" ")[0]}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg text-muted-foreground min-w-0 flex-1 transition-colors"
              >
                <Menu className="w-5 h-5" />
                <span className="text-[10px] leading-tight">Más</span>
              </button>
            </div>
          </nav>

          {/* ---- SHEET ---- */}
          {sheet && <>
            <div className="overlay" onClick={() => setSheet(null)} />
            <div className="sheet">
              <SheetContent sheet={sheet} onClose={() => setSheet(null)} onToast={showToast} onNavigate={navigate} onOpenSheet={openSheet} onConfirm={(msg, onYes) => setConfirm({ msg, onYes })} />
            </div>
          </>}

          {/* ---- TOAST ---- */}
          {toast && (
            <div className={`toast ${toast.undo ? "action" : ""}`}>
              {toast.msg}
              {toast.undo && <button className="undo" onClick={() => { toast.undo!(); setToast(null); setTimeout(() => showToast("Elemento restaurado"), 200); }}>Deshacer</button>}
            </div>
          )}

          {/* ---- IMPORTANDO ---- */}
          {importing && (
            <div className="toast">Importando respaldo… esto puede tardar unos segundos</div>
          )}

          {/* ---- CONFIRM MODAL ---- */}
          {confirm && (
            <div className="cmodal" onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
              <div className="cbox">
                <p>{confirm.msg}</p>
                <div className="crow">
                  <button onClick={() => setConfirm(null)}>Cancelar</button>
                  <button className="yes" onClick={() => { confirm.onYes(); setConfirm(null); }}>Confirmar</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ======= RIGHT SIDEBAR (same aesthetics as main Layout) ======= */}
        <aside className="hidden lg:flex w-64 flex-shrink-0 border-l border-foreground/10 bg-card/60 backdrop-blur-xl flex-col relative z-20">

          {/* Logo + Brand */}
          <div className="h-16 flex items-center px-5 border-b border-foreground/10">
            <img src="/icon-192.png" alt="Logo" className="w-7 h-7 rounded-lg mr-3 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display font-bold text-[17px] tracking-tight leading-none text-gradient">
                WebMaker<span className="text-primary">Hub</span>
              </h1>
              <p className="text-[8.5px] text-muted-foreground tracking-[0.15em] uppercase leading-none mt-1">Ejecutivo · Latam</p>
            </div>
          </div>

          {/* + Nuevo button */}
          <div className="px-3 pt-4 pb-1">
            <button
              onClick={handleNew}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-primary/90 to-orange-500/80 text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Nuevo
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
            {TABS.map(({ id, cnt }) => {
              const isActive = tab === id;
              const Icon = HubTabIcons[id];
              return (
                <button
                  key={id}
                  onClick={() => navigate(id)}
                  className={cn(
                    "flex items-center w-full px-3 py-3 rounded-xl transition-colors group relative",
                    isActive
                      ? "text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="hub-active-nav"
                      className="absolute inset-0 bg-gradient-to-r from-primary/90 to-orange-500/80 rounded-xl shadow-lg shadow-primary/20"
                      initial={false}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <Icon className={cn("w-5 h-5 mr-3 relative z-10 flex-shrink-0", isActive ? "text-white" : "group-hover:text-primary transition-colors")} />
                  <span className="relative z-10 flex-1 text-left text-sm">{TAB_LABELS[id]}</span>
                  {cnt !== undefined && cnt > 0 && (
                    <span className={cn("relative z-10 text-[10px] px-1.5 py-0.5 rounded-full font-mono", isActive ? "bg-white/20 text-white" : "bg-foreground/10 text-muted-foreground")}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Footer: user + export/import + logout + back */}
          <div className="p-4 border-t border-foreground/10 space-y-3">
            {authUser && (
              <div className="flex items-center gap-3 px-1">
                {authUser.picture ? (
                  <img src={authUser.picture} alt={authUser.name || ""} className="w-8 h-8 rounded-full border border-foreground/15 flex-shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {(authUser.name || authUser.email || "?")[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{authUser.name || "Admin"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{authUser.email}</p>
                </div>
                <ThemeToggle />
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={handleExport}
                className="flex-1 flex items-center justify-center px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/10 rounded-lg transition-colors"
              >
                ↓ Exportar
              </button>
              {isAdmin && (
                <button
                  onClick={() => importRef.current?.click()}
                  disabled={importing}
                  className="flex-1 flex items-center justify-center px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? "Importando…" : "↑ Importar"}
                </button>
              )}
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleLogout}
                className="flex items-center flex-1 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2.5" />
                Cerrar sesión
              </button>
              <Link
                href="/"
                title="Volver al panel"
                className="flex items-center justify-center px-2.5 py-2.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </aside>

      </div>
    </>
  );
}
