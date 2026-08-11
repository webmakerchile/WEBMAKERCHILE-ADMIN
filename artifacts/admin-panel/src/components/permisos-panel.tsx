import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ChevronDown,
  Loader2,
  Save,
  Lock,
  LayoutDashboard,
  CheckSquare2,
  ClipboardList,
  CalendarClock,
  Users2,
  Video,
  BarChart3,
  Image as ImageIcon,
  Sparkles,
  MessageSquareText,
  Clapperboard,
  AudioLines,
  FolderTree,
  Library,
  Scissors,
  Share2,
  Megaphone,
  Target,
  Ticket as TicketIcon,
  ListChecks,
  Receipt,
  TrendingUp,
  IdCard,
  LayoutGrid,
  Gauge,
  Briefcase,
  Building2,
  Handshake,
  HandCoins,
  Package,
  FileCheck2,
  CalendarDays,
  FileText,
  Activity,
  Clock3,
  HardDrive,
  Landmark,
  UserCog,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { useLang, type Translations } from "@/lib/lang";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLES, SECTION_CATALOG, SECTION_GROUPS, type SectionGroup, type TeamRole } from "@workspace/roles";
import { ROLE_STYLE } from "@/components/role-controls";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Ícono y etiqueta de cada sección. Debe reflejar los mismos ítems que
 * `allRoleSections` en layout.tsx — es la contraparte visual del catálogo
 * compartido (`SECTION_CATALOG` en @workspace/roles), que es quien manda en
 * qué rutas existen y a qué grupo pertenecen.
 */
const SECTION_META: Record<string, { icon: LucideIcon; label: (t: Translations) => string }> = {
  "/": { icon: LayoutDashboard, label: (t) => t.navHome },
  "/mi-dia": { icon: CheckSquare2, label: (t) => t.navMyDay },
  "/mis-pendientes": { icon: ClipboardList, label: (t) => t.navMisPendientes },
  "/schedule": { icon: CalendarClock, label: (t) => t.navPosts },
  "/cuentas": { icon: Users2, label: (t) => t.navAccounts },
  "/videos": { icon: Video, label: (t) => t.navVideos },
  "/insights": { icon: BarChart3, label: (t) => t.navInsights },
  "/cover": { icon: ImageIcon, label: (t) => t.navCovers },
  "/historias": { icon: Sparkles, label: (t) => t.navStories },
  "/descripciones": { icon: MessageSquareText, label: (t) => t.navDescriptions },
  "/estudio": { icon: Clapperboard, label: (t) => t.navStudio },
  "/transcriptor": { icon: AudioLines, label: (t) => t.navTranscriber },
  "/drive": { icon: FolderTree, label: (t) => t.navDrive },
  "/biblioteca": { icon: Library, label: (t) => t.navLibrary },
  "/edicion": { icon: Scissors, label: (t) => t.navEdicion },
  "/redes": { icon: Share2, label: (t) => t.navRedes },
  "/marketing": { icon: Megaphone, label: (t) => t.navMarketing },
  "/metas": { icon: Target, label: (t) => t.navMetas },
  "/tickets": { icon: TicketIcon, label: (t) => t.navTickets },
  "/mis-tareas": { icon: ListChecks, label: (t) => t.navMyTasks },
  "/reportes": { icon: Receipt, label: (t) => t.navReports },
  "/proyecciones": { icon: TrendingUp, label: (t) => t.navProyecciones },
  "/rrhh": { icon: IdCard, label: (t) => t.navHr },
  "/dashboard-ejecutivo": { icon: LayoutGrid, label: (t) => t.navHubDash },
  "/torre-ceo": { icon: Gauge, label: (t) => t.navHubTorre },
  "/proyectos": { icon: Briefcase, label: (t) => t.navHubProj },
  "/clientes": { icon: Building2, label: (t) => t.navHubClients },
  "/ventas": { icon: Handshake, label: (t) => t.navHubVentas },
  "/cobros": { icon: HandCoins, label: (t) => t.navHubCobros },
  "/servicios": { icon: Package, label: (t) => t.navHubSvc },
  "/contratos": { icon: FileCheck2, label: (t) => t.navHubContracts },
  "/reuniones": { icon: CalendarDays, label: (t) => t.navHubMeet },
  "/notas": { icon: FileText, label: (t) => t.navHubNotes },
  "/equipo-hoy": { icon: Activity, label: (t) => t.navHubTeam },
  "/asistencia": { icon: Clock3, label: (t) => t.navHubAtt },
  "/drive-hub": { icon: HardDrive, label: (t) => t.navHubDrive },
  "/agencia": { icon: Landmark, label: (t) => t.navAgencia },
  "/equipo": { icon: UserCog, label: (t) => t.navTeam },
  "/ayuda": { icon: HelpCircle, label: (t) => t.navHelp },
};

const GROUP_LABEL: Record<SectionGroup, (t: Translations) => string> = {
  contenido: (t) => t.navSectionContent,
  herramientas: (t) => t.navSectionTools,
  area: (t) => t.navSectionAreas,
  hub: (t) => t.navSectionHub,
  administracion: (t) => t.navSectionAdmin,
};

type RolePermission = { role: TeamRole; label: string; home: string; routes: string[] };
type PermissionsResponse = { roles: RolePermission[] };

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export function PermisosPanel({ showToast }: { showToast: (msg: string, type: "ok" | "err") => void }) {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<TeamRole | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<TeamRole, string[]>>>({});

  const { data, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ["role-permissions"],
    queryFn: () => apiFetch("/role-permissions"),
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: ({ role, routes }: { role: TeamRole; routes: string[] }) =>
      apiFetch(`/role-permissions/${role}`, { method: "PUT", body: JSON.stringify({ routes }) }),
    onSuccess: (_result, { role }) => {
      showToast(t.permisosSaved.replace("{role}", ROLES[role].label), "ok");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    },
    onError: (e: Error) => showToast(e.message || t.permisosSaveError, "err"),
  });

  const groupedSections = useMemo(
    () =>
      SECTION_GROUPS.map((group) => ({
        group,
        items: SECTION_CATALOG.filter((s) => s.group === group),
      })).filter((g) => g.items.length > 0),
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/50 border border-foreground/10 rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-foreground/10">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">{t.permisosTitle}</p>
          <p className="text-xs text-muted-foreground">{t.permisosSubtitle}</p>
        </div>
      </div>

      <div className="divide-y divide-foreground/10">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_STYLE.ceo}`}>
            {ROLES.ceo.label}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" /> {t.permisosFullAccess}
          </span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t.permisosLoading}</span>
          </div>
        )}

        {(data?.roles ?? []).map((r) => {
          const isOpen = expanded === r.role;
          const draft = drafts[r.role] ?? r.routes;
          const dirty = !sameSet(draft, r.routes);
          const saving = saveMut.isPending && saveMut.variables?.role === r.role;

          const toggleSection = (path: string) => {
            if (path === r.home) return;
            setDrafts((prev) => {
              const cur = prev[r.role] ?? r.routes;
              const next = cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path];
              return { ...prev, [r.role]: next };
            });
          };

          return (
            <div key={r.role}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : r.role)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/5 transition-colors text-left"
              >
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_STYLE[r.role]}`}>
                  {r.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.routes.length} / {SECTION_CATALOG.length} {t.permisosSections}
                </span>
                {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={t.permisosUnsaved} />}
                <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-4">
                      {groupedSections.map(({ group, items }) => (
                        <div key={group}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            {GROUP_LABEL[group](t)}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                            {items.map((item) => {
                              const meta = SECTION_META[item.path];
                              if (!meta) return null;
                              const Icon = meta.icon;
                              const isHome = item.path === r.home;
                              const checked = isHome || draft.includes(item.path);
                              return (
                                <label
                                  key={item.path}
                                  className={`flex items-center gap-2 text-sm py-1 ${isHome ? "opacity-70" : "cursor-pointer"}`}
                                >
                                  <Checkbox checked={checked} disabled={isHome} onCheckedChange={() => toggleSection(item.path)} />
                                  <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                  <span>{meta.label(t)}</span>
                                  {isHome && <span className="text-[10px] text-muted-foreground">({t.permisosHome})</span>}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          disabled={!dirty || saving}
                          onClick={() => saveMut.mutate({ role: r.role, routes: draft })}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {t.permisosSave}
                        </button>
                        {dirty && !saving && (
                          <button
                            type="button"
                            onClick={() => setDrafts((prev) => ({ ...prev, [r.role]: r.routes }))}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {t.permisosDiscard}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
