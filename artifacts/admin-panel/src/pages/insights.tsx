import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnalyticsSkeleton } from "@/components/skeletons";
import { NetworkIcon, NETWORK_LABELS, type Network } from "@/components/social-icons";
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Download,
  BarChart3,
  Eye,
  Heart,
  MessageSquare,
  Share2,
  Trophy,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const NETWORKS: Network[] = ["youtube", "instagram", "tiktok", "linkedin", "x", "facebook"];

const NETWORK_HEX: Record<Network, string> = {
  youtube: "#ef4444",
  instagram: "#ec4899",
  tiktok: "#22d3ee",
  linkedin: "#3b82f6",
  x: "#f5f5f5",
  facebook: "#1d4ed8",
};

type SeriesPoint = { date: string; value: number };

type SummaryNetwork = {
  network: string;
  connected: boolean;
  metrics: { followers: number; followersDelta: number; views: number; viewsDelta: number; engagements: number; engagementsDelta: number } | null;
};

type SummaryResponse = {
  days: number;
  range: { start: string; end: string };
  totals: { views: number; engagements: number; followers: number; posts: number; viewsDelta: number; engagementsDelta: number; followersDelta: number; postsDelta: number };
  networks: SummaryNetwork[];
  reach: { total: number; delta: number; series: SeriesPoint[]; prevSeries: SeriesPoint[] };
  interactions: { total: number; delta: number; series: SeriesPoint[]; prevSeries: SeriesPoint[] };
  followers: { total: number; delta: number; series: SeriesPoint[]; prevSeries: SeriesPoint[] };
};

type TimeseriesNetwork = {
  network: string;
  connected: boolean;
  reach: SeriesPoint[];
  interactions: SeriesPoint[];
  followers: SeriesPoint[];
  totals: { reach: number; interactions: number; followers: number };
};

type TimeseriesResponse = { days: number; dates: string[]; networks: TimeseriesNetwork[] };

type TopItem = {
  videoId: number;
  title: string;
  coverImageBase64: string | null;
  coverMimeType: string | null;
  publishedAt: string | null;
  perNetwork: Record<string, { views: number; likes: number; comments: number; shares: number }>;
  totals: { views: number; likes: number; comments: number; shares: number };
  engagement: number;
};
type TopResponse = { days: number; network: string; items: TopItem[]; unsupported?: boolean; message?: string };

type Insight = { type: "win" | "warning" | "info"; title: string; body: string };
type InsightsResponse = { insights: Insight[] };

type RangeKey = "7" | "30" | "90";
const RANGES: { value: RangeKey; label: string }[] = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
];

type TabKey = "all" | Network;

function fmt(n: number | undefined | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es", { day: "2-digit", month: "short" });
}

function DeltaPill({ delta }: { delta: number }) {
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-400" : "text-rose-400"}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function CompareCard({ label, value, delta, icon }: { label: string; value: number; delta: number; icon: React.ReactNode }) {
  return (
    <Card className="bg-card/50 border-foreground/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
          <DeltaPill delta={delta} />
        </div>
        <div className="text-2xl font-bold text-foreground">{fmt(value)}</div>
        <div className="text-[10px] text-muted-foreground/60 mt-1">vs período anterior</div>
      </CardContent>
    </Card>
  );
}

function buildChartData(ts: TimeseriesResponse | undefined, metric: "reach" | "interactions", filterNetwork: TabKey): { dataset: Array<Record<string, number | string>>; networks: Network[] } {
  if (!ts) return { dataset: [], networks: [] };
  const dates = ts.dates;
  const visibleNets: Network[] = filterNetwork === "all"
    ? NETWORKS.filter((n) => ts.networks.find((x) => x.network === n)?.connected)
    : [filterNetwork as Network];
  const dataset = dates.map((date, i) => {
    const row: Record<string, number | string> = { date: date.slice(5) };
    for (const n of visibleNets) {
      const block = ts.networks.find((x) => x.network === n);
      const arr = block?.[metric] || [];
      row[n] = Number(arr[i]?.value || 0);
    }
    return row;
  });
  return { dataset, networks: visibleNets };
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InsightsPage() {
  const [range, setRange] = useState<RangeKey>("30");
  const [tab, setTab] = useState<TabKey>("all");
  const [metric, setMetric] = useState<"reach" | "interactions">("reach");
  const days = Number(range);

  const summaryQ = useQuery<SummaryResponse>({
    queryKey: ["analytics-summary", days],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/summary?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error("summary");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const tsQ = useQuery<TimeseriesResponse>({
    queryKey: ["analytics-timeseries", days],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/timeseries?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error("timeseries");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const topQ = useQuery<TopResponse>({
    queryKey: ["analytics-top", days, tab],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/top?days=${days}&network=${tab}`, { credentials: "include" });
      if (!r.ok) throw new Error("top");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const insightsQ = useQuery<InsightsResponse>({
    queryKey: ["analytics-insights", days],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/insights?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error("insights");
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const chart = useMemo(() => buildChartData(tsQ.data, metric, tab), [tsQ.data, metric, tab]);

  const filteredNetworkSummary = useMemo(() => {
    if (!summaryQ.data) return null;
    if (tab === "all") return null;
    return summaryQ.data.networks.find((n) => n.network === tab) || null;
  }, [summaryQ.data, tab]);

  const totalsForCards = useMemo(() => {
    if (tab === "all") {
      const t = summaryQ.data?.totals;
      return t ? {
        views: { v: t.views, d: t.viewsDelta },
        engagements: { v: t.engagements, d: t.engagementsDelta },
        followers: { v: t.followers, d: t.followersDelta },
        posts: { v: t.posts, d: t.postsDelta },
      } : null;
    }
    const m = filteredNetworkSummary?.metrics;
    if (!m) return null;
    return {
      views: { v: m.views, d: m.viewsDelta },
      engagements: { v: m.engagements, d: m.engagementsDelta },
      followers: { v: m.followers, d: m.followersDelta },
      posts: null,
    };
  }, [tab, summaryQ.data, filteredNetworkSummary]);

  const handleExportCsv = () => {
    const rows: string[][] = [["video_id", "titulo", "publicado", "red", "vistas", "likes", "comentarios", "shares", "engagement_total"]];
    for (const it of topQ.data?.items || []) {
      const nets = Object.keys(it.perNetwork);
      if (nets.length === 0) {
        rows.push([String(it.videoId), it.title, it.publishedAt || "", "", "0", "0", "0", "0", String(it.engagement)]);
      } else {
        for (const n of nets) {
          const m = it.perNetwork[n];
          rows.push([
            String(it.videoId), it.title, it.publishedAt || "", n,
            String(m.views), String(m.likes), String(m.comments), String(m.shares), String(it.engagement),
          ]);
        }
      }
    }
    downloadCsv(`insights_${range}d_${tab}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              Analytics e insights
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Comparativas, top performers y recomendaciones automáticas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-card/50 border border-foreground/10 rounded-lg p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!topQ.data?.items?.length}>
              <Download className="w-4 h-4 mr-1.5" />
              CSV
            </Button>
          </div>
        </header>

        {/* Tabs por red */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setTab("all")}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors flex-shrink-0 ${tab === "all" ? "bg-primary text-primary-foreground border-primary" : "border-foreground/15 text-muted-foreground hover:text-foreground"}`}
          >
            Todas las redes
          </button>
          {NETWORKS.map((n) => (
            <button
              key={n}
              onClick={() => setTab(n)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors flex items-center gap-1.5 flex-shrink-0 ${tab === n ? "bg-primary text-primary-foreground border-primary" : "border-foreground/15 text-muted-foreground hover:text-foreground"}`}
            >
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm`} style={{ backgroundColor: NETWORK_HEX[n] }}>
                <NetworkIcon network={n} className="w-2.5 h-2.5" />
              </span>
              {NETWORK_LABELS[n]}
            </button>
          ))}
        </div>

        {/* Comparativa */}
        {summaryQ.isLoading ? (
          <AnalyticsSkeleton />
        ) : summaryQ.isError ? (
          <Card className="bg-card/40 border-rose-500/30">
            <CardContent className="p-6 text-center text-sm text-rose-400">
              No se pudieron cargar las métricas. Revisa tu conexión y vuelve a intentar.
            </CardContent>
          </Card>
        ) : totalsForCards ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CompareCard label="Vistas / alcance" value={totalsForCards.views.v} delta={totalsForCards.views.d} icon={<Eye className="w-3 h-3" />} />
            <CompareCard label="Engagement" value={totalsForCards.engagements.v} delta={totalsForCards.engagements.d} icon={<Heart className="w-3 h-3" />} />
            <CompareCard label="Seguidores" value={totalsForCards.followers.v} delta={totalsForCards.followers.d} icon={<TrendingUp className="w-3 h-3" />} />
            {totalsForCards.posts && (
              <CompareCard label="Publicaciones" value={totalsForCards.posts.v} delta={totalsForCards.posts.d} icon={<Sparkles className="w-3 h-3" />} />
            )}
            {!totalsForCards.posts && (
              <Card className="bg-card/30 border-foreground/10 border-dashed">
                <CardContent className="p-4 flex items-center justify-center text-xs text-muted-foreground">
                  Filtrado por {NETWORK_LABELS[tab as Network]}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="bg-card/40 border-foreground/10">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No hay datos disponibles para {tab === "all" ? "el período" : NETWORK_LABELS[tab as Network]}.
            </CardContent>
          </Card>
        )}

        {/* Gráfico multi-red */}
        <Card className="bg-card/50 border-foreground/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Tendencia diaria</h2>
              <div className="flex bg-foreground/5 rounded-md p-0.5">
                <button
                  onClick={() => setMetric("reach")}
                  className={`px-2 py-1 text-[11px] rounded ${metric === "reach" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  Alcance
                </button>
                <button
                  onClick={() => setMetric("interactions")}
                  className={`px-2 py-1 text-[11px] rounded ${metric === "interactions" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  Engagement
                </button>
              </div>
            </div>
            {tsQ.isLoading ? (
              <div className="h-72 flex items-center justify-center text-xs text-muted-foreground">Cargando…</div>
            ) : tsQ.isError ? (
              <div className="h-72 flex items-center justify-center text-xs text-rose-400">Error al cargar la serie. Intenta de nuevo.</div>
            ) : chart.networks.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-xs text-muted-foreground">Sin redes conectadas con datos.</div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <LineChart data={chart.dataset} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--foreground) / 0.08)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmt(Number(v))} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--foreground) / 0.1)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(v: number, name: string) => [fmt(v), NETWORK_LABELS[name as Network] || name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => NETWORK_LABELS[value as Network] || value} />
                    {chart.networks.map((n) => (
                      <Line key={n} type="monotone" dataKey={n} stroke={NETWORK_HEX[n]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI insights */}
        <Card className="bg-card/50 border-foreground/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-foreground">Recomendaciones de IA</h2>
              {insightsQ.isFetching && <span className="text-[10px] text-muted-foreground">generando…</span>}
            </div>
            {insightsQ.isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-lg bg-foreground/5 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(insightsQ.data?.insights || []).map((ins, i) => {
                  const Icon = ins.type === "win" ? CheckCircle2 : ins.type === "warning" ? AlertTriangle : Lightbulb;
                  const color = ins.type === "win" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : ins.type === "warning" ? "text-amber-400 border-amber-500/30 bg-amber-500/5" : "text-sky-400 border-sky-500/30 bg-sky-500/5";
                  return (
                    <div key={i} className={`rounded-lg border ${color} p-3`}>
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">{ins.title}</div>
                          <div className="text-xs text-muted-foreground mt-1">{ins.body}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!insightsQ.data?.insights || insightsQ.data.insights.length === 0) && (
                  <div className="col-span-full text-xs text-muted-foreground text-center py-4">
                    Sin recomendaciones por ahora.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top videos */}
        <Card className="bg-card/50 border-foreground/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Top videos por engagement</h2>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {tab === "all" ? "Todas las redes" : NETWORK_LABELS[tab as Network]}
              </span>
            </div>
            {topQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-foreground/5 animate-pulse" />
                ))}
              </div>
            ) : topQ.isError ? (
              <p className="text-xs text-rose-400 text-center py-6">
                No se pudo cargar el top de videos. Intenta de nuevo.
              </p>
            ) : topQ.data?.unsupported ? (
              <p className="text-xs text-amber-400 text-center py-6">
                {topQ.data.message || "Métricas por video no disponibles para esta red."}
              </p>
            ) : (topQ.data?.items?.length || 0) === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No hay videos con métricas en este rango.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-foreground/10">
                      <th className="text-left font-normal py-2 pr-2">#</th>
                      <th className="text-left font-normal py-2 pr-2">Video</th>
                      <th className="text-left font-normal py-2 pr-2 hidden sm:table-cell">Redes</th>
                      <th className="text-right font-normal py-2 pr-2"><Eye className="w-3 h-3 inline" /></th>
                      <th className="text-right font-normal py-2 pr-2"><Heart className="w-3 h-3 inline" /></th>
                      <th className="text-right font-normal py-2 pr-2"><MessageSquare className="w-3 h-3 inline" /></th>
                      <th className="text-right font-normal py-2 pr-2 hidden md:table-cell"><Share2 className="w-3 h-3 inline" /></th>
                      <th className="text-right font-normal py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(topQ.data?.items || []).map((it, i) => (
                      <tr key={it.videoId} className="border-b border-foreground/5 hover:bg-foreground/5">
                        <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {it.coverImageBase64 && (
                              <img
                                src={`data:${it.coverMimeType || "image/png"};base64,${it.coverImageBase64}`}
                                alt=""
                                className="w-8 h-8 rounded object-cover flex-shrink-0"
                                loading="lazy"
                              />
                            )}
                            <div className="min-w-0">
                              <a href={`/videos?select=${it.videoId}`} className="font-medium text-foreground hover:text-primary truncate block max-w-[200px] sm:max-w-[280px]">
                                {it.title}
                              </a>
                              <div className="text-[10px] text-muted-foreground">{fmtDate(it.publishedAt)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-2 hidden sm:table-cell">
                          <div className="flex gap-1">
                            {Object.keys(it.perNetwork).map((nn) => (
                              <span key={nn} className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: NETWORK_HEX[nn as Network] }}>
                                <NetworkIcon network={nn as Network} className="w-3 h-3" />
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{fmt(it.totals.views)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{fmt(it.totals.likes)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{fmt(it.totals.comments)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums hidden md:table-cell">{fmt(it.totals.shares)}</td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                            {fmt(it.engagement)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
