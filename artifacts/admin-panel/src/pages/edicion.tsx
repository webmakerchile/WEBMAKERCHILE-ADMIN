import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TicketsInline } from "@/components/tickets-inline";
import { MetasInline } from "@/components/metas-inline";
import { canReview } from "@workspace/roles";
import {
  useVideos, useCreateVideo, usePatchVideo, useRequestReview, useTeamMembers,
  missingPieces, publishedNetworks, WORKFLOW_META, fmtFecha,
  type ContentVideo, type WorkflowStatus,
} from "@/lib/contenido";
import {
  Loader2, AlertTriangle, Clapperboard, Image as ImageIcon, AudioLines,
  ArrowRight, Clock, CheckCircle2, Film, ListVideo, Plus, Send, X, Check,
  ChevronDown, Pencil,
} from "lucide-react";

/**
 * Mesa de trabajo de Edición.
 *
 * La editora no necesita el tablero ejecutivo ni las métricas: necesita saber
 * qué video sigue, qué le falta y poder cerrarlo sin salir de aquí. Por eso la
 * pantalla escribe: crea videos, completa los textos que faltan y manda a
 * revisión. El gestor paso a paso queda para lo pesado (archivo y portada).
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

/** Textos que se pueden completar sin salir de esta pantalla. */
const CAMPOS_TEXTO = [
  { key: "youtubeTitle", label: "Título de YouTube", placeholder: "Título optimizado para YouTube", rows: 1 },
  { key: "tiktokDescription", label: "Descripción TikTok", placeholder: "Gancho + hashtags", rows: 2 },
  { key: "instagramDescription", label: "Descripción Instagram", placeholder: "Copy para el reel", rows: 2 },
] as const;

export default function EdicionPage() {
  const { data: videos = [], isLoading, error } = useVideos();
  const { data: equipo = [] } = useTeamMembers();
  const crear = useCreateVideo();
  const { toast } = useToast();
  const [cola, setCola] = useState<Cola>("pendientes");
  const [nuevo, setNuevo] = useState<string | null>(null);

  /** Quién puede aprobar contenido: dirección y marketing. */
  const revisores = useMemo(
    () => equipo.filter(m => m.approvalStatus === "approved" && canReview(m.teamRole)),
    [equipo],
  );

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

  const crearVideo = () => {
    const title = (nuevo ?? "").trim();
    if (!title) return;
    crear.mutate({ title }, {
      onSuccess: () => { setNuevo(null); toast({ title: "Video creado", description: "Quedó en borrador, listo para trabajarlo." }); },
      onError: e => toast({ title: "No se pudo crear", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Edición</h1>
            <p className="text-muted-foreground text-xs sm:text-base">
              Tu mesa de trabajo: qué video sigue, qué le falta y con qué herramienta cerrarlo.
            </p>
          </div>
          <Button size="sm" onClick={() => setNuevo(nuevo === null ? "" : null)}>
            <Plus className="w-4 h-4 mr-1.5" /> Nuevo video
          </Button>
        </header>

        {nuevo !== null && (
          <Card className="bg-card/60 border-primary/30">
            <CardContent className="p-4 flex flex-wrap gap-2">
              <input
                autoFocus
                value={nuevo}
                onChange={e => setNuevo(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") crearVideo(); if (e.key === "Escape") setNuevo(null); }}
                placeholder="Título del video"
                className="flex-1 min-w-[14rem] h-10 rounded-lg border border-foreground/15 bg-card/60 px-3 text-sm"
              />
              <Button size="sm" onClick={crearVideo} disabled={!nuevo.trim() || crear.isPending}>
                {crear.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1.5" /> Crear</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}><X className="w-4 h-4" /></Button>
            </CardContent>
          </Card>
        )}

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

        <MetasInline />

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
                  {visibles.map(v => <VideoFila key={v.id} video={v} revisores={revisores} />)}
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

interface Revisor { id: number; name: string | null; email: string }

function VideoFila({ video, revisores }: { video: ContentVideo; revisores: Revisor[] }) {
  const meta = WORKFLOW_META[video.workflowStatus as WorkflowStatus] ?? WORKFLOW_META.borrador;
  const publicadas = publishedNetworks(video);
  const [abierto, setAbierto] = useState(false);

  return (
    <li className="rounded-xl border border-foreground/10 bg-card/40">
      <div className="flex flex-wrap items-center gap-3 p-3">
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
        <button
          onClick={() => setAbierto(!abierto)}
          className="h-8 px-2 rounded-lg border border-foreground/10 text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-base inline-flex items-center gap-1"
          title="Completar textos y enviar a revisión"
        >
          <Pencil className="w-3 h-3" /> Trabajar
          <ChevronDown className={`w-3 h-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </button>
      </div>

      {abierto && <PanelEdicion video={video} revisores={revisores} />}
    </li>
  );
}

/**
 * Panel de trabajo del video: los textos que faltan y el envío a revisión.
 * El archivo y la portada siguen en el gestor — necesitan subida, no un input.
 */
function PanelEdicion({ video, revisores }: { video: ContentVideo; revisores: Revisor[] }) {
  const patch = usePatchVideo();
  const pedirRevision = useRequestReview();
  const { toast } = useToast();

  const [borrador, setBorrador] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS_TEXTO.map(c => [c.key, (video[c.key] as string | null) ?? ""])),
  );
  const [revisor, setRevisor] = useState<number | "">(revisores[0]?.id ?? "");
  const [mensaje, setMensaje] = useState("");

  const sucio = CAMPOS_TEXTO.some(c => borrador[c.key] !== ((video[c.key] as string | null) ?? ""));

  const guardar = () => {
    const cambios = Object.fromEntries(
      CAMPOS_TEXTO
        .filter(c => borrador[c.key] !== ((video[c.key] as string | null) ?? ""))
        .map(c => [c.key, borrador[c.key] || null]),
    );
    if (Object.keys(cambios).length === 0) return;
    patch.mutate({ id: video.id, patch: cambios }, {
      onSuccess: () => toast({ title: "Textos guardados" }),
      onError: e => toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" }),
    });
  };

  const enviar = () => {
    if (typeof revisor !== "number") return;
    pedirRevision.mutate({ videoId: video.id, assignedTo: revisor, message: mensaje }, {
      onSuccess: () => { setMensaje(""); toast({ title: "Enviado a revisión", description: "Le llegó la notificación a quien tiene que aprobar." }); },
      onError: e => toast({ title: "No se pudo enviar", description: (e as Error).message, variant: "destructive" }),
    });
  };

  const faltan = missingPieces(video);

  return (
    <div className="px-3 pb-3 pt-1 border-t border-foreground/10 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        {CAMPOS_TEXTO.map(c => (
          <label key={c.key} className={c.rows > 1 ? "sm:col-span-1" : "sm:col-span-2"}>
            <span className="text-[11px] text-muted-foreground">{c.label}</span>
            <textarea
              rows={c.rows}
              value={borrador[c.key]}
              onChange={e => setBorrador({ ...borrador, [c.key]: e.target.value })}
              placeholder={c.placeholder}
              className="mt-0.5 w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-1.5 text-xs resize-y"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={guardar} disabled={!sucio || patch.isPending}>
          {patch.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar textos"}
        </Button>
        {(faltan.includes("portada") || faltan.includes("archivo de video")) && (
          <Link href={`/videos?select=${video.id}`} className="text-[11px] text-amber-400 hover:underline">
            Subir {faltan.filter(f => f === "portada" || f === "archivo de video").join(" y ")} en el gestor →
          </Link>
        )}
      </div>

      {video.workflowStatus === "borrador" && (
        <div className="rounded-lg border border-purple-500/25 bg-purple-500/5 p-3 space-y-2">
          <p className="text-[11px] text-purple-300 font-medium">Enviar a revisión</p>
          {revisores.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nadie del equipo tiene permiso para aprobar contenido todavía. Pídele a dirección
              que asigne el rol de Marketing o CEO a quien deba revisar.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <select
                  value={String(revisor)}
                  onChange={e => setRevisor(Number(e.target.value))}
                  className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs flex-1 min-w-[10rem]"
                >
                  {revisores.map(r => <option key={r.id} value={r.id}>{r.name || r.email}</option>)}
                </select>
                <Button size="sm" onClick={enviar} disabled={pedirRevision.isPending || typeof revisor !== "number"}>
                  {pedirRevision.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1.5" /> Enviar</>}
                </Button>
              </div>
              <input
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                placeholder="Mensaje para quien revisa (opcional)"
                className="w-full h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs"
              />
            </>
          )}
        </div>
      )}

      {video.workflowStatus === "en_revision" && (
        <p className="text-[11px] text-purple-300">Ya está en revisión: esperando aprobación.</p>
      )}
    </div>
  );
}
