import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Loader2, Eye, Users, Zap, Film,
  ArrowUp, ArrowDown, Minus,
  CalendarClock, CheckCircle2, Clock, ChevronRight,
} from "lucide-react";
import { NetworkIcon, NETWORK_BG, NETWORK_LABELS, type Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

// ─── API response types ───────────────────────────────────────────────────────

type MetricBlock = { total: number; delta: number; kind?: string };

type NetworkAnalytics = {
  network: string;
  connected: boolean;
  reason?: string;
  metrics: { reach?: MetricBlock; followers?: MetricBlock; interactions?: MetricBlock } | null;
};

type AnalyticsSummary = {
  totals: { views: number; engagements: number; followers: number; posts: number };
  networks: NetworkAnalytics[];
};

// Per-network /status endpoint shapes
type YoutubeStatusResp = {
  connected: boolean;
  channel?: { id?: string | null; title?: string | null; thumbnail?: string | null; subscriberCount?: string | null };
  message?: string;
};
type InstagramStatusResp = {
  connected: boolean;
  account?: { username?: string | null; name?: string | null; profilePicture?: string | null; followersCount?: number | null };
  message?: string;
};
type TiktokStatusResp = {
  connected: boolean;
  user?: { openId?: string | null; displayName?: string | null; avatar?: string | null };
  message?: string;
};
type LinkedinStatusResp = {
  connected: boolean;
  user?: { name?: string | null; picture?: string | null; orgName?: string | null; personalName?: string | null };
  message?: string;
};
type XStatusResp = {
  connected: boolean;
  user?: { id?: string | null; username?: string | null };
  message?: string;
};
type FacebookStatusResp = {
  connected: boolean;
  pageName?: string | null;
  pagePicture?: string | null;
  message?: string;
};

type AllNetworkStatuses = {
  youtube: YoutubeStatusResp;
  instagram: InstagramStatusResp;
  tiktok: TiktokStatusResp;
  linkedin: LinkedinStatusResp;
  x: XStatusResp;
  facebook: FacebookStatusResp;
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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Delta({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-semibold">
        <ArrowUp className="w-3 h-3" />{value.toFixed(1)}%
      </span>
    );
  if (value < 0)
    return (
      <span className="flex items-center gap-0.5 text-red-400 text-xs font-semibold">
        <ArrowDown className="w-3 h-3" />{Math.abs(value).toFixed(1)}%
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-white/40 text-xs">
      <Minus className="w-3 h-3" />0%
    </span>
  );
}

function MetricCard({
  label, value, delta, icon: Icon, accent,
}: {
  label: string; value: number; delta: number; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
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

// Derive display name + handle + avatar from the per-network status responses
function networkAccount(n: Network, statuses: AllNetworkStatuses | undefined): {
  name: string | null; handle: string | null; avatar: string | null;
} {
  if (!statuses) return { name: null, handle: null, avatar: null };
  switch (n) {
    case "youtube": {
      const s = statuses.youtube;
      return { name: s.channel?.title ?? null, handle: null, avatar: s.channel?.thumbnail ?? null };
    }
    case "instagram": {
      const s = statuses.instagram;
      return {
        name: s.account?.name ?? null,
        handle: s.account?.username ? `@${s.account.username}` : null,
        avatar: s.account?.profilePicture ?? null,
      };
    }
    case "tiktok": {
      const s = statuses.tiktok;
      return { name: s.user?.displayName ?? null, handle: null, avatar: s.user?.avatar ?? null };
    }
    case "linkedin": {
      const s = statuses.linkedin;
      const name = s.user?.name ?? s.user?.orgName ?? s.user?.personalName ?? null;
      return { name, handle: null, avatar: s.user?.picture ?? null };
    }
    case "x": {
      const s = statuses.x;
      return {
        name: s.user?.username ? `@${s.user.username}` : null,
        handle: null,
        avatar: null,
      };
    }
    case "facebook": {
      const s = statuses.facebook;
      return { name: s.pageName ?? null, handle: null, avatar: s.pagePicture ?? null };
    }
  }
}

function NetworkCard({
  n, analytics, statuses,
}: {
  n: Network;
  analytics: NetworkAnalytics | undefined;
  statuses: AllNetworkStatuses | undefined;
}) {
  const label = NETWORK_LABELS[n];
  const bg = NETWORK_BG[n];
  const connected = analytics?.connected ?? false;
  const followers = analytics?.metrics?.followers?.total ?? 0;
  const reach = analytics?.metrics?.reach?.total ?? 0;
  const account = networkAccount(n, statuses);

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
          <NetworkIcon network={n} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{label}</p>
          <p className={`text-xs font-medium truncate ${connected ? "text-emerald-400" : "text-white/30"}`}>
            {connected ? (account.name ?? "Conectada") : "Sin conectar"}
          </p>
        </div>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-emerald-400" : "bg-white/15"}`} />
      </div>

      {connected && account.handle && (
        <p className="text-white/40 text-[11px] -mt-1 truncate">{account.handle}</p>
      )}

      {connected && (followers > 0 || reach > 0) && (
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

function statusBadgeClass(s: string | null) {
  if (!s || s === "pending") return null;
  if (s === "published") return "bg-emerald-500/20 text-emerald-400";
  if (s === "error") return "bg-red-500/20 text-red-400";
  if (s === "scheduled") return "bg-orange-500/20 text-orange-400";
  return "bg-white/10 text-white/50";
}

function VideoRow({ v, showDate }: { v: Video; showDate: "scheduled" | "published" }) {
  const date = showDate === "scheduled" ? v.scheduledAt : (v.publishedAt ?? v.scheduledAt);
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{v.title}</p>
        <p className="text-white/40 text-xs mt-0.5">{fmtDate(date)}</p>
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {STATUS_PLATFORMS.map(({ key, label }) => {
            const cls = statusBadgeClass(v[key] as string | null);
            if (!cls) return null;
            return (
              <span key={key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>
                {label}
              </span>
            );
          })}
        </div>
      </div>
      {showDate === "scheduled"
        ? <CalendarClock className="w-4 h-4 text-orange-400/70 flex-shrink-0 mt-0.5" />
        : <CheckCircle2 className="w-4 h-4 text-emerald-400/70 flex-shrink-0 mt-0.5" />}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const NETWORKS: Network[] = ["tiktok", "instagram", "youtube", "linkedin", "x", "facebook"];

export default function EjecutivoPage() {
  const [, setLocation] = useLocation();

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary-hub"],
    queryFn: () => apiFetch<AnalyticsSummary>("/analytics/summary?days=7"),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { data: statuses, isLoading: loadingStatuses } = useQuery<AllNetworkStatuses>({
    queryKey: ["network-statuses-hub"],
    queryFn: async () => {
      const [youtube, instagram, tiktok, linkedin, x, facebook] = await Promise.allSettled([
        apiFetch<YoutubeStatusResp>("/youtube/channel"),
        apiFetch<InstagramStatusResp>("/instagram/status"),
        apiFetch<TiktokStatusResp>("/tiktok/status"),
        apiFetch<LinkedinStatusResp>("/linkedin/status"),
        apiFetch<XStatusResp>("/x/status"),
        apiFetch<FacebookStatusResp>("/facebook/status"),
      ]);
      const unwrap = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === "fulfilled" ? r.value : fallback;
      return {
        youtube: unwrap(youtube, { connected: false }),
        instagram: unwrap(instagram, { connected: false }),
        tiktok: unwrap(tiktok, { connected: false }),
        linkedin: unwrap(linkedin, { connected: false }),
        x: unwrap(x, { connected: false }),
        facebook: unwrap(facebook, { connected: false }),
      };
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { data: videos, isLoading: loadingVideos } = useQuery<Video[]>({
    queryKey: ["videos-hub"],
    queryFn: () => apiFetch<Video[]>("/content/videos"),
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
    .sort((a, b) =>
      new Date(b.publishedAt ?? b.scheduledAt ?? 0).getTime() -
      new Date(a.publishedAt ?? a.scheduledAt ?? 0).getTime()
    )
    .slice(0, 5);

  const totals = analytics?.totals ?? { views: 0, engagements: 0, followers: 0, posts: 0 };
  const analyticsMap = Object.fromEntries((analytics?.networks ?? []).map((n) => [n.network, n]));

  const loading = loadingAnalytics || loadingStatuses || loadingVideos;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0A0A0A", overflowY: "auto",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "white", zIndex: 50,
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem 5rem" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #E86A30, #f97316)" }}>
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Hub Ejecutivo</h1>
              <p className="text-white/40 text-xs">WebMaker · Resumen últimos 7 días</p>
            </div>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-white/30 animate-spin" />}
        </div>

        {/* Metric summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <MetricCard label="Vistas" value={totals.views} delta={0} icon={Eye} accent="#E86A30" />
          <MetricCard label="Engagements" value={totals.engagements} delta={0} icon={Zap} accent="#c9a44a" />
          <MetricCard label="Seguidores" value={totals.followers} delta={0} icon={Users} accent="#4faf6a" />
          <MetricCard label="Posts" value={totals.posts} delta={0} icon={Film} accent="#6aa0c0" />
        </div>

        {/* Network status grid */}
        <div className="mb-8">
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <span>Redes sociales</span>
            <span className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {NETWORKS.map((n) => (
              <NetworkCard
                key={n}
                n={n}
                analytics={analyticsMap[n]}
                statuses={statuses}
              />
            ))}
          </div>
        </div>

        {/* Upcoming + Recent lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div>
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 text-orange-400" />
              <span>Próximas publicaciones</span>
              <span className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              {upcoming.length > 0 && (
                <span className="text-orange-400 text-[10px] font-bold bg-orange-400/10 px-2 py-0.5 rounded-full">
                  {upcoming.length}
                </span>
              )}
            </h2>
            <div className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
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

          <div>
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Publicadas recientemente</span>
              <span className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              {recent.length > 0 && (
                <span className="text-emerald-400 text-[10px] font-bold bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  {recent.length}
                </span>
              )}
            </h2>
            <div className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
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
        style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 100, background: "rgba(0,0,0,0.72)" }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-medium shadow-xl backdrop-blur-sm transition-colors hover:bg-black/90 border border-white/10"
      >
        <img src="/icon-192.png" alt="Logo" style={{ width: 20, height: 20, borderRadius: 5 }} />
        <ChevronRight className="w-3.5 h-3.5 rotate-180 opacity-60" />
        <span>Panel Admin</span>
      </button>
    </div>
  );
}
