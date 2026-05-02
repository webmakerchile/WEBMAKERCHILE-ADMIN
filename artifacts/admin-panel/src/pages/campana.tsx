import { useMemo } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  Calendar,
  Megaphone,
  Loader2,
  Video as VideoIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { NETWORK_LABELS, NetworkIcon, type Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Campaign = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  startsAt: string | null;
  endsAt: string | null;
};

type VideoLite = {
  id: number;
  title: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  coverImageBase64: string | null;
  coverMimeType: string | null;
  youtubeStatus: string | null;
  instagramStatus: string | null;
  tiktokStatus: string | null;
  linkedinStatus: string | null;
  xStatus: string | null;
  facebookStatus: string | null;
};

type CampaignDetail = {
  campaign: Campaign;
  videos: VideoLite[];
  counters: {
    total: number;
    draft: number;
    scheduled: number;
    published: number;
    partial: number;
    error: number;
    byNetwork: Record<Network, number>;
  };
};

const NETWORKS: Network[] = ["tiktok", "instagram", "youtube", "linkedin", "x", "facebook"];

export default function CampanaPage() {
  const [, params] = useRoute<{ id: string }>("/campanas/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);

  const { data, isLoading, error } = useQuery<CampaignDetail>({
    queryKey: ["library", "campaign", id],
    enabled: Number.isFinite(id),
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/library/campaigns/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("No se pudo cargar la campaña");
      return r.json();
    },
  });

  if (!Number.isFinite(id)) {
    return (
      <Layout>
        <div className="text-center py-12 text-muted-foreground">Campaña inválida.</div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="text-center py-12 text-muted-foreground">
          No se pudo cargar la campaña.
          <div className="mt-3"><Link href="/biblioteca"><a className="text-primary text-sm">Volver a la biblioteca</a></Link></div>
        </div>
      </Layout>
    );
  }

  const { campaign, videos, counters } = data;

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/biblioteca")} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Biblioteca
          </Button>
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: campaign.color }} aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{campaign.name}</h1>
              {campaign.description ? (
                <p className="text-sm text-muted-foreground line-clamp-2">{campaign.description}</p>
              ) : null}
            </div>
          </div>
        </header>

        {(campaign.startsAt || campaign.endsAt) ? (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md">
            <Calendar className="w-3.5 h-3.5" />
            {campaign.startsAt ? new Date(campaign.startsAt).toLocaleDateString() : "—"}
            {" → "}
            {campaign.endsAt ? new Date(campaign.endsAt).toLocaleDateString() : "—"}
          </div>
        ) : null}

        {/* Aggregate metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Total" value={counters.total} icon={<VideoIcon className="w-4 h-4" />} tone="neutral" />
          <MetricCard label="Borrador" value={counters.draft} icon={<Clock className="w-4 h-4" />} tone="muted" />
          <MetricCard label="Programados" value={counters.scheduled} icon={<Calendar className="w-4 h-4" />} tone="info" />
          <MetricCard label="Publicados" value={counters.published} icon={<CheckCircle2 className="w-4 h-4" />} tone="success" />
          <MetricCard label="Con error" value={counters.error + counters.partial} icon={<AlertCircle className="w-4 h-4" />} tone="error" />
        </div>

        <Card className="bg-card/60">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Publicaciones por red</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {NETWORKS.map((n) => (
                <div key={n} className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <NetworkIcon network={n} className="w-3.5 h-3.5" /> {NETWORK_LABELS[n]}
                  </span>
                  <span className="text-sm font-semibold">{counters.byNetwork[n] ?? 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="bg-card/60">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Línea de tiempo</h3>
            <Timeline videos={videos} color={campaign.color} />
          </CardContent>
        </Card>

        {/* Video list */}
        <Card className="bg-card/60">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Videos en la campaña</h3>
            {videos.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Esta campaña no tiene videos asignados.
                <div className="mt-2 text-xs">Asigna videos desde la lista de videos con la acción "Asignar a campaña".</div>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {videos.map((v) => (
                  <li key={v.id} className="py-2 flex items-center gap-3">
                    {v.coverImageBase64 ? (
                      <img
                        src={`data:${v.coverMimeType || "image/png"};base64,${v.coverImageBase64}`}
                        alt={v.title}
                        className="w-10 h-14 object-cover rounded-md shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-14 rounded-md bg-muted shrink-0 flex items-center justify-center text-muted-foreground">
                        <VideoIcon className="w-4 h-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Link href={`/videos?select=${v.id}`}>
                        <a className="text-sm font-medium hover:text-primary transition-colors line-clamp-1">{v.title}</a>
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {v.scheduledAt ? `Programado · ${new Date(v.scheduledAt).toLocaleString()}` : "Sin programar"}
                      </p>
                    </div>
                    <StatusBadge status={v.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "neutral" | "muted" | "info" | "success" | "error" }) {
  const toneClass: Record<typeof tone, string> = {
    neutral: "text-foreground",
    muted: "text-muted-foreground",
    info: "text-blue-400",
    success: "text-emerald-400",
    error: "text-rose-400",
  };
  return (
    <Card className="bg-card/60">
      <CardContent className="p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${toneClass[tone]}`}>{value}</p>
        </div>
        <div className={toneClass[tone]}>{icon}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Borrador", className: "bg-zinc-500/10 text-zinc-400" },
    cover_generated: { label: "Portada", className: "bg-purple-500/10 text-purple-400" },
    scheduled: { label: "Programado", className: "bg-orange-500/10 text-orange-400" },
    published: { label: "Publicado", className: "bg-emerald-500/10 text-emerald-400" },
    partial: { label: "Parcial", className: "bg-amber-500/10 text-amber-400" },
    error: { label: "Error", className: "bg-rose-500/10 text-rose-400" },
  };
  const v = map[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`text-[10px] ${v.className}`}>{v.label}</Badge>;
}

function Timeline({ videos, color }: { videos: VideoLite[]; color: string }) {
  const range = useMemo(() => {
    const dates = videos.map((v) => v.scheduledAt || v.publishedAt).filter(Boolean) as string[];
    if (dates.length === 0) return null;
    const ts = dates.map((d) => new Date(d).getTime()).filter(Number.isFinite);
    if (ts.length === 0) return null;
    let min = Math.min(...ts);
    let max = Math.max(...ts);
    if (min === max) {
      min -= 24 * 3600 * 1000;
      max += 24 * 3600 * 1000;
    }
    return { min, max };
  }, [videos]);

  if (!range) {
    return <div className="text-center py-8 text-muted-foreground text-xs">Programa los videos para ver la línea de tiempo.</div>;
  }

  const span = range.max - range.min;

  return (
    <div className="space-y-3">
      <div className="relative h-12 bg-muted/30 rounded-md overflow-x-auto overflow-y-hidden">
        <div className="absolute inset-y-0 left-0 right-0">
          {videos.map((v) => {
            const t = v.scheduledAt || v.publishedAt;
            if (!t) return null;
            const x = ((new Date(t).getTime() - range.min) / span) * 100;
            return (
              <Link key={v.id} href={`/videos?select=${v.id}`}>
                <a
                  className="absolute top-1 bottom-1 -translate-x-1/2 group"
                  style={{ left: `${x}%` }}
                  title={`${v.title} · ${new Date(t).toLocaleString()}`}
                >
                  <span
                    className="block w-2.5 h-2.5 rounded-full ring-2 ring-background mx-auto mt-3 group-hover:scale-150 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                </a>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{new Date(range.min).toLocaleDateString()}</span>
        <span>{new Date(range.max).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
