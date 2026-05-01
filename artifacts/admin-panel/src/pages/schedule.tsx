import { useEffect, useMemo, useState } from "react";
import { useCheckScheduledVideos, useListVideos } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Play,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  Calendar as CalendarIcon,
  Plus,
} from "lucide-react";
import { motion } from "framer-motion";
import { NetworkIcon, NETWORK_BG, type Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtRange(from: Date, to: Date): string {
  const f = from.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  const t = to.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
  return `${f} – ${t}`;
}

type VideoSummary = {
  id: number;
  title?: string;
  description?: string;
  scheduledAt?: string | Date | null;
  coverImageBase64?: string | null;
  coverMimeType?: string | null;
  videoFileDriveId?: string | null;
  driveFileId?: string | null;
  tiktokDescription?: string | null;
  instagramDescription?: string | null;
  youtubeDescription?: string | null;
  linkedinDescription?: string | null;
  facebookDescription?: string | null;
  youtubeStatus?: string | null;
  tiktokStatus?: string | null;
  instagramStatus?: string | null;
  linkedinStatus?: string | null;
  linkedinError?: string | null;
  xStatus?: string | null;
  xError?: string | null;
  facebookStatus?: string | null;
  facebookError?: string | null;
};

// A network is "targeted" by a post when its per-platform status is set and
// not explicitly "skipped" (the value used by the scheduler to opt out of a
// network). Pending posts must still surface their target icons so the
// scheduled card and filters reflect *intent*, not just publish progress.
function videoNetworks(v: VideoSummary): { network: Network; status?: string; error?: string }[] {
  return [
    { network: "youtube" as const, status: v.youtubeStatus ?? undefined },
    { network: "tiktok" as const, status: v.tiktokStatus ?? undefined },
    { network: "instagram" as const, status: v.instagramStatus ?? undefined },
    { network: "linkedin" as const, status: v.linkedinStatus ?? undefined, error: v.linkedinError ?? undefined },
    { network: "x" as const, status: v.xStatus ?? undefined, error: v.xError ?? undefined },
    { network: "facebook" as const, status: v.facebookStatus ?? undefined, error: v.facebookError ?? undefined },
  ].filter((n) => n.status && n.status !== "skipped");
}

function caption(v: VideoSummary): string {
  return (
    v.tiktokDescription ||
    v.instagramDescription ||
    v.youtubeDescription ||
    v.linkedinDescription ||
    v.facebookDescription ||
    v.description ||
    ""
  ).split("\n")[0];
}

function coverSrc(v: VideoSummary): string | null {
  if (v.coverImageBase64 && v.coverMimeType) {
    return `data:${v.coverMimeType};base64,${v.coverImageBase64}`;
  }
  return null;
}

function statusColor(status?: string): string {
  if (status === "published") return "ring-emerald-500/40";
  if (status === "uploaded") return "ring-blue-500/40";
  if (status === "error") return "ring-rose-500/40";
  return "ring-white/5";
}

function aggregateStatus(v: VideoSummary): "published" | "uploaded" | "error" | "scheduled" {
  const nets = videoNetworks(v);
  if (nets.some((n) => n.status === "error")) return "error";
  const live = nets.filter((n) => n.status && n.status !== "pending");
  if (live.length > 0 && nets.every((n) => n.status === "published")) return "published";
  if (live.length > 0) return "uploaded";
  return "scheduled";
}

type StatusFilter = "all" | "scheduled" | "uploaded" | "published" | "error";
type NetworkFilter = "all" | Network;
type TypeFilter = "all" | "video" | "single_network" | "multi_network";

const NETWORK_FILTER_OPTIONS: { value: NetworkFilter; label: string }[] = [
  { value: "all", label: "Todas las redes" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "facebook", label: "Facebook" },
];

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Cualquier estado" },
  { value: "scheduled", label: "Programado" },
  { value: "uploaded", label: "Subido" },
  { value: "published", label: "Publicado" },
  { value: "error", label: "Error" },
];

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Todos los tipos" },
  { value: "video", label: "Video" },
  { value: "single_network", label: "Una red" },
  { value: "multi_network", label: "Multi-red" },
];

function videoType(v: VideoSummary): "video" | "single_network" | "multi_network" {
  const nets = videoNetworks(v);
  if (nets.length > 1) return "multi_network";
  return v.videoFileDriveId || v.driveFileId ? "video" : "single_network";
}

export default function SchedulePage() {
  const { data: videos } = useListVideos();
  const checkSchedule = useCheckScheduledVideos();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const [me, setMe] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ id?: number; email?: string; name?: string }>) : null))
      .then((d) => {
        if (d?.id) {
          setMe({
            id: d.id,
            name: String(d.name || d.email || "Yo").split(" ")[0],
          });
        }
      })
      .catch((err) => {
        console.warn("[schedule] auth/me failed:", err?.message ?? err);
      });
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (videos || []).filter((v: VideoSummary) => {
      if (!v.scheduledAt) return false;
      if (q && !v.title?.toLowerCase().includes(q) && !caption(v).toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter !== "all" && aggregateStatus(v) !== statusFilter) return false;
      if (networkFilter !== "all") {
        const nets = videoNetworks(v).map((n) => n.network);
        if (!nets.includes(networkFilter)) return false;
      }
      if (typeFilter !== "all" && videoType(v) !== typeFilter) return false;
      // memberFilter: the API list is already scoped by current user; this is a
      // visual control consistent with future multi-member support.
      return true;
    });
  }, [videos, search, statusFilter, networkFilter, typeFilter, memberFilter]);

  const videosByDay = useMemo(() => {
    const buckets: Record<string, VideoSummary[]> = {};
    days.forEach((d) => (buckets[d.toDateString()] = []));
    filteredVideos.forEach((v: VideoSummary) => {
      const d = new Date(v.scheduledAt!);
      const key = new Date(d).toDateString();
      if (key in buckets) buckets[key].push(v);
    });
    Object.values(buckets).forEach((arr) =>
      arr.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()),
    );
    return buckets;
  }, [filteredVideos, days]);

  const totalThisWeek = Object.values(videosByDay).reduce((acc, arr) => acc + arr.length, 0);
  const today = new Date().toDateString();
  const selectedDate = selectedDay !== null ? days[selectedDay] : null;
  const selectedVideos = selectedDate ? videosByDay[selectedDate.toDateString()] || [] : [];

  const dateInputValue = useMemo(() => {
    const d = weekStart;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [weekStart]);

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Publicaciones</h1>
            <p className="text-muted-foreground text-sm sm:text-lg">
              Vista semanal de tus publicaciones programadas en todas las redes.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="inline-flex items-center gap-1.5 glass-card rounded-xl border border-white/5 px-3 py-2 text-xs font-medium text-primary"
              aria-label="Vista actual: semanal"
              title="Vista semanal"
            >
              <CalendarIcon className="w-4 h-4" />
              Vista semanal
            </div>
            <div className="flex items-center gap-1 glass-card rounded-xl border border-white/5 p-1">
              <button
                onClick={() => {
                  setWeekStart(addDays(weekStart, -7));
                  setSelectedDay(null);
                }}
                className="p-2 rounded-lg hover:bg-white/5 transition"
                aria-label="Semana anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setWeekStart(startOfWeek(new Date()));
                  setSelectedDay(null);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-white/5 transition"
              >
                Hoy
              </button>
              <button
                onClick={() => {
                  setWeekStart(addDays(weekStart, 7));
                  setSelectedDay(null);
                }}
                className="p-2 rounded-lg hover:bg-white/5 transition"
                aria-label="Semana siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <label className="flex items-center gap-2 glass-card rounded-xl border border-white/5 px-3 py-2 cursor-pointer hover:border-primary/40 transition">
              <CalendarIcon className="w-4 h-4 text-primary" />
              <input
                type="date"
                value={dateInputValue}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  setWeekStart(startOfWeek(new Date(y, m - 1, d)));
                  setSelectedDay(null);
                }}
                className="bg-transparent border-none outline-none text-sm text-foreground"
              />
            </label>

            <button
              onClick={() => checkSchedule.mutate()}
              disabled={checkSchedule.isPending}
              className="flex items-center px-4 py-2 bg-primary hover:bg-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/25 transition disabled:opacity-50"
            >
              <Play className={`w-4 h-4 mr-2 ${checkSchedule.isPending ? "animate-pulse" : ""}`} />
              {checkSchedule.isPending ? "Procesando..." : "Ejecutar Cola"}
            </button>
          </div>
        </header>

        <div className="glass-card rounded-2xl border border-white/5 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar posts por título o descripción…"
              className="bg-transparent border-none outline-none text-sm flex-1 placeholder:text-muted-foreground/60"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="bg-background/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
            aria-label="Filtrar por tipo"
          >
            {TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className="bg-background/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
            aria-label="Filtrar por miembro"
          >
            <option value="all">Todos los miembros</option>
            {me && <option value={String(me.id)}>{me.name}</option>}
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
              showFilters || statusFilter !== "all" || networkFilter !== "all"
                ? "bg-primary/20 text-primary"
                : "border border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Más filtros
            {(statusFilter !== "all" || networkFilter !== "all") && (
              <span className="ml-1 inline-flex items-center justify-center text-[10px] bg-primary text-primary-foreground rounded-full w-4 h-4">
                {(statusFilter !== "all" ? 1 : 0) + (networkFilter !== "all" ? 1 : 0)}
              </span>
            )}
          </button>
          {showFilters && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="bg-background/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={networkFilter}
                onChange={(e) => setNetworkFilter(e.target.value as NetworkFilter)}
                className="bg-background/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
              >
                {NETWORK_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-bold">{fmtRange(weekStart, weekEnd)}</h2>
          <span className="text-xs text-muted-foreground">
            {totalThisWeek} publicación{totalThisWeek === 1 ? "" : "es"} esta semana
          </span>
        </div>

        {checkSchedule.data && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4"
          >
            <h3 className="text-emerald-400 font-bold flex items-center mb-1 text-sm">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Cola procesada
            </h3>
            <p className="text-emerald-400/80 text-xs">
              Procesados: {checkSchedule.data.processed} · Errores: {checkSchedule.data.errors}
            </p>
          </motion.div>
        )}

        <div className="glass-card rounded-3xl border border-white/5 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-white/5">
              {days.map((d, i) => {
                const isToday = d.toDateString() === today;
                const isSelected = selectedDay === i;
                const count = videosByDay[d.toDateString()]?.length || 0;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(isSelected ? null : i)}
                    className={`flex flex-col items-center justify-center py-3 px-2 border-r border-white/5 last:border-r-0 transition ${
                      isSelected ? "bg-primary/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{DAYS_ES[i]}</span>
                    <span
                      className={`mt-1 inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-sm font-bold ${
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {count > 0 && <span className="mt-1 text-[10px] text-muted-foreground">{count} pub</span>}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-7 max-h-[60vh] overflow-y-auto">
              {days.map((d, i) => {
                const items = videosByDay[d.toDateString()] || [];
                const isToday = d.toDateString() === today;
                return (
                  <div
                    key={i}
                    className={`min-h-[300px] border-r border-white/5 last:border-r-0 p-2 space-y-2 ${
                      isToday ? "bg-primary/[0.03]" : ""
                    }`}
                  >
                    {items.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/40 py-8">
                        —
                      </div>
                    ) : (
                      items.map((v: VideoSummary) => {
                        const dt = new Date(v.scheduledAt!);
                        const time = dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
                        const nets = videoNetworks(v);
                        const cover = coverSrc(v);
                        const cap = caption(v);
                        const agg = aggregateStatus(v);
                        return (
                          <motion.div
                            layout
                            key={v.id}
                            className={`rounded-lg bg-white/5 border border-white/5 p-2 text-xs ring-1 overflow-hidden ${statusColor(
                              agg,
                            )} hover:bg-white/10 cursor-pointer transition`}
                            onClick={() => setSelectedDay(i)}
                            title={v.title}
                          >
                            {cover ? (
                              <div className="aspect-video rounded-md overflow-hidden bg-black/40 mb-1.5">
                                <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-mono text-[10px] text-primary font-bold">{time}</span>
                              <div className="flex -space-x-1">
                                {nets.slice(0, 4).map((n) => (
                                  <span
                                    key={n.network}
                                    className={`w-4 h-4 rounded-full flex items-center justify-center ring-1 ring-background ${NETWORK_BG[n.network]}`}
                                  >
                                    <NetworkIcon network={n.network} className="w-2.5 h-2.5" />
                                  </span>
                                ))}
                                {nets.length > 4 && (
                                  <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[8px] ring-1 ring-background">
                                    +{nets.length - 4}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="line-clamp-2 leading-tight font-medium text-[11px]">{v.title}</p>
                            {cap && (
                              <p className="line-clamp-1 leading-tight text-[10px] text-muted-foreground mt-0.5">{cap}</p>
                            )}
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl border border-white/5 overflow-hidden"
          >
            <div className="p-4 border-b border-white/5 flex items-center">
              <CalendarClock className="w-5 h-5 text-primary mr-2" />
              <h2 className="text-lg font-bold">
                {selectedDate.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <span className="ml-auto bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-medium">
                {selectedVideos.length} pub{selectedVideos.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="p-4 space-y-3">
              {selectedVideos.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Sin publicaciones este día.</p>
                </div>
              ) : (
                selectedVideos.map((v: VideoSummary) => {
                  const nets = videoNetworks(v);
                  const dt = new Date(v.scheduledAt!);
                  const cover = coverSrc(v);
                  return (
                    <div
                      key={v.id}
                      className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 bg-white/5 rounded-2xl border border-white/5"
                    >
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          className="w-full sm:w-32 sm:h-20 h-32 object-cover rounded-lg border border-white/5 flex-shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-primary font-bold">
                            {dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <h4 className="font-semibold truncate">{v.title}</h4>
                        </div>
                        {v.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{v.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {nets.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">Sin red configurada</span>
                          ) : (
                            nets.map((n) => (
                              <span
                                key={n.network}
                                title={n.error || `${n.network}: ${n.status}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                  n.status === "published"
                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                    : n.status === "uploaded"
                                    ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                    : n.status === "error"
                                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                    : "bg-white/10 text-muted-foreground border-white/10"
                                }`}
                              >
                                <span className={`w-3 h-3 rounded-full flex items-center justify-center ${NETWORK_BG[n.network]}`}>
                                  <NetworkIcon network={n.network} className="w-2 h-2" />
                                </span>
                                {n.status}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </div>

      <Link
        to="/videos"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground font-medium shadow-2xl shadow-primary/40 hover:bg-orange-400 hover:scale-105 transition"
        title="Crear nueva publicación"
      >
        <Plus className="w-5 h-5" />
        <span className="hidden sm:inline">Crear publicación</span>
      </Link>
    </Layout>
  );
}
