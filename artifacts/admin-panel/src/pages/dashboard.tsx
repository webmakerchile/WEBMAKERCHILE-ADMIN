import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListVideos } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Plus,
  TrendingUp,
  TrendingDown,
  Eye,
  Heart,
  Users,
  Clock,
  ExternalLink,
  Newspaper,
  UserPlus,
  Trash2,
  X,
  ArrowRight,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  History,
} from "lucide-react";
import { NetworkIcon, NETWORK_BG, NETWORK_LABELS, type Network } from "@/components/social-icons";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/empty-state";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { WhatsNewBanner } from "@/components/whats-new-banner";
import { HelpHint } from "@/components/help-hint";
import { AnalyticsSkeleton, KanbanSkeleton } from "@/components/skeletons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Idea = {
  id: number;
  title: string;
  description: string | null;
  kanbanStatus: "por_hacer" | "en_progreso" | "en_revision" | "hecho";
  kanbanOrder: number;
  createdAt: string;
};

const KANBAN_COLUMNS: { key: Idea["kanbanStatus"]; label: string; accent: string }[] = [
  { key: "por_hacer", label: "Por hacer", accent: "text-slate-300 border-slate-500/30" },
  { key: "en_progreso", label: "En progreso", accent: "text-blue-300 border-blue-500/30" },
  { key: "en_revision", label: "En revisión", accent: "text-amber-300 border-amber-500/30" },
  { key: "hecho", label: "Hecho", accent: "text-emerald-300 border-emerald-500/30" },
];

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function fmtNumber(n: number | undefined | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h}h`;
  const days = Math.round(h / 24);
  return `hace ${days}d`;
}

/* ------------------------- Greeting hook ------------------------- */

type AuthMe = {
  id?: number;
  email?: string;
  name?: string;
  picture?: string | null;
};

function useUserName(): string {
  const [name, setName] = useState("creador");
  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<AuthMe>) : Promise.reject(new Error("unauth"))))
      .then((d) => {
        const n = d?.name || d?.email?.split("@")[0];
        if (n) setName(String(n).split(" ")[0]);
      })
      .catch((err) => {
        console.warn("[dashboard] auth/me failed:", err?.message ?? err);
      });
  }, []);
  return name;
}

/* ------------------------- Analytics ------------------------- */

type SeriesPoint = { date: string; value: number };

function MiniBars({
  series,
  prevSeries,
  accent,
}: {
  series: SeriesPoint[];
  prevSeries?: SeriesPoint[];
  accent: string;
}) {
  const allValues = [
    ...series.map((p) => p.value),
    ...(prevSeries?.map((p) => p.value) || []),
  ];
  const max = Math.max(1, ...allValues);
  return (
    <div className="flex items-end gap-[3px] h-8 mt-2">
      {series.map((p, i) => {
        const prev = prevSeries?.[i];
        const h = Math.max(2, (p.value / max) * 100);
        const ph = prev ? Math.max(2, (prev.value / max) * 100) : 0;
        return (
          <div key={p.date || i} className="flex-1 flex items-end gap-[1px] h-full">
            {prev && (
              <div
                className="w-1/2 rounded-sm bg-foreground/10"
                style={{ height: `${ph}%` }}
                title={`${prev.date}: ${prev.value}`}
              />
            )}
            <div
              className={`${prev ? "w-1/2" : "w-full"} rounded-sm ${accent}`}
              style={{ height: `${h}%` }}
              title={`${p.date}: ${p.value}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  if (!Number.isFinite(delta) || delta === 0) {
    return <span className="text-[10px] text-muted-foreground">— 0%</span>;
  }
  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        positive ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      <Icon className="w-3 h-3" />
      {positive ? "+" : ""}
      {delta}%
    </span>
  );
}

type MetricSummary = {
  total: number;
  delta: number;
  series: SeriesPoint[];
  prevSeries: SeriesPoint[];
};
type GrowthSummary = {
  value: number;
  prev: number;
  delta: number;
  series: SeriesPoint[];
  prevSeries: SeriesPoint[];
};
type NetworkMetrics = {
  followers?: number | null;
  subscribers?: number | null;
  followersDelta?: number;
  reach?: number;
  interactions?: number;
};
type NetworkSummary = {
  network: string;
  connected: boolean;
  reason?: string | null;
  metrics?: NetworkMetrics | null;
};
type AnalyticsSummary = {
  followers?: MetricSummary;
  reach?: MetricSummary;
  interactions?: MetricSummary;
  posts?: MetricSummary;
  growthRate?: GrowthSummary;
  networks?: NetworkSummary[];
};

const ANALYTICS_DAYS_OPTIONS = [7, 14, 30] as const;
type AnalyticsDays = (typeof ANALYTICS_DAYS_OPTIONS)[number];
const ANALYTICS_DAYS_STORAGE_KEY = "dashboard.analyticsDays";

function isAnalyticsDays(value: unknown): value is AnalyticsDays {
  return (
    typeof value === "number" &&
    (ANALYTICS_DAYS_OPTIONS as readonly number[]).includes(value)
  );
}

function AnalyticsRow() {
  const [days, setDays] = useState<AnalyticsDays>(() => {
    if (typeof window === "undefined") return 7;
    try {
      const raw = window.localStorage.getItem(ANALYTICS_DAYS_STORAGE_KEY);
      const parsed = raw == null ? null : Number(raw);
      return isAnalyticsDays(parsed) ? parsed : 7;
    } catch {
      return 7;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ANALYTICS_DAYS_STORAGE_KEY, String(days));
    } catch {
      /* ignore quota / privacy errors */
    }
  }, [days]);

  const { data, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary", days],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/summary?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error(`analytics/summary returned ${r.status}`);
      return (await r.json()) as AnalyticsSummary;
    },
    staleTime: 60_000,
  });

  const empty: MetricSummary = { total: 0, delta: 0, series: [], prevSeries: [] };
  const followers = data?.followers || empty;
  const reach = data?.reach || empty;
  const interactions = data?.interactions || empty;
  const posts = data?.posts || empty;

  if (isLoading && !data) {
    return <AnalyticsSkeleton />;
  }

  const cards: {
    label: string;
    sublabel?: string;
    value: number;
    delta: number;
    series: SeriesPoint[];
    prevSeries: SeriesPoint[];
    icon: typeof Users;
    color: string;
    bg: string;
    bar: string;
  }[] = [
    {
      label: "Vistas",
      value: reach.total,
      delta: reach.delta,
      series: reach.series,
      prevSeries: reach.prevSeries,
      icon: Eye,
      color: "text-blue-300",
      bg: "bg-blue-500/10",
      bar: "bg-blue-400/70",
    },
    {
      label: "Interacciones",
      value: interactions.total,
      delta: interactions.delta,
      series: interactions.series,
      prevSeries: interactions.prevSeries,
      icon: Heart,
      color: "text-rose-300",
      bg: "bg-rose-500/10",
      bar: "bg-rose-400/70",
    },
    {
      label: "Seguidores",
      value: followers.total,
      delta: followers.delta,
      series: followers.series,
      prevSeries: followers.prevSeries,
      icon: Users,
      color: "text-emerald-300",
      bg: "bg-emerald-500/10",
      bar: "bg-emerald-400/70",
    },
    {
      label: "Publicaciones",
      value: posts.total,
      delta: posts.delta,
      series: posts.series,
      prevSeries: posts.prevSeries,
      icon: TrendingUp,
      color: "text-amber-300",
      bg: "bg-amber-500/10",
      bar: "bg-amber-400/70",
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Últimos {days} días
          </h2>
          <div
            role="radiogroup"
            aria-label="Rango de días"
            className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/5 p-0.5"
          >
            {ANALYTICS_DAYS_OPTIONS.map((opt) => {
              const active = opt === days;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDays(opt)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt}d
                </button>
              );
            })}
          </div>
        </div>
        {data?.networks && (
          <span className="text-[11px] text-muted-foreground">
            {data.networks.filter((n) => n.connected).length}/{data.networks.length} redes conectadas
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-2xl border border-foreground/10 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.bg}`}>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </span>
              <DeltaPill delta={c.delta || 0} />
            </div>
            <div className="text-2xl font-bold font-display">
              {isLoading ? (
                <span className="inline-block w-12 h-6 bg-foreground/5 rounded animate-pulse" />
              ) : (
                fmtNumber(c.value)
              )}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>{c.label}</span>
              {c.sublabel && <span className="text-[10px] text-muted-foreground/70">{c.sublabel}</span>}
            </div>
            {(c.series && c.series.length > 0 && c.series.some((p) => p.value !== 0)) ? (
              <MiniBars series={c.series} prevSeries={c.prevSeries} accent={c.bar} />
            ) : (
              <div className="h-8 mt-2 rounded bg-foreground/[0.02]" title="Sin datos en el rango" />
            )}
          </motion.div>
        ))}
      </div>

      {data?.networks && (
        <div className="flex flex-wrap gap-2 pt-1">
          {data.networks.map((n) => (
            <div
              key={n.network}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
                n.connected
                  ? "border-foreground/10 bg-foreground/5 text-foreground"
                  : "border-foreground/10 bg-foreground/[0.02] text-muted-foreground/50"
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center ${NETWORK_BG[n.network as Network]}`}>
                <NetworkIcon network={n.network as Network} className="w-2.5 h-2.5" />
              </span>
              <span className="font-medium">{NETWORK_LABELS[n.network as Network]}</span>
              {n.connected ? (
                <span className="text-muted-foreground">
                  {fmtNumber(n.metrics?.followers ?? n.metrics?.subscribers)}
                  {(n.metrics?.followersDelta ?? 0) > 0 && (
                    <span className="text-emerald-400 ml-1 inline-flex items-center">
                      <TrendingUp className="w-3 h-3" />+{n.metrics?.followersDelta}
                    </span>
                  )}
                  {(n.metrics?.followersDelta ?? 0) < 0 && (
                    <span className="text-rose-400 ml-1 inline-flex items-center">
                      <TrendingDown className="w-3 h-3" />
                      {n.metrics?.followersDelta}
                    </span>
                  )}
                </span>
              ) : (
                <span>—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------- Ideas Kanban ------------------------- */

function IdeasKanban() {
  const qc = useQueryClient();
  const { data: ideas = [], isLoading } = useQuery<Idea[]>({
    queryKey: ["ideas"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/ideas`, { credentials: "include" });
      const d = await r.json();
      return d.ideas || [];
    },
  });

  const [adding, setAdding] = useState<Idea["kanbanStatus"] | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);

  const createIdea = useMutation({
    mutationFn: async (payload: { title: string; kanbanStatus: Idea["kanbanStatus"] }) => {
      const r = await fetch(`${API_BASE}/ideas`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ideas"] });
      setAdding(null);
      setDraftTitle("");
    },
  });

  const updateIdea = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Idea> & { id: number }) => {
      const r = await fetch(`${API_BASE}/ideas/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["ideas"] });
      const prev = qc.getQueryData<Idea[]>(["ideas"]) || [];
      qc.setQueryData<Idea[]>(["ideas"], (old) =>
        (old || []).map((i) => (i.id === vars.id ? { ...i, ...vars } : i)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["ideas"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ideas"] }),
  });

  const deleteIdea = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API_BASE}/ideas/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ideas"] }),
  });

  const grouped = useMemo(() => {
    const g: Record<Idea["kanbanStatus"], Idea[]> = {
      por_hacer: [],
      en_progreso: [],
      en_revision: [],
      hecho: [],
    };
    ideas.forEach((i) => g[i.kanbanStatus]?.push(i));
    Object.values(g).forEach((arr) => arr.sort((a, b) => a.kanbanOrder - b.kanbanOrder));
    return g;
  }, [ideas]);

  const onDrop = (targetStatus: Idea["kanbanStatus"]) => {
    if (dragId == null) return;
    const idea = ideas.find((i) => i.id === dragId);
    setDragId(null);
    if (!idea || idea.kanbanStatus === targetStatus) return;
    updateIdea.mutate({ id: dragId, kanbanStatus: targetStatus });
  };

  if (isLoading && ideas.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Ideas
          </h2>
        </div>
        <KanbanSkeleton columns={KANBAN_COLUMNS.length} cardsPerCol={2} />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Ideas
        </h2>
        <span className="text-[11px] text-muted-foreground">{ideas.length} total</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {KANBAN_COLUMNS.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(col.key)}
            className="glass-card rounded-2xl border border-foreground/10 p-3 min-h-[260px] flex flex-col"
          >
            <div className={`flex items-center justify-between pb-2 mb-2 border-b ${col.accent}`}>
              <h3 className={`text-xs uppercase tracking-wide font-bold ${col.accent.split(" ")[0]}`}>{col.label}</h3>
              <span className="text-[10px] text-muted-foreground">{grouped[col.key].length}</span>
            </div>

            <div className="space-y-2 flex-1">
              {isLoading ? (
                <>
                  <div className="h-16 rounded-lg bg-foreground/5 animate-pulse" />
                  <div className="h-16 rounded-lg bg-foreground/5 animate-pulse" />
                </>
              ) : (
                <AnimatePresence>
                  {grouped[col.key].map((idea) => (
                    <motion.div
                      layout
                      key={idea.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      draggable
                      onDragStart={() => setDragId(idea.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`group rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 p-2.5 cursor-grab active:cursor-grabbing transition ${
                        dragId === idea.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="text-sm font-medium leading-snug flex-1 break-words">{idea.title}</p>
                        <button
                          onClick={() => deleteIdea.mutate(idea.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition flex-shrink-0"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {idea.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{idea.description}</p>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}

              {adding === col.key ? (
                <div className="rounded-lg bg-background/40 border border-primary/30 p-2">
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draftTitle.trim()) {
                        createIdea.mutate({ title: draftTitle.trim(), kanbanStatus: col.key });
                      }
                      if (e.key === "Escape") {
                        setAdding(null);
                        setDraftTitle("");
                      }
                    }}
                    placeholder="Tu nueva idea…"
                    className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/50"
                  />
                  <div className="flex items-center gap-1 mt-1.5">
                    <button
                      onClick={() => draftTitle.trim() && createIdea.mutate({ title: draftTitle.trim(), kanbanStatus: col.key })}
                      disabled={!draftTitle.trim() || createIdea.isPending}
                      className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      Añadir
                    </button>
                    <button
                      onClick={() => {
                        setAdding(null);
                        setDraftTitle("");
                      }}
                      className="text-[11px] px-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(col.key)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-foreground/10 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva idea
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------- Inspirations ------------------------- */

type NewsItem = { title: string; link: string; pubDate?: string; source?: string; thumbnail?: string };
type CompetitorPostsResponse = { items?: NewsItem[]; error?: string; cached?: boolean };
type Competitor = { id: number; platform: string; handle: string; displayName?: string | null };

function CompetitorPosts({ competitorId }: { competitorId: number }) {
  const { data, isLoading, isError, error } = useQuery<CompetitorPostsResponse>({
    queryKey: ["competitor-posts", competitorId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/inspirations/competitors/${competitorId}/posts`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const items: NewsItem[] = data?.items || [];
  const adapterError = data?.error;
  if (isLoading) {
    return (
      <div className="space-y-1.5 mt-2 pl-9">
        {[0, 1].map((i) => (
          <div key={i} className="h-9 rounded bg-foreground/5 animate-pulse" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <p className="text-[11px] text-rose-300/80 mt-2 pl-9">
        No se pudo cargar: {error instanceof Error ? error.message : "error de red"}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground/70 mt-2 pl-9">
        {adapterError
          ? `Sin posts disponibles (${adapterError}).`
          : "Sin posts recientes disponibles."}
      </p>
    );
  }
  return (
    <div className="space-y-1 mt-2 pl-9">
      {adapterError && (
        <p className="text-[10px] text-amber-300/80 px-1.5">
          Aviso: {adapterError}
        </p>
      )}
      {items.slice(0, 5).map((it, i) => (
        <a
          key={i}
          href={it.link}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-start gap-2 rounded-md p-1.5 hover:bg-foreground/5 transition group"
        >
          {it.thumbnail ? (
            <img
              src={it.thumbnail}
              alt=""
              loading="lazy"
              className="w-12 h-12 rounded-md object-cover flex-shrink-0 bg-foreground/5"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="w-12 h-12 rounded-md bg-foreground/5 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium leading-snug line-clamp-2 group-hover:text-primary">
              {it.title}
            </p>
            {it.pubDate && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(it.pubDate)}</p>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

function InspirationsBlock() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"news" | "competitors">("news");
  const [showAdd, setShowAdd] = useState(false);
  const [newComp, setNewComp] = useState({ platform: "youtube", handle: "", displayName: "" });
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: newsData, isLoading: newsLoading } = useQuery({
    queryKey: ["inspirations-news"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/inspirations/news`, { credentials: "include" });
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const { data: compsData } = useQuery({
    queryKey: ["competitors"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/inspirations/competitors`, { credentials: "include" });
      return r.json();
    },
  });

  const addCompetitor = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_BASE}/inspirations/competitors`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newComp),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitors"] });
      setNewComp({ platform: "youtube", handle: "", displayName: "" });
      setShowAdd(false);
    },
  });

  const delCompetitor = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API_BASE}/inspirations/competitors/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors"] }),
  });

  const news: NewsItem[] = newsData?.items || [];
  const comps: Competitor[] = compsData?.competitors || [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          Inspiración
        </h2>
        <div className="flex items-center gap-1 glass-card rounded-lg border border-foreground/10 p-0.5 text-xs">
          <button
            onClick={() => setTab("news")}
            className={`px-3 py-1 rounded-md transition ${
              tab === "news" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Noticias
          </button>
          <button
            onClick={() => setTab("competitors")}
            className={`px-3 py-1 rounded-md transition ${
              tab === "competitors" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Competencia
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-foreground/10 p-4">
        {tab === "news" ? (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {newsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-foreground/5 animate-pulse" />
                ))}
              </div>
            ) : news.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin noticias disponibles.</p>
            ) : (
              news.map((n, i) => (
                <a
                  key={i}
                  href={n.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-foreground/5 transition group"
                >
                  <span className="w-7 h-7 rounded-md bg-primary/10 text-primary flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Newspaper className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug group-hover:text-primary transition line-clamp-2">
                      {n.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {n.source}
                      {n.pubDate ? ` · ${relativeTime(n.pubDate)}` : ""}
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary mt-1 flex-shrink-0" />
                </a>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {comps.length === 0 && !showAdd && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aún no sigues a ningún competidor.
              </p>
            )}
            {comps.map((c) => {
              const isOpen = expanded === c.id;
              return (
                <div
                  key={c.id}
                  className="group rounded-lg bg-foreground/5 border border-foreground/10"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded(isOpen ? null : c.id);
                      }
                    }}
                    className="w-full flex items-center gap-2 p-2.5 text-left cursor-pointer"
                  >
                    <span className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center ${NETWORK_BG[c.platform as Network] || "bg-foreground/10"}`}>
                      <NetworkIcon network={c.platform as Network} className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.displayName || c.handle}</p>
                      <p className="text-[11px] text-muted-foreground truncate">@{c.handle}</p>
                    </div>
                    <span
                      className={`text-[10px] text-muted-foreground transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        delCompetitor.mutate(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition"
                      title="Quitar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="pb-2">
                      <CompetitorPosts competitorId={c.id} />
                    </div>
                  )}
                </div>
              );
            })}

            {showAdd ? (
              <div className="rounded-lg border border-primary/30 bg-background/40 p-3 space-y-2">
                <select
                  value={newComp.platform}
                  onChange={(e) => setNewComp({ ...newComp, platform: e.target.value })}
                  className="w-full bg-background/60 border border-foreground/10 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="youtube">YouTube</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="x">X</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                </select>
                <input
                  value={newComp.handle}
                  onChange={(e) => setNewComp({ ...newComp, handle: e.target.value.replace(/^@/, "") })}
                  placeholder="usuario o canal"
                  className="w-full bg-background/60 border border-foreground/10 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  value={newComp.displayName}
                  onChange={(e) => setNewComp({ ...newComp, displayName: e.target.value })}
                  placeholder="Nombre (opcional)"
                  className="w-full bg-background/60 border border-foreground/10 rounded-md px-2 py-1.5 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addCompetitor.mutate()}
                    disabled={!newComp.handle.trim() || addCompetitor.isPending}
                    className="flex-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                  >
                    {addCompetitor.isPending ? "Añadiendo…" : "Añadir"}
                  </button>
                  <button
                    onClick={() => setShowAdd(false)}
                    className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-foreground/10 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Añadir competidor
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------- Upcoming sidebar ------------------------- */

type UpcomingVideo = {
  id: number;
  title?: string;
  description?: string | null;
  status?: string;
  scheduledAt?: string | Date | null;
  coverImageBase64?: string | null;
  coverMimeType?: string | null;
  tiktokDescription?: string | null;
  instagramDescription?: string | null;
  youtubeDescription?: string | null;
  linkedinDescription?: string | null;
  facebookDescription?: string | null;
  youtubeStatus?: string | null;
  tiktokStatus?: string | null;
  instagramStatus?: string | null;
  linkedinStatus?: string | null;
  xStatus?: string | null;
  facebookStatus?: string | null;
};

function upcomingCaptionLine(v: UpcomingVideo): string {
  const text =
    v.tiktokDescription ||
    v.instagramDescription ||
    v.youtubeDescription ||
    v.linkedinDescription ||
    v.facebookDescription ||
    v.description ||
    "";
  return text.split("\n")[0] || "";
}

function upcomingCoverSrc(v: UpcomingVideo): string | null {
  if (v.coverImageBase64 && v.coverMimeType) {
    return `data:${v.coverMimeType};base64,${v.coverImageBase64}`;
  }
  return null;
}

function UpcomingPosts() {
  const { data: videos } = useListVideos();
  const upcoming = useMemo(() => {
    const now = Date.now();
    const list = (videos as UpcomingVideo[] | undefined) || [];
    return list
      .filter((v) => v.status === "scheduled" && v.scheduledAt && new Date(v.scheduledAt!).getTime() >= now)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
      .slice(0, 8);
  }, [videos]);

  return (
    <aside className="glass-card rounded-2xl border border-foreground/10 p-4 sticky top-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-display font-bold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          Próximas publicaciones
          <HelpHint text="Muestra los próximos videos programados, ordenados de más cercano a más lejano. Los estados muestran si están listos (programado) o ya publicados." />
        </h2>
        <Link to="/schedule" className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
          Ver todo <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Sin publicaciones programadas"
          description="Cuando programes un video, aparecerá aquí en orden cronológico."
          action={{ label: "Programar publicación", href: "/schedule" }}
          size="sm"
        />
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {upcoming.map((v) => {
            const dt = new Date(v.scheduledAt!);
            const day = dt.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
            const time = dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
            // Show every network this post is *targeted* at — including
            // those still in "pending" (the default for newly scheduled
            // posts). Only "skipped" (explicit opt-out by the scheduler)
            // is excluded.
            const networkChecks: Array<[string | null | undefined, Network]> = [
              [v.youtubeStatus, "youtube"],
              [v.tiktokStatus, "tiktok"],
              [v.instagramStatus, "instagram"],
              [v.linkedinStatus, "linkedin"],
              [v.xStatus, "x"],
              [v.facebookStatus, "facebook"],
            ];
            const networks: Network[] = networkChecks
              .filter(([status]) => !!status && status !== "skipped")
              .map(([, n]) => n);
            const cover = upcomingCoverSrc(v);
            const captionLine = upcomingCaptionLine(v);
            return (
              <div key={v.id} className="rounded-lg bg-foreground/5 border border-foreground/10 p-2.5 hover:bg-foreground/10 transition flex gap-2.5">
                <div className="w-12 h-12 shrink-0 rounded-md overflow-hidden bg-foreground/[0.05] ring-1 ring-foreground/10 flex items-center justify-center">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <CalendarClock className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
                    <span className="font-mono text-primary font-bold">{time}</span>
                    <span>·</span>
                    <span className="capitalize">{day}</span>
                    {networks.length > 0 && (
                      <span className="ml-auto inline-flex items-center gap-0.5">
                        {networks.slice(0, 4).map((n) => (
                          <span
                            key={n}
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${NETWORK_BG[n]}`}
                            title={n}
                          >
                            <NetworkIcon network={n} className="w-2 h-2" />
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-snug line-clamp-1">{v.title}</p>
                  {captionLine && (
                    <p className="text-[11px] text-muted-foreground/80 leading-snug line-clamp-1 mt-0.5">
                      {captionLine}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

/* ------------------------- Recent Activity & Error Banner ------------------------- */

type ActivityVideo = {
  id: number;
  title: string;
  status: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  youtubeStatus?: string | null;
  youtubeError?: string | null;
  tiktokStatus?: string | null;
  tiktokError?: string | null;
  instagramStatus?: string | null;
  instagramError?: string | null;
  linkedinStatus?: string | null;
  linkedinError?: string | null;
  xStatus?: string | null;
  xError?: string | null;
  facebookStatus?: string | null;
  facebookError?: string | null;
};

const PLATFORM_KEYS: Array<{ platform: Network; statusKey: keyof ActivityVideo; errorKey?: keyof ActivityVideo }> = [
  { platform: "youtube", statusKey: "youtubeStatus", errorKey: "youtubeError" },
  { platform: "tiktok", statusKey: "tiktokStatus", errorKey: "tiktokError" },
  { platform: "instagram", statusKey: "instagramStatus", errorKey: "instagramError" },
  { platform: "linkedin", statusKey: "linkedinStatus", errorKey: "linkedinError" },
  { platform: "x", statusKey: "xStatus", errorKey: "xError" },
  { platform: "facebook", statusKey: "facebookStatus", errorKey: "facebookError" },
];

function useRecentActivity() {
  return useQuery<ActivityVideo[]>({
    queryKey: ["recent-activity"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/content/videos/recent-activity`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

const ERROR_BANNER_SESSION_KEY = "dashboard.errorBannerDismissed";

function ErrorBanner() {
  const { data: activity } = useRecentActivity();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(ERROR_BANNER_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  function dismiss() {
    try {
      window.sessionStorage.setItem(ERROR_BANNER_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  const errorVideos = useMemo(() => {
    if (!activity) return [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return activity.filter((v) => {
      const ts = v.updatedAt ? new Date(v.updatedAt).getTime() : 0;
      if (ts < cutoff) return false;
      return PLATFORM_KEYS.some((p) => v[p.statusKey] === "error");
    });
  }, [activity]);

  if (dismissed || errorVideos.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rose-300">
            {errorVideos.length === 1
              ? "1 publicación falló en las últimas 24 h"
              : `${errorVideos.length} publicaciones fallaron en las últimas 24 h`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {errorVideos.slice(0, 3).map((v) => {
              const failedPlatforms = PLATFORM_KEYS
                .filter((p) => v[p.statusKey] === "error")
                .map((p) => NETWORK_LABELS[p.platform])
                .join(", ");
              return (
                <li key={v.id} className="flex items-center gap-2 text-xs text-rose-200/80">
                  <span className="font-medium truncate flex-1">{v.title}</span>
                  <span className="text-rose-300/60 flex-shrink-0">— {failedPlatforms}</span>
                  <Link
                    to={`/videos?select=${v.id}`}
                    className="flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition"
                  >
                    Ver
                  </Link>
                </li>
              );
            })}
            {errorVideos.length > 3 && (
              <li className="text-[11px] text-rose-300/60">
                y {errorVideos.length - 3} más…
              </li>
            )}
          </ul>
        </div>
        <button
          onClick={dismiss}
          className="text-rose-300/60 hover:text-rose-300 transition flex-shrink-0"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

function RecentActivity() {
  const qc = useQueryClient();
  const { data: activity = [], isLoading } = useRecentActivity();
  const { toast } = useToast();
  const [retrying, setRetrying] = useState<string | null>(null);
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const displayItems = activity;

  async function handleRetry(videoId: number, platform: string, platformLabel: string) {
    const key = `${videoId}-${platform}`;
    setRetrying(key);
    try {
      const r = await fetch(`${API_BASE}/content/videos/${videoId}/retry/${platform}`, {
        method: "POST",
        credentials: "include",
      });
      const contentType = r.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await r.json() : null;
      if (r.ok && data?.success) {
        toast({ title: `Reintento exitoso en ${platformLabel}` });
      } else {
        toast({
          title: `Falló el reintento en ${platformLabel}`,
          description: data?.error || (r.ok ? "Error desconocido" : `Error ${r.status}`),
          variant: "destructive",
        });
      }
      qc.invalidateQueries({ queryKey: ["recent-activity"] });
    } catch (err: any) {
      toast({
        title: `Error al reintentar en ${platformLabel}`,
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRetrying(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          Actividad reciente
          <HelpHint
            text="Cada fila muestra una publicación reciente y un punto por red (verde = publicado, azul = subido, rojo = error). Si una red falló, puedes reintentar desde aquí."
            side="bottom"
          />
        </h2>
        <span className="text-[11px] text-muted-foreground">{activity.length} publicaciones</span>
      </div>

      <div className="glass-card rounded-2xl border border-foreground/10 overflow-hidden">
        {isLoading ? (
          <div className="space-y-px">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-foreground/5 animate-pulse" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sin publicaciones publicadas"
            description="Apenas publiques tu primer video, verás aquí su historial y estado en cada red."
            action={{ label: "Crear publicación", href: "/videos" }}
            size="sm"
          />
        ) : (
          <>
            <div className="divide-y divide-foreground/10">
              {displayItems.map((v) => {
                const date = v.publishedAt || v.updatedAt;
                const dateStr = date
                  ? new Date(date).toLocaleDateString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                  : "—";
                const activePlatforms = PLATFORM_KEYS.filter(
                  (p) => v[p.statusKey] && v[p.statusKey] !== "pending" && v[p.statusKey] !== "skipped",
                );
                return (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.02] transition">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {activePlatforms.map((p) => {
                        const status = v[p.statusKey] as string | null | undefined;
                        const error = p.errorKey ? (v[p.errorKey] as string | null | undefined) : null;
                        const isError = status === "error";
                        const isOk = status === "published" || status === "uploaded";
                        const ttKey = `${v.id}-${p.platform}`;
                        const isRetrying = retrying === ttKey;
                        return (
                          <div key={p.platform} className="relative flex items-center gap-0.5">
                            <div
                              className={`relative group flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${
                                isError
                                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                  : isOk
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : "bg-foreground/5 border-foreground/10 text-muted-foreground"
                              }`}
                              onMouseEnter={() => error && setTooltipId(ttKey)}
                              onMouseLeave={() => setTooltipId(null)}
                            >
                              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${NETWORK_BG[p.platform]}`}>
                                <NetworkIcon network={p.platform} className="w-2 h-2" />
                              </span>
                              {isError ? (
                                <XCircle className="w-2.5 h-2.5" />
                              ) : isOk ? (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : null}
                              {tooltipId === ttKey && error && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-48 rounded-lg bg-background border border-foreground/10 px-2 py-1.5 text-[10px] text-muted-foreground shadow-lg pointer-events-none">
                                  {error}
                                </div>
                              )}
                            </div>
                            {isError && (
                              <button
                                onClick={() => handleRetry(v.id, p.platform, NETWORK_LABELS[p.platform])}
                                disabled={isRetrying}
                                className="w-5 h-5 rounded-full flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 transition disabled:opacity-50"
                                title={`Reintentar en ${NETWORK_LABELS[p.platform]}`}
                              >
                                <RefreshCw className={`w-2.5 h-2.5 ${isRetrying ? "animate-spin" : ""}`} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------- Page ------------------------- */

export default function Dashboard() {
  const name = useUserName();
  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <Layout>
      <div className="space-y-6">
        <WhatsNewBanner />
        <ErrorBanner />
        <OnboardingChecklist />

        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold">
              {greet()}, <span className="text-gradient">{name}</span>
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base capitalize">{today}</p>
          </div>
          <Link
            to="/videos"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-orange-400 transition shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Crear publicación
          </Link>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-8 min-w-0">
            <AnalyticsRow />
            <RecentActivity />
            <IdeasKanban />
            <InspirationsBlock />
          </div>
          <UpcomingPosts />
        </div>
      </div>
    </Layout>
  );
}
