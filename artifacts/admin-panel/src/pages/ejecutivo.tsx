import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, Eye, Users, Zap, Film, ArrowUp, ArrowDown, Minus, CalendarClock, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { NetworkIcon, NETWORK_BG, NETWORK_LABELS, type Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type MetricBlock = {
  total: number;
  delta: number;
  kind?: string;
};

type NetworkSummary = {
  network: string;
  connected: boolean;
  reason?: string;
  metrics: {
    reach?: MetricBlock;
    followers?: MetricBlock;
    interactions?: MetricBlock;
  } | null;
};

type AnalyticsSummary = {
  totals: { views: number; engagements: number; followers: number; posts: number };
  networks: NetworkSummary[];
};

type Video = {
  id: number;
  title: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  tiktokStatus: string | null;
  instagramStatus: string | null;
  youtubeStatus: string | null;
  linkedinStatus: string | null;
  xStatus: string | null;
  facebookStatus: string | null;
  month: string | null;
  week: string | null;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Delta({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-semibold">
        <ArrowUp className="w-3 h-3" />
        {value.toFixed(1)}%
      </span>
    );
  if (value < 0)
    return (
      <span className="flex items-center gap-0.5 text-red-400 text-xs font-semibold">
        <ArrowDown className="w-3 h-3" />
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-white/40 text-xs">
      <Minus className="w-3 h-3" />
      0%
    </span>
  );
}

function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  delta: number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between">
        <span className="text-white/50 text-xs font-medium uppercase tracking-widest">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: accent + "22" }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
      </div>
      <div className="text-3xl font-bold text-white tracking-tight">{fmt(value)}</div>
      <div className="flex items-center gap-1.5">
        <Delta value={delta} />
        <span className="text-white/30 text-xs">vs semana anterior</span>
      </div>
    </div>
  );
}

const NETWORKS: Network[] = ["tiktok", "instagram", "youtube", "linkedin", "x", "facebook"];

function NetworkCard({ net }: { net: NetworkSummary }) {
  const n = net.network as Network;
  const label = NETWORK_LABELS[n] ?? net.network;
  const bg = NETWORK_BG[n] ?? "bg-white/5";
  const followers = net.metrics?.followers?.total ?? 0;
  const reach = net.metrics?.reach?.total ?? 0;

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
          <NetworkIcon network={n} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{label}</p>
          <p className={`text-xs font-medium ${net.connected ? "text-emerald-400" : "text-white/30"}`}>
            {net.connected ? "Conectada" : "Sin conectar"}
          </p>
        </div>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${net.connected ? "bg-emerald-400" : "bg-white/15"}`} />
      </div>
      {net.connected && (followers > 0 || reach > 0) && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
          {followers > 0 && (
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wider">Seguidores</p>
              <p className="text-white text-sm font-bold">{fmt(followers)}</p>
            </div>
          )}
          {reach > 0 && (
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wider">Alcance</p>
              <p className="text-white text-sm font-bold">{fmt(reach)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_PLATFORMS: Array<{ key: keyof Video; label: string }> = [
  { key: "tiktokStatus", label: "TK" },
  { key: "instagramStatus", label: "IG" },
  { key: "youtubeStatus", label: "YT" },
  { key: "linkedinStatus", label: "LI" },
  { key: "xStatus", label: "X" },
  { key: "facebookStatus", label: "FB" },
];

function statusColor(s: string | null) {
  if (!s || s === "pending") return "bg-white/15 text-white/40";
  if (s === "published") return "bg-emerald-500/20 text-emerald-400";
  if (s === "error") return "bg-red-500/20 text-red-400";
  if (s === "scheduled") return "bg-orange-500/20 text-orange-400";
  return "bg-white/10 text-white/50";
}

function VideoRow({ v, showDate }: { v: Video; showDate: "scheduled" | "published" }) {
  const date = showDate === "scheduled" ? v.scheduledAt : v.publishedAt;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{v.title}</p>
        <p className="text-white/40 text-xs mt-0.5">{fmtDate(date)}</p>
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {STATUS_PLATFORMS.map(({ key, label }) => {
            const s = v[key] as string | null;
            if (!s || s === "pending") return null;
            return (
              <span key={key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${statusColor(s)}`}>
                {label}
              </span>
            );
          })}
        </div>
      </div>
      {showDate === "scheduled" ? (
        <CalendarClock className="w-4 h-4 text-orange-400/70 flex-shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-400/70 flex-shrink-0 mt-0.5" />
      )}
    </div>
  );
}

export default function EjecutivoPage() {
  const [, setLocation] = useLocation();

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary-hub"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/summary?days=7`, { credentials: "include" });
      if (!r.ok) throw new Error("Error cargando analíticas");
      return r.json();
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { data: videos, isLoading: loadingVideos } = useQuery<Video[]>({
    queryKey: ["videos-hub"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/content/videos`, { credentials: "include" });
      if (!r.ok) throw new Error("Error cargando videos");
      return r.json();
    },
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const now = new Date();

  const upcoming = (videos ?? [])
    .filter((v) => v.status === "scheduled" && v.scheduledAt && new Date(v.scheduledAt) >= now)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    .slice(0, 8);

  const recent = (videos ?? [])
    .filter((v) => v.status === "published")
    .sort((a, b) => new Date(b.publishedAt ?? b.scheduledAt ?? 0).getTime() - new Date(a.publishedAt ?? a.scheduledAt ?? 0).getTime())
    .slice(0, 5);

  const totals = analytics?.totals ?? { views: 0, engagements: 0, followers: 0, posts: 0 };

  const networksMap = Object.fromEntries((analytics?.networks ?? []).map((n) => [n.network, n]));
  const networkCards: NetworkSummary[] = NETWORKS.map(
    (n) => networksMap[n] ?? { network: n, connected: false, metrics: null }
  );

  const loading = loadingAnalytics || loadingVideos;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0A0A",
        overflowY: "auto",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "white",
        zIndex: 50,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #E86A30, #f97316)" }}
            >
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Hub Ejecutivo</h1>
              <p className="text-white/40 text-xs">WebMaker · Resumen últimos 7 días</p>
            </div>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-white/30 animate-spin" />}
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <MetricCard label="Vistas" value={totals.views} delta={0} icon={Eye} accent="#E86A30" />
          <MetricCard label="Engagements" value={totals.engagements} delta={0} icon={Zap} accent="#c9a44a" />
          <MetricCard label="Seguidores" value={totals.followers} delta={0} icon={Users} accent="#4faf6a" />
          <MetricCard label="Posts" value={totals.posts} delta={0} icon={Film} accent="#6aa0c0" />
        </div>

        {/* Networks */}
        <div className="mb-8">
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <span>Redes sociales</span>
            <span className="flex-1 h-px bg-white/8" />
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {networkCards.map((net) => (
              <NetworkCard key={net.network} net={net} />
            ))}
          </div>
        </div>

        {/* Upcoming + Recent */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Próximas publicaciones */}
          <div>
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 text-orange-400" />
              <span>Próximas publicaciones</span>
              <span className="flex-1 h-px bg-white/8" />
              {upcoming.length > 0 && (
                <span className="text-orange-400 text-[10px] font-bold bg-orange-400/10 px-2 py-0.5 rounded-full">
                  {upcoming.length}
                </span>
              )}
            </h2>
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {loadingVideos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
                </div>
              ) : upcoming.length === 0 ? (
                <div className="py-8 text-center">
                  <Clock className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-white/30 text-sm">Sin publicaciones programadas</p>
                </div>
              ) : (
                upcoming.map((v) => <VideoRow key={v.id} v={v} showDate="scheduled" />)
              )}
            </div>
          </div>

          {/* Publicadas recientemente */}
          <div>
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Publicadas recientemente</span>
              <span className="flex-1 h-px bg-white/8" />
              {recent.length > 0 && (
                <span className="text-emerald-400 text-[10px] font-bold bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  {recent.length}
                </span>
              )}
            </h2>
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {loadingVideos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
                </div>
              ) : recent.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-white/30 text-sm">Sin publicaciones recientes</p>
                </div>
              ) : (
                recent.map((v) => <VideoRow key={v.id} v={v} showDate="published" />)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating back button */}
      <button
        onClick={() => setLocation("/")}
        title="Volver al panel"
        style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 100 }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-medium shadow-xl transition-all"
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.9)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.7)"; }}
        onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.95)"; }}
        onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.9)"; }}
        ref={(el) => { if (el) el.style.background = "rgba(0,0,0,0.7)"; }}
      >
        <img src="/icon-192.png" alt="Logo" style={{ width: 20, height: 20, borderRadius: 5 }} />
        <ChevronRight className="w-3.5 h-3.5 rotate-180 opacity-60" />
        <span>Panel Admin</span>
      </button>
    </div>
  );
}
