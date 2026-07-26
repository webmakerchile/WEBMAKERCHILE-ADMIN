import { useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketsInline } from "@/components/tickets-inline";
import { MetasInline } from "@/components/metas-inline";
import {
  useVideos, useAnalytics, publishedNetworks, WORKFLOW_META, fmtFecha, fmtNumero,
  NETWORKS, NETWORK_LABELS, type ContentVideo, type Network, type WorkflowStatus,
} from "@/lib/contenido";
import {
  Loader2, AlertTriangle, CalendarClock, Users2, Sparkles, MessageSquareText,
  ArrowRight, Plus, Eye, Heart, UserPlus, Send, CircleAlert,
} from "lucide-react";

/**
 * Centro de Redes Sociales.
 *
 * A quien lleva las redes no le sirve la cola de edición: le sirve el
 * calendario. La pantalla se organiza por CUÁNDO sale cada cosa y por el
 * estado de cada red, no por el avance de producción.
 */

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Lunes de la semana en curso, a medianoche. */
function inicioSemana(): Date {
  const hoy = new Date();
  const dow = (hoy.getDay() + 6) % 7;
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow);
  return lunes;
}

export default function RedesPage() {
  const { data: videos = [], isLoading, error } = useVideos();
  const { data: analytics } = useAnalytics(7);

  const semana = useMemo(() => {
    const lunes = inicioSemana();
    return DIAS.map((label, i) => {
      const dia = new Date(lunes.getTime() + i * 86_400_000);
      const siguiente = new Date(dia.getTime() + 86_400_000);
      const delDia = videos.filter(v => {
        if (!v.scheduledAt) return false;
        const t = new Date(v.scheduledAt).getTime();
        return t >= dia.getTime() && t < siguiente.getTime();
      });
      const hoy = new Date().toDateString() === dia.toDateString();
      return { label, fecha: dia, videos: delDia, hoy };
    });
  }, [videos]);

  const proximas = useMemo(() => {
    const ahora = Date.now();
    return videos
      .filter(v => v.scheduledAt && new Date(v.scheduledAt).getTime() >= ahora)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
      .slice(0, 6);
  }, [videos]);

  /** Programados cuya hora ya pasó y siguen sin publicarse: hay que mirarlos. */
  const atrasados = useMemo(() => {
    const ahora = Date.now();
    return videos.filter(v =>
      v.scheduledAt &&
      new Date(v.scheduledAt).getTime() < ahora &&
      v.workflowStatus !== "publicado" &&
      publishedNetworks(v).length === 0,
    );
  }, [videos]);

  const listasParaProgramar = useMemo(
    () => videos.filter(v => v.workflowStatus === "aprobado" && !v.scheduledAt),
    [videos],
  );

  const redes = useMemo(() => {
    const conectadas = new Map((analytics?.networks ?? []).map(n => [n.network, n.connected]));
    return NETWORKS.map(n => ({
      id: n,
      label: NETWORK_LABELS[n],
      conectada: conectadas.get(n) ?? false,
      publicados: videos.filter(v => publishedNetworks(v).includes(n)).length,
    }));
  }, [analytics, videos]);

  const totales = analytics?.totals;

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Redes sociales</h1>
            <p className="text-muted-foreground text-xs sm:text-base">
              Qué sale esta semana, en qué red, y qué está esperando fecha.
            </p>
          </div>
          <Link href="/schedule">
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Programar publicación</Button>
          </Link>
        </header>

        {/* Lo urgente primero: lo que debió salir y no salió. */}
        {atrasados.length > 0 && (
          <Card className="bg-card/40 border-red-500/25">
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2 text-red-400">
                <CircleAlert className="w-4 h-4" /> Debieron salir y siguen sin publicarse
              </p>
              <ul className="space-y-1.5">
                {atrasados.map(v => (
                  <li key={v.id}>
                    <Link href={`/schedule`} className="flex flex-wrap items-center gap-2 text-sm hover:underline">
                      <span className="flex-1 min-w-[10rem] truncate">{v.title}</span>
                      <span className="text-[11px] text-red-400">{fmtFecha(v.scheduledAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {totales && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Vistas (7 días)", value: fmtNumero(totales.views), icon: Eye },
              { label: "Interacciones", value: fmtNumero(totales.engagements), icon: Heart },
              { label: "Seguidores", value: fmtNumero(totales.followers), icon: UserPlus },
              { label: "Publicaciones", value: fmtNumero(totales.posts), icon: Send },
            ].map(k => {
              const Icon = k.icon;
              return (
                <Card key={k.label} className="bg-card/40 border-foreground/10">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
                    </div>
                    <p className="text-2xl font-bold">{k.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-primary" /> Esta semana
                  </p>
                  <Link href="/schedule" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    Ver calendario <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {semana.map(d => (
                    <div
                      key={d.label}
                      className={`rounded-lg border p-2 min-h-[5.5rem] ${
                        d.hoy ? "border-primary/40 bg-primary/5" : "border-foreground/10 bg-card/40"
                      }`}
                    >
                      <p className={`text-[10px] mb-1 ${d.hoy ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {d.label} {d.fecha.getDate()}
                      </p>
                      <div className="space-y-1">
                        {d.videos.slice(0, 3).map(v => (
                          <p key={v.id} className="text-[10px] leading-tight truncate px-1 py-0.5 rounded bg-foreground/10">
                            {v.title}
                          </p>
                        ))}
                        {d.videos.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">+{d.videos.length - 3} más</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3">Próximas publicaciones</p>
                  {proximas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No hay nada programado. <Link href="/schedule" className="text-primary hover:underline">Programar algo</Link>.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {proximas.map(v => <ProximaFila key={v.id} video={v} />)}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-2">
                    <Users2 className="w-4 h-4 text-primary" /> Estado de las cuentas
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Una red desconectada no publica, aunque el video esté programado.
                  </p>
                  <ul className="space-y-1.5">
                    {redes.map(r => (
                      <li key={r.id} className="flex items-center gap-3 text-sm">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.conectada ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        <span className="flex-1">{r.label}</span>
                        <span className="text-[11px] text-muted-foreground">{r.publicados} publicados</span>
                        {!r.conectada && (
                          <Link href="/cuentas" className="text-[11px] text-amber-400 hover:underline">conectar</Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {listasParaProgramar.length > 0 && (
              <Card className="bg-card/40 border-emerald-500/25">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-1 text-emerald-400">
                    Aprobados esperando fecha ({listasParaProgramar.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Están listos y nadie los ha programado todavía.
                  </p>
                  <ul className="space-y-1.5">
                    {listasParaProgramar.map(v => (
                      <li key={v.id}>
                        <Link href="/schedule" className="flex items-center gap-2 text-sm hover:underline">
                          <span className="flex-1 truncate">{v.title}</span>
                          <ArrowRight className="w-3 h-3 text-primary" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { href: "/historias", icon: Sparkles, label: "Historias", desc: "Stories 9:16 con IA" },
                { href: "/descripciones", icon: MessageSquareText, label: "Posts IA", desc: "Carruseles y textos" },
                { href: "/insights", icon: Eye, label: "Insights", desc: "Métricas por red" },
              ].map(h => {
                const Icon = h.icon;
                return (
                  <Link key={h.href} href={h.href}>
                    <Card className="bg-card/40 border-foreground/10 hover:border-primary/30 transition-base cursor-pointer h-full">
                      <CardContent className="p-4">
                        <Icon className="w-5 h-5 text-primary mb-2" />
                        <p className="text-sm font-medium">{h.label}</p>
                        <p className="text-[11px] text-muted-foreground">{h.desc}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            <MetasInline />

            <TicketsInline title="Lo que le pidieron a redes" />
          </>
        )}
      </div>
    </Layout>
  );
}

function ProximaFila({ video }: { video: ContentVideo }) {
  const meta = WORKFLOW_META[video.workflowStatus as WorkflowStatus] ?? WORKFLOW_META.borrador;
  const destino = NETWORKS.filter(n => {
    const desc: Record<Network, string | null> = {
      youtube: video.youtubeTitle, tiktok: video.tiktokDescription, instagram: video.instagramDescription,
      linkedin: video.linkedinDescription, x: video.xDescription, facebook: video.instagramDescription,
    };
    return !!desc[n];
  });

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-card/40 px-3 py-2">
      <div className="flex-1 min-w-[9rem]">
        <p className="text-sm truncate">{video.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {fmtFecha(video.scheduledAt)}
          {destino.length > 0 && ` · ${destino.map(d => NETWORK_LABELS[d]).join(", ")}`}
        </p>
      </div>
      <Badge className={meta.className}>{meta.label}</Badge>
    </li>
  );
}
