import { useEffect, useMemo, useState } from "react";
import { useCheckScheduledVideos, useListVideos } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Play,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Calendar as CalendarIcon,
  CalendarDays,
  LayoutGrid,
  Plus,
  Loader2,
  Clock,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { EmptyState } from "@/components/empty-state";
import { HelpHint } from "@/components/help-hint";
import { CalendarSkeleton } from "@/components/skeletons";
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
const DAYS_LONG_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Conflict window. Configurable at runtime (toolbar dropdown, localStorage).
const CONFLICT_WINDOW_DEFAULT_MIN = 30;
const CONFLICT_WINDOW_OPTIONS = [15, 30, 60, 120] as const;
const CONFLICT_WINDOW_LS_KEY = "schedule.conflictWindowMin";
// Auto-resolve shifts each conflicting post by this offset (slightly > window).
const AUTO_RESOLVE_OFFSET_MIN = 35;

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

function fmtDayLong(date: Date): string {
  return date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

type ViewMode = "day" | "week" | "month";

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

// Group conflicting posts by network: a "conflict" is two or more posts on
// the same network whose scheduled times fall within CONFLICT_WINDOW_MS of
// each other. Returns one entry per cluster.
type ConflictCluster = {
  key: string;
  network: Network;
  videos: { id: number; title?: string; ts: number }[];
};
function detectConflicts(items: VideoSummary[], windowMs: number): ConflictCluster[] {
  const grouped: Partial<Record<Network, { id: number; title?: string; ts: number }[]>> = {};
  for (const v of items) {
    if (!v.scheduledAt) continue;
    const ts = new Date(v.scheduledAt).getTime();
    if (!Number.isFinite(ts)) continue;
    for (const n of videoNetworks(v)) {
      if (n.status === "published" || n.status === "uploaded") continue;
      (grouped[n.network] ||= []).push({ id: v.id, title: v.title, ts });
    }
  }
  const clusters: ConflictCluster[] = [];
  for (const [net, arr] of Object.entries(grouped)) {
    if (!arr) continue;
    arr.sort((a, b) => a.ts - b.ts);
    let i = 0;
    while (i < arr.length) {
      const cluster = [arr[i]];
      let j = i + 1;
      while (j < arr.length && arr[j].ts - arr[j - 1].ts <= windowMs) {
        cluster.push(arr[j]);
        j++;
      }
      if (cluster.length > 1) {
        clusters.push({
          key: `${net}_${cluster[0].ts}_${cluster.length}`,
          network: net as Network,
          videos: cluster,
        });
      }
      i = j;
    }
  }
  return clusters;
}

type BestTimeSlot = { dow: number; hour: number; score: number; source: "history" | "default" };
type BestTimesResponse = { networks: Record<Network, BestTimeSlot[]> };

export default function SchedulePage() {
  const { data: videos, isLoading: videosLoading } = useListVideos();
  const checkSchedule = useCheckScheduledVideos();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("view");
    if (v === "month") return "month";
    if (v === "day") return "day";
    return "week";
  });
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [monthStart, setMonthStart] = useState<Date>(() => startOfMonth(new Date()));
  const [dayDate, setDayDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [quickCreateDate, setQuickCreateDate] = useState<Date | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [showConflictDetail, setShowConflictDetail] = useState(false);
  const [autoResolving, setAutoResolving] = useState(false);
  // Set of conflict cluster keys the user has explicitly dismissed for the
  // current session. Filtered out before the banner is rendered. We keep
  // it in state (not localStorage) on purpose: a hidden conflict that
  // disappears after a refresh is safer than one silently buried forever.
  const [ignoredConflictKeys, setIgnoredConflictKeys] = useState<Set<string>>(new Set());
  // Configurable conflict window. Initialised from localStorage so the user's
  // preference survives reloads.
  const [conflictWindowMin, setConflictWindowMin] = useState<number>(() => {
    if (typeof window === "undefined") return CONFLICT_WINDOW_DEFAULT_MIN;
    const raw = window.localStorage.getItem(CONFLICT_WINDOW_LS_KEY);
    const n = raw ? Number(raw) : NaN;
    return CONFLICT_WINDOW_OPTIONS.includes(n as (typeof CONFLICT_WINDOW_OPTIONS)[number])
      ? n
      : CONFLICT_WINDOW_DEFAULT_MIN;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONFLICT_WINDOW_LS_KEY, String(conflictWindowMin));
  }, [conflictWindowMin]);
  // State for the month-cell detail modal (click on a day in MonthView).
  const [monthDetailDate, setMonthDetailDate] = useState<Date | null>(null);

  // Best-times for the QuickPostModal. Cached for 5 minutes — these are
  // aggregate stats that don't change minute-to-minute.
  const bestTimesQuery = useQuery<BestTimesResponse>({
    queryKey: ["/api/analytics/best-times"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/best-times`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Reschedule a single video. Used by drag-and-drop and by the auto-resolve
  // flow. Optimistically updates the cache so the calendar reacts instantly.
  // The `silent` flag suppresses success/error toasts — used by auto-resolve
  // which emits its own consolidated summary toast.
  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, scheduledAt }: { id: number; scheduledAt: string; silent?: boolean }) => {
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
    onError: (_e, vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(VIDEOS_QUERY_KEY, ctx.prev);
      if (!vars.silent) {
        toast({ title: "No se pudo mover la publicación", variant: "destructive" });
      }
    },
    onSuccess: (_d, vars) => {
      if (!vars.silent) toast({ title: "Publicación reprogramada" });
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
    Object.values(buckets).forEach((arr) =>
      arr.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()),
    );
    return buckets;
  }, [filteredVideos]);

  // Heatmap density — max count restricted to days *inside the active
  // month* so the gradient isn't compressed by busy days from neighbouring
  // months that we never even render with the heat tint.
  const monthMaxCount = useMemo(() => {
    let max = 0;
    const m = monthStart.getMonth();
    const y = monthStart.getFullYear();
    for (const [key, arr] of Object.entries(videosByMonthDay)) {
      const d = new Date(key);
      if (d.getMonth() !== m || d.getFullYear() !== y) continue;
      if (arr.length > max) max = arr.length;
    }
    return max;
  }, [videosByMonthDay, monthStart]);

  const dayVideos = useMemo(() => {
    const key = dayDate.toDateString();
    return filteredVideos
      .filter((v: VideoSummary) => v.scheduledAt && new Date(v.scheduledAt).toDateString() === key)
      .sort((a: VideoSummary, b: VideoSummary) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
      );
  }, [filteredVideos, dayDate]);

  // Conflict detection runs over all filtered videos so the banner stays
  // accurate regardless of which view is active. Clusters dismissed via the
  // "Ignorar" action are filtered out for the rest of the session.
  const conflicts = useMemo(
    () =>
      detectConflicts(filteredVideos, conflictWindowMin * 60 * 1000).filter(
        (c) => !ignoredConflictKeys.has(c.key),
      ),
    [filteredVideos, ignoredConflictKeys, conflictWindowMin],
  );
  const totalConflictPosts = useMemo(() => {
    const ids = new Set<number>();
    for (const c of conflicts) for (const v of c.videos) ids.add(v.id);
    return ids.size;
  }, [conflicts]);

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
    if (v === "week") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState({}, "", url.toString());
  };

  const dateInputValue = useMemo(() => {
    const d = view === "day" ? dayDate : weekStart;
    return dateKey(d);
  }, [view, dayDate, weekStart]);

  // Auto-resolve all detected conflicts: keep the first post in each cluster
  // at its time and shift the rest. Critical: a multi-network post can appear
  // in several clusters (one per conflicting network), so we de-dupe by video
  // id BEFORE planning moves and iterate clusters in chronological order so
  // the earliest post in each cluster is the anchor. Each video gets at most
  // one PATCH per resolve run.
  const autoResolveConflicts = async () => {
    if (conflicts.length === 0 || autoResolving) return;
    setAutoResolving(true);
    let moved = 0;
    let failed = 0;
    const moves = new Map<number, number>(); // videoId → new timestamp
    try {
      // Process clusters earliest-first so anchors are stable
      const orderedClusters = [...conflicts].sort((a, b) => {
        const aMin = Math.min(...a.videos.map((v) => v.ts));
        const bMin = Math.min(...b.videos.map((v) => v.ts));
        return aMin - bMin;
      });
      for (const cluster of orderedClusters) {
        const sorted = [...cluster.videos].sort((a, b) => a.ts - b.ts);
        const baseTs = sorted[0].ts;
        for (let i = 1; i < sorted.length; i++) {
          const id = sorted[i].id;
          if (moves.has(id)) continue; // already scheduled to move
          const next = baseTs + i * AUTO_RESOLVE_OFFSET_MIN * 60 * 1000;
          moves.set(id, next);
        }
      }
      for (const [id, next] of moves) {
        try {
          await rescheduleMutation.mutateAsync({
            id,
            scheduledAt: new Date(next).toISOString(),
            silent: true,
          });
          moved++;
        } catch {
          failed++;
        }
      }
      if (moved > 0) {
        toast({
          title: `Movidas ${moved} publicación${moved === 1 ? "" : "es"}`,
          description: failed > 0 ? `${failed} fallaron. Revisa la lista.` : "Conflictos resueltos.",
        });
      } else if (failed > 0) {
        toast({ title: "No se pudo auto-resolver", variant: "destructive" });
      }
    } finally {
      setAutoResolving(false);
      setShowConflictDetail(false);
    }
  };

  // dnd-kit sensors. PointerSensor with a small activation distance so
  // simple clicks (open detail / open quick create) still work without
  // accidentally starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    const id = parseDragId(String(e.active.id));
    if (id != null) setActiveDragId(id);
  };

  // On drop: parse the target day key, preserve the original time-of-day,
  // and reschedule. No-op if the time would be unchanged.
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const id = parseDragId(String(e.active.id));
    const overId = e.over?.id ? String(e.over.id) : null;
    if (id == null || !overId) return;
    const targetDate = parseDropId(overId);
    if (!targetDate) return;
    const list = (videos || []) as VideoSummary[];
    const v = list.find((x) => x.id === id);
    if (!v?.scheduledAt) return;
    const old = new Date(v.scheduledAt);
    const next = new Date(targetDate);
    next.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (next.getTime() === old.getTime()) return;
    rescheduleMutation.mutate({ id, scheduledAt: next.toISOString() });
  };

  return (
    <Layout>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-6">
          <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1 flex items-center gap-2">
                Publicaciones
                <HelpHint
                  text="Aquí ves tus publicaciones programadas. El anillo de cada video indica su estado: verde = publicado, azul = subido, ámbar = pendiente, rojo = error. Usa 'Ejecutar Cola' para procesar manualmente las pendientes."
                  side="bottom"
                />
              </h1>
              <p className="text-muted-foreground text-sm sm:text-lg">
                {view === "month"
                  ? "Vista mensual de tus publicaciones programadas."
                  : view === "day"
                  ? "Vista diaria con horarios detallados."
                  : "Vista semanal de tus publicaciones programadas en todas las redes."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              <div className="flex items-center gap-0.5 glass-card rounded-xl border border-foreground/10 p-1">
                <button
                  onClick={() => switchView("day")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    view === "day" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Día
                </button>
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
                    else if (view === "day") setDayDate(addDays(dayDate, -1));
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
                    else if (view === "day") {
                      const t = new Date();
                      t.setHours(0, 0, 0, 0);
                      setDayDate(t);
                    }
                    else { setWeekStart(startOfWeek(new Date())); setSelectedDay(null); }
                  }}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-foreground/5 transition"
                >
                  Hoy
                </button>
                <button
                  onClick={() => {
                    if (view === "month") setMonthStart(addMonths(monthStart, 1));
                    else if (view === "day") setDayDate(addDays(dayDate, 1));
                    else { setWeekStart(addDays(weekStart, 7)); setSelectedDay(null); }
                  }}
                  className="p-2 rounded-lg hover:bg-foreground/5 transition"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {view !== "month" && (
                <label className="flex items-center gap-2 glass-card rounded-xl border border-foreground/10 px-3 py-2 cursor-pointer hover:border-primary/40 transition">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  <input
                    type="date"
                    value={dateInputValue}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [y, m, d] = e.target.value.split("-").map(Number);
                      const picked = new Date(y, m - 1, d);
                      if (view === "day") {
                        picked.setHours(0, 0, 0, 0);
                        setDayDate(picked);
                      } else {
                        setWeekStart(startOfWeek(picked));
                        setSelectedDay(null);
                      }
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
            <select
              value={networkFilter}
              onChange={(e) => setNetworkFilter(e.target.value as NetworkFilter)}
              className="bg-background/60 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs"
              aria-label="Filtrar por red"
            >
              {NETWORK_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-background/60 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs"
              aria-label="Filtrar por estado"
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={conflictWindowMin}
              onChange={(e) => setConflictWindowMin(Number(e.target.value))}
              className="bg-background/60 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs"
              aria-label="Ventana de conflictos"
              title="Considera dos posts en la misma red como conflicto si están programados dentro de este intervalo."
            >
              {CONFLICT_WINDOW_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  Conflicto: {m} min
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
                showFilters ? "bg-primary/20 text-primary" : "border border-foreground/10 text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Mostrar/ocultar filtros avanzados"
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? "Ocultar" : "Más"}
            </button>
          </div>

          {/* Conflict banner */}
          {conflicts.length > 0 && (
            <ConflictBanner
              conflicts={conflicts}
              total={totalConflictPosts}
              windowMin={conflictWindowMin}
              showDetail={showConflictDetail}
              onToggleDetail={() => setShowConflictDetail((v) => !v)}
              onAutoResolve={autoResolveConflicts}
              autoResolving={autoResolving}
              onIgnore={(key) => {
                setIgnoredConflictKeys((prev) => {
                  const next = new Set(prev);
                  next.add(key);
                  return next;
                });
              }}
              onIgnoreAll={() => {
                setIgnoredConflictKeys((prev) => {
                  const next = new Set(prev);
                  for (const c of conflicts) next.add(c.key);
                  return next;
                });
                setShowConflictDetail(false);
              }}
            />
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-bold capitalize">
              {view === "month"
                ? fmtMonth(monthStart)
                : view === "day"
                ? fmtDayLong(dayDate)
                : fmtRange(weekStart, weekEnd)}
            </h2>
            <span className="text-xs text-muted-foreground">
              {view === "month"
                ? `${totalThisMonth} publicación${totalThisMonth === 1 ? "" : "es"} este mes`
                : view === "day"
                ? `${dayVideos.length} publicación${dayVideos.length === 1 ? "" : "es"} este día`
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

          {videosLoading && filteredVideos.length === 0 && (
            <CalendarSkeleton rows={view === "month" ? 6 : view === "week" ? 1 : 4} cols={view === "day" ? 1 : 7} />
          )}

          {!videosLoading && filteredVideos.length === 0 && (
            <EmptyState
              icon={CalendarIcon}
              title={
                search.trim() || statusFilter !== "all" || networkFilter !== "all" || typeFilter !== "all"
                  ? "Sin resultados con los filtros actuales"
                  : view === "month"
                  ? "No hay publicaciones este mes"
                  : view === "day"
                  ? "No hay publicaciones este día"
                  : "No hay publicaciones esta semana"
              }
              description={
                search.trim() || statusFilter !== "all" || networkFilter !== "all" || typeFilter !== "all"
                  ? "Ajusta los filtros o cambia de fecha para ver más publicaciones."
                  : "Programa tu primera publicación para verla aparecer en este calendario."
              }
              action={{ label: "Crear publicación", href: "/videos" }}
              size="md"
            />
          )}

          {view === "month" ? (
            <MonthView
              monthGridDays={monthGridDays}
              videosByDay={videosByMonthDay}
              today={today}
              monthMaxCount={monthMaxCount}
              onDayClick={(date) => setMonthDetailDate(date)}
              onDayDoubleClick={(date) => {
                setDayDate(date);
                switchView("day");
              }}
              onDayPlus={(date) => setQuickCreateDate(date)}
            />
          ) : view === "day" ? (
            <DayView
              date={dayDate}
              videos={dayVideos}
              activeDragId={activeDragId}
              onAddAtHour={(date) => setQuickCreateDate(date)}
            />
          ) : (
            <WeekView
              days={days}
              videosByDay={videosByDay}
              today={today}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              activeDragId={activeDragId}
              onAddAtDay={(date) => setQuickCreateDate(date)}
            />
          )}

          {view === "week" && selectedDate && (
            <SelectedDayPanel date={selectedDate} videos={selectedVideos} />
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

        <QuickPostModal
          date={quickCreateDate}
          onClose={() => {
            if (!quickCreateMutation.isPending) setQuickCreateDate(null);
          }}
          onSubmit={(values) => quickCreateMutation.mutate(values)}
          isPending={quickCreateMutation.isPending}
          bestTimes={bestTimesQuery.data?.networks}
        />

        <DayDetailModal
          date={monthDetailDate}
          videos={
            monthDetailDate
              ? (videosByMonthDay[monthDetailDate.toDateString()] || []).slice().sort(
                  (a, b) =>
                    new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
                )
              : []
          }
          onClose={() => setMonthDetailDate(null)}
          onOpenDay={(d) => {
            setDayDate(d);
            switchView("day");
          }}
          onAddAtDay={(d) => setQuickCreateDate(d)}
        />
      </DndContext>
    </Layout>
  );
}

// ---- DnD id helpers ----
// Drag ids encode the video id; drop ids encode the target date as YYYY-MM-DD
// so dnd-kit (which only accepts strings/numbers) can round-trip them.
function makeDragId(videoId: number): string { return `video:${videoId}`; }
function parseDragId(id: string): number | null {
  const m = /^video:(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}
function makeDropId(date: Date): string { return `day:${dateKey(date)}`; }
function parseDropId(id: string): Date | null {
  const m = /^day:(.+)$/.exec(id);
  return m ? parseDateKey(m[1]) : null;
}

// ---- Conflict banner ----
function ConflictBanner({
  conflicts,
  total,
  windowMin,
  showDetail,
  onToggleDetail,
  onAutoResolve,
  autoResolving,
  onIgnore,
  onIgnoreAll,
}: {
  conflicts: ConflictCluster[];
  total: number;
  windowMin: number;
  showDetail: boolean;
  onToggleDetail: () => void;
  onAutoResolve: () => void;
  autoResolving: boolean;
  onIgnore: (key: string) => void;
  onIgnoreAll: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">
            {conflicts.length} conflicto{conflicts.length === 1 ? "" : "s"} detectado{conflicts.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-amber-200/80">
            {total} publicaciones programadas a menos de {windowMin} min en la misma red.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onToggleDetail}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition"
          >
            {showDetail ? "Ocultar detalle" : "Ver detalle"}
          </button>
          <button
            onClick={onIgnoreAll}
            disabled={autoResolving}
            className="text-xs px-3 py-1.5 rounded-lg bg-transparent hover:bg-amber-500/15 text-amber-200/80 border border-amber-500/30 transition disabled:opacity-50"
            title="Oculta los avisos hasta que recargues la página."
          >
            Ignorar todo
          </button>
          <button
            onClick={onAutoResolve}
            disabled={autoResolving}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-amber-950 font-semibold transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {autoResolving && <Loader2 className="w-3 h-3 animate-spin" />}
            <Wand2 className="w-3 h-3" />
            Auto-recolocar
          </button>
        </div>
      </div>
      {showDetail && (
        <div className="grid sm:grid-cols-2 gap-2">
          {conflicts.map((c) => (
            <div key={c.key} className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${NETWORK_BG[c.network]}`}>
                  <NetworkIcon network={c.network} className="w-3 h-3" />
                </span>
                <span className="text-xs font-semibold text-amber-100">{NETWORK_LABELS[c.network]}</span>
                <span className="ml-auto text-[10px] text-amber-200/70">{c.videos.length} posts</span>
                <button
                  onClick={() => onIgnore(c.key)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-200/80 border border-amber-500/20 transition"
                  title="Ocultar este aviso para esta sesión."
                >
                  Ignorar
                </button>
              </div>
              <ul className="text-[11px] text-amber-100/80 space-y-0.5">
                {c.videos.map((v) => {
                  const dt = new Date(v.ts);
                  return (
                    <li key={v.id} className="flex items-center gap-2">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span className="font-mono">{dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="truncate">{v.title || `#${v.id}`}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ---- Week view ----
function WeekView({
  days,
  videosByDay,
  today,
  selectedDay,
  onSelectDay,
  activeDragId,
  onAddAtDay,
}: {
  days: Date[];
  videosByDay: Record<string, VideoSummary[]>;
  today: string;
  selectedDay: number | null;
  onSelectDay: (i: number | null) => void;
  activeDragId: number | null;
  onAddAtDay: (date: Date) => void;
}) {
  return (
    <div className="glass-card rounded-3xl border border-foreground/10 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-foreground/10">
        {days.map((d, i) => {
          const isToday = d.toDateString() === today;
          const isSelected = selectedDay === i;
          const count = videosByDay[d.toDateString()]?.length || 0;
          return (
            <button
              key={i}
              onClick={() => onSelectDay(isSelected ? null : i)}
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
          return (
            <DayDropCell
              key={i}
              date={d}
              items={items}
              isToday={isToday}
              onAdd={() => onAddAtDay(d)}
              onClickDay={() => onSelectDay(i)}
              activeDragId={activeDragId}
              compact={false}
            />
          );
        })}
      </div>
    </div>
  );
}

// Reusable droppable cell + draggable cards used by week view (and indirectly
// by day/month — see DayView/MonthView). The `compact` flag drops covers
// when space is tight (month grid).
function DayDropCell({
  date,
  items,
  isToday,
  onAdd,
  onClickDay,
  activeDragId,
  compact,
}: {
  date: Date;
  items: VideoSummary[];
  isToday: boolean;
  onAdd: () => void;
  onClickDay: () => void;
  activeDragId: number | null;
  compact: boolean;
}) {
  const dropId = makeDropId(date);
  const { isOver, setNodeRef } = useDroppable({ id: dropId });
  const minH = compact ? "min-h-[100px]" : "min-h-[300px]";
  return (
    <div
      ref={setNodeRef}
      className={`group relative ${minH} border-r border-foreground/10 last:border-r-0 p-2 space-y-2 transition ${
        isToday ? "bg-primary/[0.03]" : ""
      } ${isOver ? "bg-primary/15 ring-1 ring-primary/40" : ""}`}
    >
      <button
        type="button"
        onClick={onAdd}
        className="absolute top-1 right-1 z-10 inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/15 text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/25 focus:opacity-100 transition"
        aria-label={`Nueva publicación el ${date.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`}
        title="Crear publicación rápida"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {items.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className={`w-full ${compact ? "h-12" : "h-full min-h-[260px]"} flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground/40 hover:text-primary hover:bg-foreground/5 rounded-lg transition`}
        >
          <Plus className="w-4 h-4" />
          <span>Agregar</span>
        </button>
      ) : (
        items.map((v) => (
          <DraggableVideoCard
            key={v.id}
            video={v}
            onClick={onClickDay}
            isDragging={activeDragId === v.id}
            compact={compact}
          />
        ))
      )}
    </div>
  );
}

function DraggableVideoCard({
  video,
  onClick,
  isDragging,
  compact,
}: {
  video: VideoSummary;
  onClick?: () => void;
  isDragging: boolean;
  compact: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: makeDragId(video.id) });
  const dt = new Date(video.scheduledAt!);
  const time = dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const nets = videoNetworks(video);
  const cover = coverSrc(video);
  const cap = caption(video);
  const agg = aggregateStatus(video);
  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        opacity: isDragging ? 0.85 : 1,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Only treat as click when there was no drag movement
        if (!transform) onClick?.();
        e.stopPropagation();
      }}
      className={`rounded-lg bg-foreground/5 border border-foreground/10 ${compact ? "p-1.5" : "p-2"} text-xs ring-1 overflow-hidden ${statusColor(
        agg,
      )} hover:bg-foreground/10 cursor-grab active:cursor-grabbing transition touch-none`}
      title={`${video.title || "Sin título"} — arrastra para mover`}
    >
      {cover && !compact ? (
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
      <p className={`line-clamp-2 leading-tight font-medium ${compact ? "text-[10px]" : "text-[11px]"}`}>
        {video.title}
      </p>
      {cap && !compact && (
        <p className="line-clamp-1 leading-tight text-[10px] text-muted-foreground mt-0.5">{cap}</p>
      )}
    </div>
  );
}

// ---- Day view: vertical timeline 06:00–23:00 with a card per post ----
function DayView({
  date,
  videos,
  activeDragId,
  onAddAtHour,
}: {
  date: Date;
  videos: VideoSummary[];
  activeDragId: number | null;
  onAddAtHour: (date: Date) => void;
}) {
  // Full 24h coverage so posts scheduled at unusual hours (e.g. 02:00 or
  // 23:30) are never hidden. The container scrolls; daytime hours land
  // closest to the top because the early ones are visually compact.
  const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00..23:00
  const dropId = makeDropId(date);
  const { isOver, setNodeRef } = useDroppable({ id: dropId });
  const isToday = date.toDateString() === new Date().toDateString();

  return (
    <div className="glass-card rounded-3xl border border-foreground/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-foreground/10 flex items-center justify-between bg-foreground/[0.02]">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          {fmtDayLong(date)}
          {isToday && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">Hoy</span>}
        </h3>
        <button
          onClick={() => {
            const d = new Date(date);
            d.setHours(9, 0, 0, 0);
            onAddAtHour(d);
          }}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary transition"
        >
          <Plus className="w-3 h-3" />
          Programar
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`relative grid grid-cols-[60px_1fr] max-h-[70vh] overflow-y-auto ${isOver ? "bg-primary/10" : ""}`}
      >
        {HOURS.map((h) => {
          const itemsAtHour = videos.filter((v) => new Date(v.scheduledAt!).getHours() === h);
          return (
            <div key={h} className="contents">
              <div className="border-b border-r border-foreground/10 py-3 px-2 text-right text-[11px] text-muted-foreground font-mono">
                {pad2(h)}:00
              </div>
              <div
                className="border-b border-foreground/10 py-2 px-3 min-h-[64px] hover:bg-foreground/[0.03] transition group/row relative"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-drag-card]")) return;
                  const d = new Date(date);
                  d.setHours(h, 0, 0, 0);
                  onAddAtHour(d);
                }}
              >
                {itemsAtHour.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground/30 opacity-0 group-hover/row:opacity-100 transition">
                    Click para programar a las {pad2(h)}:00
                  </span>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {itemsAtHour.map((v) => (
                      <div key={v.id} data-drag-card>
                        <DraggableVideoCard video={v} isDragging={activeDragId === v.id} compact={false} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Month view with heatmap density and droppable cells ----
function MonthView({
  monthGridDays,
  videosByDay,
  today,
  monthMaxCount,
  onDayClick,
  onDayDoubleClick,
  onDayPlus,
}: {
  monthGridDays: { date: Date; inMonth: boolean }[];
  videosByDay: Record<string, VideoSummary[]>;
  today: string;
  monthMaxCount: number;
  onDayClick: (date: Date) => void;
  onDayDoubleClick: (date: Date) => void;
  onDayPlus: (date: Date) => void;
}) {
  const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MAX_CHIPS = 3;

  return (
    <div className="glass-card rounded-3xl border border-foreground/10 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-foreground/10 bg-foreground/[0.02]">
        {DOW_LABELS.map((label) => (
          <div key={label} className="py-2 text-center text-[11px] font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {monthGridDays.map(({ date, inMonth }, idx) => (
          <MonthDayCell
            key={idx}
            date={date}
            inMonth={inMonth}
            today={today}
            videos={videosByDay[date.toDateString()] || []}
            monthMaxCount={monthMaxCount}
            maxChips={MAX_CHIPS}
            onClick={() => onDayClick(date)}
            onDoubleClick={() => onDayDoubleClick(date)}
            onPlus={() => onDayPlus(date)}
          />
        ))}
      </div>

      {monthMaxCount > 0 && (
        <div className="border-t border-foreground/10 px-4 py-2 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
          <span>Densidad:</span>
          <span className="w-3 h-3 rounded-sm bg-primary/5 border border-foreground/10" />
          <span className="w-3 h-3 rounded-sm bg-primary/15 border border-foreground/10" />
          <span className="w-3 h-3 rounded-sm bg-primary/30 border border-foreground/10" />
          <span className="w-3 h-3 rounded-sm bg-primary/50 border border-foreground/10" />
          <span>+publicaciones</span>
        </div>
      )}
    </div>
  );
}

function MonthDayCell({
  date,
  inMonth,
  today,
  videos,
  monthMaxCount,
  maxChips,
  onClick,
  onDoubleClick,
  onPlus,
}: {
  date: Date;
  inMonth: boolean;
  today: string;
  videos: VideoSummary[];
  monthMaxCount: number;
  maxChips: number;
  onClick: () => void;
  onDoubleClick: () => void;
  onPlus: () => void;
}) {
  const dropId = makeDropId(date);
  const { isOver, setNodeRef } = useDroppable({ id: dropId });
  const key = date.toDateString();
  const isToday = key === today;
  const visible = videos.slice(0, maxChips);
  const overflow = videos.length - maxChips;

  // Heatmap tint scaled vs the busiest day this month. Outside cells stay neutral.
  let heatBg = "";
  if (inMonth && monthMaxCount > 0 && videos.length > 0) {
    const ratio = videos.length / monthMaxCount;
    if (ratio >= 0.8) heatBg = "bg-primary/30";
    else if (ratio >= 0.5) heatBg = "bg-primary/20";
    else if (ratio >= 0.25) heatBg = "bg-primary/10";
    else heatBg = "bg-primary/5";
  }

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`group relative min-h-[100px] p-1.5 text-left border-b border-r border-foreground/10 transition focus:outline-none cursor-pointer ${
        !inMonth ? "opacity-30" : ""
      } ${isToday ? "ring-1 ring-primary/40 ring-inset" : ""} ${heatBg} ${
        isOver ? "bg-primary/25 ring-1 ring-primary" : "hover:bg-foreground/5"
      }`}
      title="Click para ver el día. Doble-click para abrirlo en vista Día."
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
            isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {date.getDate()}
        </span>
        <div className="flex items-center gap-1">
          {videos.length > 0 && (
            <span className="text-[9px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5 leading-none">
              {videos.length}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPlus(); }}
            className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-5 h-5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition"
            aria-label="Programar publicación"
            title="Programar"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
        {visible.map((v) => (
          <MonthChip key={v.id} video={v} />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="text-[9px] text-muted-foreground/80 pl-1 hover:text-primary transition"
          >
            +{overflow} más
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Day detail modal (opened from MonthView click on a cell) ----
// Lists every post scheduled for the clicked day with quick links to the
// underlying video record, plus a button to jump to the full Day view.
function DayDetailModal({
  date,
  videos,
  onClose,
  onOpenDay,
  onAddAtDay,
}: {
  date: Date | null;
  videos: VideoSummary[];
  onClose: () => void;
  onOpenDay: (date: Date) => void;
  onAddAtDay: (date: Date) => void;
}) {
  const open = date != null;
  const label = date
    ? date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
    : "";
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg bg-background border-foreground/10">
        <DialogHeader>
          <DialogTitle className="capitalize">{label}</DialogTitle>
          <DialogDescription>
            {videos.length === 0
              ? "Sin publicaciones programadas para este día."
              : `${videos.length} publicación${videos.length === 1 ? "" : "es"} programada${videos.length === 1 ? "" : "s"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {videos.map((v) => {
            const dt = new Date(v.scheduledAt!);
            const time = dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
            const nets = videoNetworks(v);
            const agg = aggregateStatus(v);
            const accent =
              agg === "published" ? "border-l-emerald-400"
              : agg === "uploaded" ? "border-l-blue-400"
              : agg === "error" ? "border-l-rose-400"
              : "border-l-primary";
            return (
              <Link
                key={v.id}
                href={`/videos`}
                className={`flex items-center gap-2 p-2 rounded-lg bg-foreground/5 border-l-2 ${accent} hover:bg-foreground/10 transition`}
              >
                <span className="font-mono text-xs text-primary font-semibold w-12 flex-shrink-0">{time}</span>
                <span className="flex-1 min-w-0 text-sm truncate">{v.title || `Sin título · #${v.id}`}</span>
                <span className="flex -space-x-1 flex-shrink-0">
                  {nets.slice(0, 4).map((n) => (
                    <span
                      key={n.network}
                      className={`w-4 h-4 rounded-full flex items-center justify-center ring-1 ring-background ${NETWORK_BG[n.network]}`}
                    >
                      <NetworkIcon network={n.network} className="w-2 h-2" />
                    </span>
                  ))}
                </span>
              </Link>
            );
          })}
          {videos.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Aún no hay nada aquí. Programa una publicación para empezar.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-foreground/10 hover:bg-foreground/5 transition"
          >
            Cerrar
          </button>
          {date && (
            <button
              type="button"
              onClick={() => { onAddAtDay(date); onClose(); }}
              className="px-4 py-2 rounded-lg text-sm border border-primary/30 text-primary hover:bg-primary/10 transition"
            >
              <Plus className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              Programar
            </button>
          )}
          {date && (
            <button
              type="button"
              onClick={() => { onOpenDay(date); onClose(); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-orange-400 transition"
            >
              Abrir vista Día
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MonthChip({ video }: { video: VideoSummary }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: makeDragId(video.id) });
  const nets = videoNetworks(video);
  const primaryNet = nets[0]?.network;
  const dt = new Date(video.scheduledAt!);
  const time = dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const agg = aggregateStatus(video);
  const accent =
    agg === "published" ? "border-l-emerald-400"
    : agg === "uploaded" ? "border-l-blue-400"
    : agg === "error" ? "border-l-rose-400"
    : "border-l-primary";

  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-foreground/5 border-l-2 ${accent} text-[10px] truncate cursor-grab active:cursor-grabbing hover:bg-foreground/10 transition touch-none`}
      title={`${video.title || ""} — ${time}`}
    >
      {primaryNet ? (
        <span className={`w-3 h-3 rounded-full flex items-center justify-center ring-1 ring-background ${NETWORK_BG[primaryNet]} flex-shrink-0`}>
          <NetworkIcon network={primaryNet} className="w-1.5 h-1.5" />
        </span>
      ) : (
        <span className="w-3 h-3 rounded-full bg-foreground/20 flex-shrink-0" />
      )}
      <span className="font-mono text-primary font-semibold flex-shrink-0">{time}</span>
      <span className="truncate">{video.title || "Sin título"}</span>
    </div>
  );
}

// ---- Selected day panel (week view detail) ----
function SelectedDayPanel({ date, videos }: { date: Date; videos: VideoSummary[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl border border-foreground/10 overflow-hidden"
    >
      <div className="p-4 border-b border-foreground/10 flex items-center">
        <CalendarClock className="w-5 h-5 text-primary mr-2" />
        <h2 className="text-lg font-bold">
          {date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <span className="ml-auto bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-medium">
          {videos.length} pub{videos.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {videos.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="Sin publicaciones este día"
            description="Programa un video desde tu lista para que aparezca en este horario."
            action={{ label: "Crear publicación", href: "/videos" }}
            size="sm"
          />
        ) : (
          videos.map((v) => {
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
  );
}

// ---- Quick post modal with best-time suggestions ----
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
  bestTimes,
}: {
  date: Date | null;
  onClose: () => void;
  onSubmit: (values: QuickPostValues) => void;
  isPending: boolean;
  bestTimes?: Record<Network, BestTimeSlot[]>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hour, setHour] = useState("09:00");
  const [day, setDay] = useState<Date | null>(null);
  const [networks, setNetworks] = useState<Network[]>(["instagram", "tiktok"]);

  useEffect(() => {
    if (date) {
      setTitle("");
      setDescription("");
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      // If the date includes a non-midnight time (came from Day view click),
      // honour that hour. Otherwise default to next hour today, 09:00 future.
      const hasHour = date.getHours() !== 0 || date.getMinutes() !== 0;
      const defaultHour = hasHour
        ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
        : isToday
        ? `${pad2(Math.min(23, now.getHours() + 1))}:00`
        : "09:00";
      setHour(defaultHour);
      setDay(date);
      setNetworks(["instagram", "tiktok"]);
    }
  }, [date]);

  const open = date != null;
  const dayLabel = day
    ? day.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
    : "";

  const canSubmit =
    !!day && title.trim().length > 0 && description.trim().length > 0 && networks.length > 0 && !isPending;

  const toggleNetwork = (n: Network) => {
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  // Best-time suggestions are presented *per selected network* (top-3 each)
  // rather than as a consolidated cross-network consensus. Each network has
  // its own posting rhythm, so showing one mixed list misrepresents the
  // signal. The list is keyed by network so the modal renders one section
  // per row with the network icon as a header.
  const perNetworkSuggestions = useMemo(() => {
    if (!bestTimes || networks.length === 0) return [] as { network: Network; slots: BestTimeSlot[] }[];
    return networks
      .map((n) => ({ network: n, slots: (bestTimes[n] || []).slice(0, 3) }))
      .filter((g) => g.slots.length > 0);
  }, [bestTimes, networks]);

  // Apply a suggestion: align day-of-week and set the hour. We pick the
  // *next* occurrence of that dow on or after the originally-clicked date so
  // suggestions never silently pull the user backwards in time.
  const applySuggestion = (s: BestTimeSlot) => {
    if (!day) return;
    // (date.getDay()+6)%7 → Mon-first dow. Find delta to target dow.
    const baseDow = (day.getDay() + 6) % 7;
    let delta = s.dow - baseDow;
    if (delta < 0) delta += 7;
    const next = addDays(day, delta);
    setDay(next);
    setHour(`${pad2(s.hour)}:00`);
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
            {day ? `Programar para el ${dayLabel}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || !day) return;
            onSubmit({
              title: title.trim(),
              description: description.trim(),
              day,
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Día</label>
              <input
                type="date"
                value={day ? dateKey(day) : ""}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  setDay(new Date(y, m - 1, d));
                }}
                className="w-full bg-background/60 border border-foreground/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/60"
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

          {perNetworkSuggestions.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary" />
                Mejor hora por red
                <HelpHint
                  text="Top 3 horarios por red según tu historial reciente (★) o recomendaciones por defecto. Al hacer click, ajustamos día y hora a la próxima coincidencia."
                  side="top"
                />
              </label>
              <div className="space-y-1.5">
                {perNetworkSuggestions.map(({ network: n, slots }) => (
                  <div key={n} className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${NETWORK_BG[n]}`}
                      title={NETWORK_LABELS[n]}
                    >
                      <NetworkIcon network={n} className="w-2.5 h-2.5" />
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 flex-shrink-0">
                      {NETWORK_LABELS[n]}
                    </span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {slots.map((s, i) => {
                        const isHistory = s.source === "history";
                        return (
                          <button
                            key={`${n}_${s.dow}_${s.hour}_${i}`}
                            type="button"
                            onClick={() => applySuggestion(s)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary transition"
                            title={`${isHistory ? "Tu historial" : "Recomendación"} · score ${s.score}`}
                          >
                            <span className="font-mono font-semibold">
                              {DAYS_LONG_ES[s.dow].slice(0, 3)} {pad2(s.hour)}:00
                            </span>
                            {isHistory && <span className="text-[9px] opacity-70">★</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
