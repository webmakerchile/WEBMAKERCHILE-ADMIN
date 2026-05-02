import { useEffect, useMemo, useRef, useState } from "react";
import { useCheckScheduledVideos, useListVideos } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  LayoutGrid,
  Plus,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { EmptyState } from "@/components/empty-state";
import { NetworkIcon, NETWORK_BG, NETWORK_LABELS, type Network } from "@/components/social-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

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

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function fmtMonth(date: Date): string {
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

type ViewMode = "week" | "month";

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
  return "ring-foreground/10";
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

const ALL_NETWORKS: Network[] = ["youtube", "instagram", "tiktok", "linkedin", "x", "facebook"];

const VIDEOS_QUERY_KEY = ["/api/content/videos"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildScheduledAt(day: Date, hour: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hour);
  const h = m ? Math.min(23, Math.max(0, Number(m[1]))) : 9;
  const mm = m ? Math.min(59, Math.max(0, Number(m[2]))) : 0;
  const d = new Date(day);
  d.setHours(h, mm, 0, 0);
  return d.toISOString();
}

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("view") === "month" ? "month" : "week";
  });
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [monthStart, setMonthStart] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [quickCreateDate, setQuickCreateDate] = useState<Date | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const draggingIdRef = useRef<number | null>(null);

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, scheduledAt }: { id: number; scheduledAt: string }) => {
      const res = await fetch(`${API_BASE}/content/videos/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onMutate: async ({ id, scheduledAt }) => {
      await queryClient.cancelQueries({ queryKey: VIDEOS_QUERY_KEY });
      const prev = queryClient.getQueryData<VideoSummary[]>(VIDEOS_QUERY_KEY) || [];
      queryClient.setQueryData<VideoSummary[]>(VIDEOS_QUERY_KEY, (old) =>
        (old || []).map((v) => (v.id === id ? { ...v, scheduledAt } : v)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(VIDEOS_QUERY_KEY, ctx.prev);
      toast({ title: "No se pudo mover la publicación", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Publicación reprogramada" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: VIDEOS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
  });

  const quickCreateMutation = useMutation({
    mutationFn: async (input: {
      title: string;
      description: string;
      day: Date;
      hour: string;
      networks: Network[];
    }) => {
      const createRes = await fetch(`${API_BASE}/content/videos`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.title, description: input.description }),
      });
      if (!createRes.ok) throw new Error(`HTTP ${createRes.status} al crear`);
      const created = await createRes.json();

      const scheduledAt = buildScheduledAt(input.day, input.hour);
      const patchBody: Record<string, unknown> = {
        status: "scheduled",
        scheduledAt,
      };
      for (const net of input.networks) {
        patchBody[`${net}Status`] = "pending";
      }
      const patchRes = await fetch(`${API_BASE}/content/videos/${created.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) throw new Error(`HTTP ${patchRes.status} al programar`);
      return patchRes.json();
    },
    onSuccess: () => {
      toast({ title: "Publicación programada" });
      setQuickCreateDate(null);
      queryClient.invalidateQueries({ queryKey: VIDEOS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err) => {
      const description = err instanceof Error ? err.message : "Inténtalo de nuevo";
      toast({
        title: "No se pudo crear la publicación",
        description,
        variant: "destructive",
      });
    },
  });

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

  // Month grid: pad with days from prev/next month so grid starts on Monday
  const monthGridDays = useMemo(() => {
    const first = startOfMonth(monthStart);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const totalDays = lastDay.getDate();
    // getDay() returns 0=Sunday..6=Saturday; we want 0=Monday
    const startDow = (first.getDay() + 6) % 7; // offset to Mon-start
    const endDow = (lastDay.getDay() + 6) % 7;
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = startDow - 1; i >= 0; i--) {
      cells.push({ date: addDays(first, -(i + 1)), inMonth: false });
    }
    for (let i = 0; i < totalDays; i++) {
      cells.push({ date: addDays(first, i), inMonth: true });
    }
    const trailing = endDow === 6 ? 0 : 6 - endDow;
    for (let i = 1; i <= trailing; i++) {
      cells.push({ date: addDays(lastDay, i), inMonth: false });
    }
    return cells;
  }, [monthStart]);

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

  const videosByMonthDay = useMemo(() => {
    const buckets: Record<string, VideoSummary[]> = {};
    filteredVideos.forEach((v: VideoSummary) => {
      if (!v.scheduledAt) return;
      const key = new Date(v.scheduledAt).toDateString();
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(v);
    });
    return buckets;
  }, [filteredVideos]);

  const totalThisWeek = Object.values(videosByDay).reduce((acc, arr) => acc + arr.length, 0);
  const totalThisMonth = Object.entries(videosByMonthDay).reduce((acc, [key, arr]) => {
    const d = new Date(key);
    return d.getMonth() === monthStart.getMonth() && d.getFullYear() === monthStart.getFullYear()
      ? acc + arr.length
      : acc;
  }, 0);
  const today = new Date().toDateString();
  const selectedDate = selectedDay !== null ? days[selectedDay] : null;
  const selectedVideos = selectedDate ? videosByDay[selectedDate.toDateString()] || [] : [];

  const switchView = (v: ViewMode) => {
    setView(v);
    setSelectedDay(null);
    const url = new URL(window.location.href);
    if (v === "month") url.searchParams.set("view", "month");
    else url.searchParams.delete("view");
    window.history.replaceState({}, "", url.toString());
  };

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
              {view === "month"
                ? "Vista mensual de tus publicaciones programadas."
                : "Vista semanal de tus publicaciones programadas en todas las redes."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 glass-card rounded-xl border border-foreground/10 p-1">
              <button
                onClick={() => switchView("week")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  view === "week" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Semana
              </button>
              <button
                onClick={() => switchView("month")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  view === "month" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Mes
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1 glass-card rounded-xl border border-foreground/10 p-1">
              <button
                onClick={() => {
                  if (view === "month") setMonthStart(addMonths(monthStart, -1));
                  else { setWeekStart(addDays(weekStart, -7)); setSelectedDay(null); }
                }}
                className="p-2 rounded-lg hover:bg-foreground/5 transition"
                aria-label="Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (view === "month") setMonthStart(startOfMonth(new Date()));
                  else { setWeekStart(startOfWeek(new Date())); setSelectedDay(null); }
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-foreground/5 transition"
              >
                Hoy
              </button>
              <button
                onClick={() => {
                  if (view === "month") setMonthStart(addMonths(monthStart, 1));
                  else { setWeekStart(addDays(weekStart, 7)); setSelectedDay(null); }
                }}
                className="p-2 rounded-lg hover:bg-foreground/5 transition"
                aria-label="Siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {view === "week" && (
              <label className="flex items-center gap-2 glass-card rounded-xl border border-foreground/10 px-3 py-2 cursor-pointer hover:border-primary/40 transition">
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
            )}

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

        <div className="glass-card rounded-2xl border border-foreground/10 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
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
            className="bg-background/60 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs"
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
            className="bg-background/60 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs"
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
                : "border border-foreground/10 text-muted-foreground hover:text-foreground"
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
                className="bg-background/60 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs"
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
                className="bg-background/60 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs"
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
          <h2 className="text-lg font-display font-bold capitalize">
            {view === "month" ? fmtMonth(monthStart) : fmtRange(weekStart, weekEnd)}
          </h2>
          <span className="text-xs text-muted-foreground">
            {view === "month"
              ? `${totalThisMonth} publicación${totalThisMonth === 1 ? "" : "es"} este mes`
              : `${totalThisWeek} publicación${totalThisWeek === 1 ? "" : "es"} esta semana`}
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

        {view === "month" ? (
          <MonthView
            monthGridDays={monthGridDays}
            videosByDay={videosByMonthDay}
            today={today}
            monthStart={monthStart}
            onDayClick={(date) => {
              switchView("week");
              setWeekStart(startOfWeek(date));
            }}
          />
        ) : (<>

        <div className="glass-card rounded-3xl border border-foreground/10 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-foreground/10">
              {days.map((d, i) => {
                const isToday = d.toDateString() === today;
                const isSelected = selectedDay === i;
                const count = videosByDay[d.toDateString()]?.length || 0;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(isSelected ? null : i)}
                    className={`flex flex-col items-center justify-center py-3 px-2 border-r border-foreground/10 last:border-r-0 transition ${
                      isSelected ? "bg-primary/10" : "hover:bg-foreground/5"
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
                const dayKey = d.toDateString();
                const isDragOver = dragOverKey === dayKey;
                return (
                  <div
                    key={i}
                    className={`group relative min-h-[300px] border-r border-foreground/10 last:border-r-0 p-2 space-y-2 transition ${
                      isToday ? "bg-primary/[0.03]" : ""
                    } ${isDragOver ? "bg-primary/15 ring-1 ring-primary/40" : ""}`}
                    onDragOver={(e) => {
                      if (draggingIdRef.current != null) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverKey !== dayKey) setDragOverKey(dayKey);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverKey === dayKey) setDragOverKey(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverKey(null);
                      const raw = e.dataTransfer.getData("text/plain");
                      const id = Number(raw);
                      if (!Number.isFinite(id)) return;
                      const list = (videos || []) as VideoSummary[];
                      const v = list.find((x) => x.id === id);
                      if (!v?.scheduledAt) return;
                      const old = new Date(v.scheduledAt);
                      const next = new Date(d);
                      next.setHours(old.getHours(), old.getMinutes(), 0, 0);
                      if (next.getTime() === old.getTime()) return;
                      rescheduleMutation.mutate({ id, scheduledAt: next.toISOString() });
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setQuickCreateDate(d)}
                      className="absolute top-1 right-1 z-10 inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/15 text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/25 focus:opacity-100 transition"
                      aria-label={`Nueva publicación el ${d.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`}
                      title="Crear publicación rápida"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {items.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => setQuickCreateDate(d)}
                        className="w-full h-full min-h-[260px] flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground/40 hover:text-primary hover:bg-foreground/5 rounded-lg transition"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Agregar</span>
                      </button>
                    ) : (
                      items.map((v: VideoSummary) => {
                        const dt = new Date(v.scheduledAt!);
                        const time = dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
                        const nets = videoNetworks(v);
                        const cover = coverSrc(v);
                        const cap = caption(v);
                        const agg = aggregateStatus(v);
                        return (
                          <div
                            key={v.id}
                            draggable
                            onDragStart={(e) => {
                              draggingIdRef.current = v.id;
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", String(v.id));
                            }}
                            onDragEnd={() => {
                              draggingIdRef.current = null;
                              setDragOverKey(null);
                            }}
                            className={`rounded-lg bg-foreground/5 border border-foreground/10 p-2 text-xs ring-1 overflow-hidden ${statusColor(
                              agg,
                            )} hover:bg-foreground/10 cursor-grab active:cursor-grabbing transition`}
                            onClick={() => setSelectedDay(i)}
                            title={`${v.title} — arrastra para mover`}
                          >
                            {cover ? (
                              <div className="aspect-video rounded-md overflow-hidden bg-foreground/[0.05] mb-1.5">
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
                                  <span className="w-4 h-4 rounded-full bg-foreground/10 flex items-center justify-center text-[8px] ring-1 ring-background">
                                    +{nets.length - 4}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="line-clamp-2 leading-tight font-medium text-[11px]">{v.title}</p>
                            {cap && (
                              <p className="line-clamp-1 leading-tight text-[10px] text-muted-foreground mt-0.5">{cap}</p>
                            )}
                          </div>
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
            className="glass-card rounded-3xl border border-foreground/10 overflow-hidden"
          >
            <div className="p-4 border-b border-foreground/10 flex items-center">
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
                <EmptyState
                  icon={AlertCircle}
                  title="Sin publicaciones este día"
                  description="Programa un video desde tu lista para que aparezca en este horario."
                  action={{ label: "Crear publicación", href: "/videos" }}
                  size="sm"
                />
              ) : (
                selectedVideos.map((v: VideoSummary) => {
                  const nets = videoNetworks(v);
                  const dt = new Date(v.scheduledAt!);
                  const cover = coverSrc(v);
                  return (
                    <div
                      key={v.id}
                      className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 bg-foreground/5 rounded-2xl border border-foreground/10"
                    >
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          className="w-full sm:w-32 sm:h-20 h-32 object-cover rounded-lg border border-foreground/10 flex-shrink-0"
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
                                    : "bg-foreground/10 text-muted-foreground border-foreground/10"
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
        </>)}
      </div>

      <Link
        to="/videos"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground font-medium shadow-2xl shadow-primary/40 hover:bg-orange-400 hover:scale-105 transition"
        title="Crear nueva publicación"
      >
        <Plus className="w-5 h-5" />
        <span className="hidden sm:inline">Crear publicación</span>
      </Link>

      <QuickPostModal
        date={quickCreateDate}
        onClose={() => {
          if (!quickCreateMutation.isPending) setQuickCreateDate(null);
        }}
        onSubmit={(values) => quickCreateMutation.mutate(values)}
        isPending={quickCreateMutation.isPending}
      />
    </Layout>
  );
}

function MonthView({
  monthGridDays,
  videosByDay,
  today,
  monthStart,
  onDayClick,
}: {
  monthGridDays: { date: Date; inMonth: boolean }[];
  videosByDay: Record<string, VideoSummary[]>;
  today: string;
  monthStart: Date;
  onDayClick: (date: Date) => void;
}) {
  const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  // Show up to 4 per-publication chips; excess shown as "+N"
  const MAX_CHIPS = 4;

  return (
    <div className="glass-card rounded-3xl border border-foreground/10 overflow-hidden">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-foreground/10 bg-foreground/[0.02]">
        {DOW_LABELS.map((label) => (
          <div key={label} className="py-2 text-center text-[11px] font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      <div className="grid grid-cols-7">
        {monthGridDays.map(({ date, inMonth }, idx) => {
          const key = date.toDateString();
          const isToday = key === today;
          const videos = videosByDay[key] || [];
          const visible = videos.slice(0, MAX_CHIPS);
          const overflow = videos.length - MAX_CHIPS;

          return (
            <button
              key={idx}
              onClick={() => onDayClick(date)}
              className={`min-h-[80px] p-1.5 text-left border-b border-r border-foreground/10 transition hover:bg-foreground/5 focus:outline-none focus:ring-1 focus:ring-primary/40 ${
                !inMonth ? "opacity-30" : ""
              } ${isToday ? "bg-primary/5" : ""}`}
            >
              {/* Day number + count badge */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {date.getDate()}
                </span>
                {videos.length > 0 && (
                  <span className="text-[9px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5 leading-none">
                    {videos.length}
                  </span>
                )}
              </div>

              {/* Per-publication chips (one dot per post, using its first network) */}
              {visible.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mb-0.5">
                  {visible.map((v) => {
                    const nets = videoNetworks(v);
                    const primaryNet = nets[0]?.network;
                    return primaryNet ? (
                      <span
                        key={v.id}
                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ring-1 ring-background ${NETWORK_BG[primaryNet]}`}
                        title={v.title || primaryNet}
                      >
                        <NetworkIcon network={primaryNet} className="w-2 h-2" />
                      </span>
                    ) : (
                      <span
                        key={v.id}
                        className="w-3.5 h-3.5 rounded-full bg-foreground/20 ring-1 ring-background"
                        title={v.title || "Sin red"}
                      />
                    );
                  })}
                  {overflow > 0 && (
                    <span className="w-3.5 h-3.5 rounded-full bg-foreground/10 text-[7px] flex items-center justify-center ring-1 ring-background">
                      +{overflow}
                    </span>
                  )}
                </div>
              )}

              {/* First video title preview */}
              {videos[0] && (
                <p className="text-[9px] leading-tight text-muted-foreground line-clamp-1 mt-0.5">
                  {videos[0].title || "Sin título"}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type QuickPostValues = {
  title: string;
  description: string;
  day: Date;
  hour: string;
  networks: Network[];
};

function QuickPostModal({
  date,
  onClose,
  onSubmit,
  isPending,
}: {
  date: Date | null;
  onClose: () => void;
  onSubmit: (values: QuickPostValues) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hour, setHour] = useState("09:00");
  const [networks, setNetworks] = useState<Network[]>(["instagram", "tiktok"]);

  useEffect(() => {
    if (date) {
      setTitle("");
      setDescription("");
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const defaultHour = isToday
        ? `${pad2(Math.min(23, now.getHours() + 1))}:00`
        : "09:00";
      setHour(defaultHour);
      setNetworks(["instagram", "tiktok"]);
    }
  }, [date]);

  const open = date != null;
  const dayLabel = date
    ? date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
    : "";

  const canSubmit =
    !!date && title.trim().length > 0 && description.trim().length > 0 && networks.length > 0 && !isPending;

  const toggleNetwork = (n: Network) => {
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-lg bg-background border-foreground/10">
        <DialogHeader>
          <DialogTitle>Nueva publicación rápida</DialogTitle>
          <DialogDescription>
            {date ? `Programar para el ${dayLabel}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || !date) return;
            onSubmit({
              title: title.trim(),
              description: description.trim(),
              day: date,
              hour,
              networks,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Promo de viernes"
              className="w-full bg-background/60 border border-foreground/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/60"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Texto base que se usará en cada red…"
              rows={3}
              className="w-full bg-background/60 border border-foreground/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/60 resize-y"
              maxLength={2200}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Hora</label>
            <input
              type="time"
              value={hour}
              onChange={(e) => setHour(e.target.value || "09:00")}
              className="w-full bg-background/60 border border-foreground/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Redes</label>
            <div className="flex flex-wrap gap-2">
              {ALL_NETWORKS.map((n) => {
                const active = networks.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleNetwork(n)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition ${
                      active
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-foreground/5 border-foreground/10 text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={active}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center ${NETWORK_BG[n]}`}>
                      <NetworkIcon network={n} className="w-2.5 h-2.5" />
                    </span>
                    {NETWORK_LABELS[n]}
                  </button>
                );
              })}
            </div>
            {networks.length === 0 && (
              <p className="text-[10px] text-rose-400">Selecciona al menos una red.</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm border border-foreground/10 hover:bg-foreground/5 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-orange-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPending ? "Programando…" : "Programar"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
