import { useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketsInline } from "@/components/tickets-inline";
import { useHubOwner } from "@/lib/hub-owner";
import {
  useVideos, useAnalytics, publishedNetworks, fmtNumero, fmtFecha,
  NETWORKS, NETWORK_LABELS, WORKFLOW_META, type WorkflowStatus,
} from "@/lib/contenido";
import {
  Loader2, AlertTriangle, BarChart3, Library, CheckCheck, ArrowRight,
  TrendingUp, Target, Users2, FileCode2,
} from "lucide-react";

/**
 * Centro de Marketing.
 *
 * Marketing no produce ni programa: decide y aprueba. Esta pantalla se ordena
 * por resultado (qué está funcionando), por decisión pendiente (qué espera su
 * aprobación) y por cliente (para qué cuenta estamos trabajando).
 */
export default function MarketingPage() {
  const { data: videos = [], isLoading, error } = useVideos();
  const { data: analytics } = useAnalytics(7);
  const { data: board } = useHubOwner();

  const enRevision = useMemo(
    () => videos.filter(v => v.workflowStatus === "en_revision"),
    [videos],
  );

  const publicados = useMemo(() => {
    const hace30 = Date.now() - 30 * 86_400_000;
    return videos.filter(v => v.workflowStatus === "publicado" && new Date(v.updatedAt).getTime() >= hace30);
  }, [videos]);

  /** Alcance por red en lo publicado: dónde vale la pena insistir. */
  const porRed = useMemo(() => {
    const conectadas = new Map((analytics?.networks ?? []).map(n => [n.network, n]));
    return NETWORKS.map(n => {
      const info = conectadas.get(n);
      const metrics = info?.metrics ?? {};
      return {
        id: n,
        label: NETWORK_LABELS[n],
        conectada: info?.connected ?? false,
        vistas: Number(metrics.views ?? metrics.impressions ?? 0),
        seguidores: Number(metrics.followers ?? 0),
        publicados: publicados.filter(v => publishedNetworks(v).includes(n)).length,
      };
    }).sort((a, b) => b.vistas - a.vistas);
  }, [analytics, publicados]);

  const maxVistas = Math.max(1, ...porRed.map(r => r.vistas));
  const totales = analytics?.totals;

  const proyectos = board?.data.projects ?? [];
  const clientes = board?.data.clients ?? [];
  const contratos = board?.data.contracts ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Marketing</h1>
            <p className="text-muted-foreground text-xs sm:text-base">
              Qué está funcionando, qué espera tu aprobación y para qué cliente trabajamos.
            </p>
          </div>
          <Link href="/insights">
            <Button size="sm" variant="outline">
              <BarChart3 className="w-4 h-4 mr-1.5" /> Insights completos
            </Button>
          </Link>
        </header>

        {/* La decisión pendiente va primero: si marketing no aprueba, nada sale. */}
        {enRevision.length > 0 && (
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/25">
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-1 flex items-center gap-2 text-purple-300">
                <CheckCheck className="w-4 h-4" /> Esperan tu aprobación ({enRevision.length})
              </p>
              <p className="text-[11px] text-muted-foreground mb-3">
                Hasta que apruebes, este contenido no se puede programar.
              </p>
              <ul className="space-y-1.5">
                {enRevision.map(v => (
                  <li key={v.id}>
                    <Link
                      href={`/videos?select=${v.id}`}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-card/40 px-3 py-2 hover:border-purple-500/40 transition-base"
                    >
                      <span className="flex-1 min-w-[10rem] text-sm truncate">{v.title}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtFecha(v.updatedAt)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-purple-300" />
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
              { label: "Vistas (7 días)", value: fmtNumero(totales.views), tone: "text-primary" },
              { label: "Interacciones", value: fmtNumero(totales.engagements), tone: "text-pink-400" },
              { label: "Seguidores", value: fmtNumero(totales.followers), tone: "text-sky-400" },
              { label: "Publicado (30 días)", value: String(publicados.length), tone: "text-emerald-400" },
            ].map(k => (
              <Card key={k.label} className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.tone}`}>{k.value}</p>
                </CardContent>
              </Card>
            ))}
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
                <p className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Rendimiento por red
                </p>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Ordenado por alcance: arriba está donde tu contenido rinde más.
                </p>
                <div className="space-y-2">
                  {porRed.map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="w-20 text-xs truncate">{r.label}</span>
                      <div className="flex-1 h-4 rounded bg-foreground/5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-pink-500/70 to-primary/70"
                          style={{ width: `${r.vistas > 0 ? Math.max(3, (r.vistas / maxVistas) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-[11px] tabular-nums text-muted-foreground">
                        {r.vistas > 0 ? fmtNumero(r.vistas) : "—"}
                      </span>
                      <span className="w-20 text-right text-[11px] text-muted-foreground">
                        {r.conectada ? `${r.publicados} posts` : "sin conectar"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" /> Proyectos en curso
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Para qué cuentas está trabajando la agencia ahora mismo.
                  </p>
                  {proyectos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Sin proyectos activos.</p>
                  ) : (
                    <ul className="space-y-2">
                      {proyectos.filter(p => p.status !== "done").slice(0, 8).map(p => (
                        <li key={p.id} className="flex items-center gap-3 text-sm">
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground truncate max-w-[8rem]">{p.client || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-2">
                    <Users2 className="w-4 h-4 text-primary" /> Cartera
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    {clientes.length} cliente{clientes.length === 1 ? "" : "s"} · {contratos.length} contrato{contratos.length === 1 ? "" : "s"} vigentes o en curso.
                  </p>
                  {contratos.length > 0 && (
                    <ul className="space-y-1.5">
                      {contratos.slice(0, 6).map(c => (
                        <li key={c.id} className="flex items-center gap-2 text-sm">
                          <FileCode2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="flex-1 truncate">{c.title}</span>
                          <span className="text-[11px] text-muted-foreground truncate max-w-[7rem]">{c.client}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Marketing ve los contratos sin montos: le sirve el alcance, no el precio. */}
                  <p className="text-[10px] text-muted-foreground/70 mt-3">
                    Los contratos se muestran sin información comercial.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3">Últimas publicaciones</p>
                {publicados.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nada publicado en los últimos 30 días.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {publicados.slice(0, 8).map(v => {
                      const meta = WORKFLOW_META[v.workflowStatus as WorkflowStatus] ?? WORKFLOW_META.publicado;
                      const redes = publishedNetworks(v);
                      return (
                        <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="flex-1 min-w-[10rem] truncate">{v.title}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {redes.map(r => NETWORK_LABELS[r]).join(", ") || "—"}
                          </span>
                          <Badge className={meta.className}>{meta.label}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid sm:grid-cols-2 gap-3">
              <Link href="/biblioteca">
                <Card className="bg-card/40 border-foreground/10 hover:border-primary/30 transition-base cursor-pointer h-full">
                  <CardContent className="p-4">
                    <Library className="w-5 h-5 text-primary mb-2" />
                    <p className="text-sm font-medium">Biblioteca y campañas</p>
                    <p className="text-[11px] text-muted-foreground">Plantillas, campañas y material reutilizable</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/schedule">
                <Card className="bg-card/40 border-foreground/10 hover:border-primary/30 transition-base cursor-pointer h-full">
                  <CardContent className="p-4">
                    <BarChart3 className="w-5 h-5 text-primary mb-2" />
                    <p className="text-sm font-medium">Calendario</p>
                    <p className="text-[11px] text-muted-foreground">Qué sale esta semana y en qué red</p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            <TicketsInline title="Lo que le pidieron a marketing" />
          </>
        )}
      </div>
    </Layout>
  );
}
