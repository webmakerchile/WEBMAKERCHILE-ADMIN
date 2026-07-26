import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketsInline } from "@/components/tickets-inline";
import {
  useVideos, missingPieces, publishedNetworks, WORKFLOW_META, fmtFecha,
  type ContentVideo, type WorkflowStatus,
} from "@/lib/contenido";
import {
  Loader2, AlertTriangle, Clapperboard, Image as ImageIcon, AudioLines,
  ArrowRight, Clock, CheckCircle2, Film, ListVideo,
} from "lucide-react";

/**
 * Mesa de trabajo de Edición.
 *
 * La editora no necesita el tablero ejecutivo ni las métricas: necesita saber
 * qué video sigue y qué le falta a cada uno para poder cerrarse. Esta pantalla
 * está construida alrededor de esa pregunta.
 */

type Cola = "pendientes" | "revision" | "listos" | "todos";

const COLAS: { id: Cola; label: string; hint: string }[] = [
  { id: "pendientes", label: "Por terminar", hint: "les falta algo" },
  { id: "revision", label: "En revisión", hint: "esperando aprobación" },
  { id: "listos", label: "Listos", hint: "aprobados o programados" },
  { id: "todos", label: "Todos", hint: "" },
];

/** Atajos a las herramientas de producción, en el orden real de trabajo. */
const HERRAMIENTAS = [
  { href: "/estudio", icon: Clapperboard, label: "Estudio", desc: "Grabar con teleprompter" },
  { href: "/cover", icon: ImageIcon, label: "Portadas", desc: "Generar portada con IA" },
  { href: "/transcriptor", icon: AudioLines, label: "Transcriptor", desc: "Audio a texto" },
  { href: "/videos", icon: ListVideo, label: "Gestor de videos", desc: "Asistente paso a paso" },
];

export default function EdicionPage() {
  const { data: videos = [], isLoading, error } = useVideos();
  const [cola, setCola] = useState<Cola>("pendientes");

  const clasificados = useMemo(() => {
    const pendientes = videos.filter(v => v.workflowStatus === "borrador");
    const revision = videos.filter(v => v.workflowStatus === "en_revision");
    const listos = videos.filter(v => v.workflowStatus === "aprobado" || v.workflowStatus === "programado");
    const publicados = videos.filter(v => v.workflowStatus === "publicado");
    return { pendientes, revision, listos, publicados };
  }, [videos]);

  const visibles = useMemo(() => {
    const lista =
      cola === "pendientes" ? clasificados.pendientes
      : cola === "revision" ? clasificados.revision
      : cola === "listos" ? clasificados.listos
      : videos;
    // Lo más reciente primero: es lo que la editora tiene fresco en la cabeza.
    return [...lista].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [cola, clasificados, videos]);

  /** El siguiente video a tomar: el más antiguo sin terminar. */
  const siguiente = useMemo(() => {
    return [...clasificados.pendientes]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] ?? null;
  }, [clasificados.pendientes]);

  const publicadosSemana = useMemo(() => {
    const hace7 = Date.now() - 7 * 86_400_000;
    return clasificados.publicados.filter(v => new Date(v.updatedAt).getTime() >= hace7).length;
  }, [clasificados.publicados]);

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Edición</h1>
          <p className="text-muted-foreground text-xs sm:text-base">
            Tu mesa de trabajo: qué video sigue, qué le falta y con qué herramienta cerrarlo.
          </p>
        </header>

        {/* Lo primero de la pantalla es lo primero del día: qué tomo ahora. */}
        {siguiente && (
          <Card className="bg-gradient-to-br from-primary/10 to-orange-500/5 border-primary/25">
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-primary mb-2">Sigue con este</p>
              <div className="flex flex-wrap items-start gap-4">
                {siguiente.coverImageUrl ? (
                  <img src={siguiente.coverImageUrl} alt="" className="w-24 h-24 rounded-xl object-cover border border-foreground/10" />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-foreground/5 border border-dashed border-foreground/15 flex items-center justify-center">
                    <Film className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 min-w-[14rem]">
                  <p className="font-semibold">{siguiente.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Creado {fmtFecha(siguiente.createdAt)}
                  </p>
                  <FaltanChips video={siguiente} />
                </div>
                <Link href={`/videos?select=${siguiente.id}`}>
                  <Button size="sm">
                    Continuar <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Por terminar", value: clasificados.pendientes.length, tone: clasificados.pendientes.length > 0 ? "text-amber-400" : "text-muted-foreground" },
            { label: "En revisión", value: clasificados.revision.length, tone: "text-purple-400" },
            { label: "Listos", value: clasificados.listos.length, tone: "text-emerald-400" },
            { label: "Publicados (7 días)", value: publicadosSemana, tone: "text-primary" },
          ].map(k => (
            <Card key={k.label} className="bg-card/40 border-foreground/10">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{k.label}</p>
                <p className={`text-2xl font-bold ${k.tone}`}>{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {HERRAMIENTAS.map(h => {
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

        <TicketsInline title="Lo que te pidieron" />

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && (
          <Card className="bg-card/40 border-foreground/10">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {COLAS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCola(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-base ${
                      cola === c.id
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "border-foreground/10 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {c.label}
                    {c.hint && <span className="opacity-60 ml-1.5 hidden sm:inline">· {c.hint}</span>}
                  </button>
                ))}
              </div>

              {visibles.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {cola === "pendientes" ? "No te queda nada por terminar." : "Nada por aquí."}
                </div>
              ) : (
                <ul className="space-y-2">
                  {visibles.map(v => <VideoFila key={v.id} video={v} />)}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

/** Qué le falta a este video, en lenguaje de producción. */
function FaltanChips({ video }: { video: ContentVideo }) {
  const faltan = missingPieces(video);
  if (faltan.length === 0) {
    return <p className="text-[11px] text-emerald-400 mt-1.5">Completo — listo para programar</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {faltan.map(f => (
        <span key={f} className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-400">
          falta {f}
        </span>
      ))}
    </div>
  );
}

function VideoFila({ video }: { video: ContentVideo }) {
  const meta = WORKFLOW_META[video.workflowStatus as WorkflowStatus] ?? WORKFLOW_META.borrador;
  const publicadas = publishedNetworks(video);

  return (
    <li>
      <Link
        href={`/videos?select=${video.id}`}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-card/40 p-3 hover:border-primary/30 transition-base"
      >
        {video.coverImageUrl ? (
          <img src={video.coverImageUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-foreground/10" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-foreground/5 border border-dashed border-foreground/15 flex items-center justify-center flex-shrink-0">
            <Film className="w-4 h-4 text-muted-foreground/50" />
          </div>
        )}
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-medium truncate">{video.title}</p>
          <FaltanChips video={video} />
        </div>
        {video.scheduledAt && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> {fmtFecha(video.scheduledAt)}
          </span>
        )}
        {publicadas.length > 0 && (
          <span className="text-[11px] text-primary">{publicadas.length} red{publicadas.length === 1 ? "" : "es"}</span>
        )}
        <Badge className={meta.className}>{meta.label}</Badge>
      </Link>
    </li>
  );
}
