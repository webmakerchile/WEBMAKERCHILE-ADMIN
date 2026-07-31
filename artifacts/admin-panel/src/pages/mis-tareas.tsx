import { AsistenteRedaccion } from "@/components/asistente-redaccion";
import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fmtDate, daysUntil, type HubProject, type HubContract } from "@/lib/hub-owner";
import { misProyectos, tieneAsignados, carpetaDe, urlDeCarpeta } from "@/lib/proyecto-asignacion";
import { useHubBoard, useHubPatch, replaceEntity } from "@/lib/hub-write";
import { useTareasHub, type TareaVista } from "@/lib/tareas-hub";
import { useAuth } from "@/App";
import { TicketsInline } from "@/components/tickets-inline";
import { MetasInline } from "@/components/metas-inline";
import { ConfigRecordatorios, useReglasRecordatorio } from "@/components/config-recordatorios";
import {
  Loader2, ListChecks, AlertTriangle, ExternalLink, FolderKanban, FileCode2,
  ChevronDown, ChevronLeft, ChevronRight, Plus, Flame, X, Check, Timer,
} from "lucide-react";

/** Mismas etapas y colores que el Scrumban del Hub Ejecutivo. */
const STAGES = [
  { id: "backlog", label: "Backlog", color: "#7a8699" },
  { id: "sprint", label: "Sprint", color: "#6aa0c0" },
  { id: "doing", label: "En desarrollo", color: "#e0795a" },
  { id: "qa_sent", label: "QA", color: "#c9a44a" },
  { id: "qa_rev", label: "Revisión", color: "#b07bce" },
  { id: "done", label: "Lista", color: "#1db87b" },
] as const;

const STAGE_IDS = STAGES.map(s => s.id) as readonly string[];

const CRITS = ["crítica", "alta", "media", "baja"] as const;
const CRIT_COLOR: Record<string, string> = { crítica: "#cc2222", alta: "#e0795a", media: "#c9a44a", baja: "#6aa0c0" };

const PROJ_STATUS: Record<string, string> = { lead: "Lead", disc: "Discovery", dev: "Desarrollo", rev: "Revisión", done: "Entregado" };

/** Cuántas tareas en desarrollo a la vez antes de que avisemos. */
const WIP_LIMITE = 3;

/**
 * Horas a partir de las cuales una tarea lleva demasiado tiempo quieta.
 *
 * Es solo el valor de arranque mientras cargan las reglas: el criterio de
 * verdad se configura en "Cuándo avisarme" y es el mismo que usa el aviso por
 * notificación. Si la tarjeta y el aviso no coincidieran, no se creería a
 * ninguno de los dos.
 */
const ESTANCADA_HORAS = 72;

function horasEnEtapa(t: TareaVista): number {
  return Math.floor((Date.now() - (t.stageSince || t.createdAt || Date.now())) / 3_600_000);
}

/** Tiempo en la etapa actual, en formato corto (2d 4h). */
function stageAge(t: TareaVista): string {
  const h = horasEnEtapa(t);
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function projectProgress(projectId: string, tasks: TareaVista[]) {
  const own = tasks.filter(t => t.projectId === projectId);
  if (own.length === 0) return { pct: 0, done: 0, total: 0 };
  const done = own.filter(t => t.stage === "done").length;
  return { pct: Math.round((done / own.length) * 100), done, total: own.length };
}

export default function MisTareasPage() {
  const { data: board, isLoading, error } = useHubBoard();
  const patch = useHubPatch();
  const { toast } = useToast();

  // Las tareas salen de `hub_tasks`, la MISMA tabla que el tablero del Hub
  // Ejecutivo. Antes esta página leía `hub_state.data.tasks`, una colección
  // distinta que no miraba nadie más: lo que se creaba aquí era invisible para
  // la jefatura, y lo que la jefatura asignaba era invisible aquí.
  const usuario = useAuth();
  const miId = typeof usuario?.id === "number" ? usuario.id : null;
  const tareasHub = useTareasHub(miId);
  const tasks = tareasHub.tareas;
  const projects = useMemo(() => board?.data?.projects ?? [], [board]);
  const contracts = useMemo(() => board?.data?.contracts ?? [], [board]);
  // El servidor decide qué puede tocar este rol; la UI solo obedece.
  const puedeEditarTareas = board?.writeScopes?.includes("tasks") ?? false;
  const puedeEditarProyectos = board?.writeScopes?.includes("projects") ?? false;

  const [projectId, setProjectId] = useState<string>("todos");
  const [openBrief, setOpenBrief] = useState<string | null>(null);
  const [nueva, setNueva] = useState<{ title: string; projectId: string; crit: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const visible = useMemo(
    () => (projectId === "todos" ? tasks : tasks.filter(t => t.projectId === projectId)),
    [tasks, projectId],
  );

  const byStage = useMemo(() => {
    const map = new Map<string, TareaVista[]>(STAGES.map(s => [s.id, []]));
    for (const t of visible) {
      const list = map.get(t.stage) ?? map.get("backlog")!;
      list.push(t);
    }
    for (const list of map.values()) {
      // Lo más crítico y más antiguo primero.
      list.sort((a, b) => (a.stageSince || 0) - (b.stageSince || 0));
    }
    return map;
  }, [visible]);

  const projectName = (id: string) => projects.find(p => p.id === id)?.name ?? "Sin proyecto";

  const activos = useMemo(() => projects.filter((p: HubProject) => p.status !== "done"), [projects]);
  // Antes esta lista eran TODOS los proyectos activos de la agencia, para
  // cualquiera que entrara: no había forma de saber cuáles te tocaban a ti.
  const [soloMios, setSoloMios] = useState(true);
  const mios = useMemo(() => misProyectos(activos, miId), [activos, miId]);
  const visibles = soloMios ? mios : activos;
  const hayAsignaciones = useMemo(() => activos.some(tieneAsignados), [activos]);
  const pendientes = visible.filter(t => t.stage !== "done").length;

  const alFallar = (e: unknown) =>
    toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" });

  const moverEtapa = (t: TareaVista, dir: -1 | 1) => {
    const i = STAGE_IDS.indexOf(t.stage);
    const destino = STAGE_IDS[Math.min(STAGE_IDS.length - 1, Math.max(0, (i === -1 ? 0 : i) + dir))];
    if (destino === t.stage) return;
    // El servidor reinicia `stageSince` al cambiar de etapa: el contador mide
    // la etapa nueva, no la vida de la tarea, que es lo que deja ver dónde se
    // atasca el trabajo.
    tareasHub.actualizar.mutate(
      { id: t.id, campos: { stage: destino } },
      {
        onSuccess: () => toast({ title: `“${t.title}” → ${STAGES.find(s => s.id === destino)?.label}` }),
        onError: alFallar,
      },
    );
  };

  const actualizarTarea = (id: string, campos: Partial<TareaVista>) => {
    tareasHub.actualizar.mutate({ id, campos }, { onError: alFallar });
  };

  const crearTarea = () => {
    if (!nueva || !nueva.title.trim()) return;
    tareasHub.crear.mutate(
      { title: nueva.title.trim(), projectId: nueva.projectId, crit: nueva.crit },
      {
        onSuccess: () => toast({ title: "Tarea creada en el backlog" }),
        onError: alFallar,
      },
    );
    setNueva(null);
  };

  const actualizarProgreso = (p: HubProject, prog: number) => {
    if (!board) return;
    patch.mutate(
      { data: { projects: replaceEntity(projects, p.id, { prog }) }, baseVersion: board.version },
      { onError: (e: unknown) => toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" }) },
    );
  };

  const enDesarrollo = tasks.filter(t => t.stage === "doing").length;
  const { data: reglas } = useReglasRecordatorio();
  const horasEstancada = (reglas?.reglas.diasTareaEstancada ?? ESTANCADA_HORAS / 24) * 24;
  const diasEstancada = Math.round(horasEstancada / 24);
  const estancadas = useMemo(
    () => tasks.filter(t => t.stage !== "done" && t.stage !== "backlog" && horasEnEtapa(t) >= horasEstancada),
    [tasks, horasEstancada],
  );

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Mis tareas</h1>
            <p className="text-muted-foreground text-xs sm:text-base">
              Tablero de desarrollo por etapa · {pendientes} tarea{pendientes === 1 ? "" : "s"} pendiente{pendientes === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="h-9 rounded-lg border border-foreground/15 bg-card/60 px-3 text-sm max-w-[16rem]"
              >
                <option value="todos">Todos los proyectos</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {puedeEditarTareas && (
              <Button
                size="sm"
                onClick={() => setNueva({ title: "", projectId: projectId === "todos" ? (projects[0]?.id ?? "") : projectId, crit: "media" })}
              >
                <Plus className="w-4 h-4 mr-1.5" /> Nueva tarea
              </Button>
            )}
          </div>
        </header>

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* Dos señales que el tablero por sí solo no da: cuánto tengo abierto
                a la vez y qué lleva días sin moverse. */}
            <div className="grid sm:grid-cols-3 gap-3">
              <Card className={enDesarrollo > WIP_LIMITE ? "bg-amber-500/10 border-amber-500/30" : "bg-card/40 border-foreground/10"}>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">En desarrollo a la vez</p>
                  <p className={`text-2xl font-bold ${enDesarrollo > WIP_LIMITE ? "text-amber-400" : "text-primary"}`}>
                    {enDesarrollo}<span className="text-sm text-muted-foreground font-normal"> / {WIP_LIMITE}</span>
                  </p>
                  {enDesarrollo > WIP_LIMITE && (
                    <p className="text-[11px] text-amber-400 mt-1">Cierra algo antes de empezar otra cosa.</p>
                  )}
                </CardContent>
              </Card>
              <Card className={estancadas.length > 0 ? "bg-red-500/10 border-red-500/25" : "bg-card/40 border-foreground/10"}>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                    Sin moverse (+{diasEstancada} día{diasEstancada === 1 ? "" : "s"})
                  </p>
                  <p className={`text-2xl font-bold ${estancadas.length > 0 ? "text-red-400" : "text-muted-foreground"}`}>{estancadas.length}</p>
                  {estancadas.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">{estancadas[0].title}</p>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Cerradas</p>
                  <p className="text-2xl font-bold text-emerald-400">{tasks.filter(t => t.stage === "done").length}</p>
                </CardContent>
              </Card>
            </div>

            <ConfigRecordatorios />

            <MetasInline />

            <TicketsInline title="Solicitudes para desarrollo" />

            {nueva && (
              <Card className="bg-card/60 border-primary/30">
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-semibold">Nueva tarea</p>
                  <input
                    autoFocus
                    value={nueva.title}
                    onChange={e => setNueva({ ...nueva, title: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") crearTarea(); if (e.key === "Escape") setNueva(null); }}
                    placeholder="Qué hay que hacer"
                    className="w-full h-10 rounded-lg border border-foreground/15 bg-card/60 px-3 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={nueva.projectId}
                      onChange={e => setNueva({ ...nueva, projectId: e.target.value })}
                      className="h-9 rounded-lg border border-foreground/15 bg-card/60 px-3 text-sm flex-1 min-w-[10rem]"
                    >
                      <option value="">Sin proyecto</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select
                      value={nueva.crit}
                      onChange={e => setNueva({ ...nueva, crit: e.target.value })}
                      className="h-9 rounded-lg border border-foreground/15 bg-card/60 px-3 text-sm"
                    >
                      {CRITS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Button size="sm" onClick={crearTarea} disabled={!nueva.title.trim() || patch.isPending}>
                      {patch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1.5" /> Crear</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNueva(null)}><X className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {tasks.length === 0 ? (
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Todavía no hay tareas en el tablero.
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-max">
                  {STAGES.map(stage => {
                    const list = byStage.get(stage.id) ?? [];
                    return (
                      <div key={stage.id} className="w-72 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                          <span className="text-xs font-semibold">{stage.label}</span>
                          <span className="text-[11px] text-muted-foreground ml-auto">{list.length}</span>
                        </div>
                        <div className="space-y-2">
                          {list.length === 0 && (
                            <div className="rounded-lg border border-dashed border-foreground/10 py-6 text-center text-[11px] text-muted-foreground">
                              Sin tareas
                            </div>
                          )}
                          {list.map(t => (
                            <TarjetaTarea
                              key={t.id}
                              tarea={t}
                              proyecto={projectName(t.projectId)}
                              editable={puedeEditarTareas}
                              abierta={editando === t.id}
                              guardando={tareasHub.actualizar.isPending}
                              onAbrir={() => setEditando(editando === t.id ? null : t.id)}
                              onMover={dir => moverEtapa(t, dir)}
                              onActualizar={campos => actualizarTarea(t.id, campos)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {contracts.length > 0 && (
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-primary" /> Requerimientos contratados
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Qué se le vendió al cliente, traducido a alcance técnico. Sin información comercial.
                  </p>
                  <ul className="space-y-2">
                    {contracts.map((c: HubContract) => {
                      const open = openBrief === c.id;
                      const brief = c.brief;
                      return (
                        <li key={c.id} className="rounded-lg border border-foreground/10 bg-card/40">
                          <button
                            onClick={() => setOpenBrief(open ? null : c.id)}
                            className="w-full text-left px-3 py-2.5 flex items-center gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{c.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {c.client || "Sin cliente"}
                                {brief?.alcance?.length ? ` · ${brief.alcance.length} módulo${brief.alcance.length === 1 ? "" : "s"}` : " · sin brief todavía"}
                              </p>
                            </div>
                            {c.briefUrl && (
                              <a href={c.briefUrl} target="_blank" rel="noopener noreferrer"
                                 onClick={e => e.stopPropagation()}
                                 className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                                PDF <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                          </button>

                          {open && (
                            <div className="px-3 pb-3 pt-1 border-t border-foreground/10 space-y-3 text-xs">
                              {!brief ? (
                                <p className="text-muted-foreground">
                                  Este contrato todavía no tiene brief técnico. Se genera solo cuando dirección
                                  crea o regenera los documentos.
                                </p>
                              ) : (
                                <>
                                  {brief.objetivo && (
                                    <div>
                                      <p className="text-[11px] text-muted-foreground mb-0.5">Objetivo</p>
                                      <p>{brief.objetivo}</p>
                                    </div>
                                  )}
                                  {brief.alcance?.map((m, i) => (
                                    <div key={i} className="rounded-lg border border-foreground/10 p-2.5">
                                      <div className="flex items-start gap-2">
                                        <div className="flex-1">
                                          <p className="font-medium">{m.modulo}</p>
                                          {m.descripcion && <p className="text-muted-foreground mt-0.5">{m.descripcion}</p>}
                                        </div>
                                        {puedeEditarTareas && (
                                          <button
                                            title="Crear tarea para este módulo"
                                            onClick={() => {
                                              const proyecto = projects.find(p => p.contractId === c.id);
                                              tareasHub.crear.mutate({
                                                title: m.modulo || c.title,
                                                projectId: proyecto?.id ?? "",
                                                crit: "media",
                                                notes: [m.descripcion, ...(m.requisitos ?? [])].filter(Boolean).join("\n"),
                                              }, {
                                                onSuccess: () => toast({ title: "Tarea creada desde el brief" }),
                                                onError: alFallar,
                                              });
                                            }}
                                            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 flex-shrink-0"
                                          >
                                            <Plus className="w-3 h-3" /> tarea
                                          </button>
                                        )}
                                      </div>
                                      {m.entregables?.length > 0 && (
                                        <ul className="list-disc pl-4 mt-1.5 text-muted-foreground">
                                          {m.entregables.map((e, j) => <li key={j}>{e}</li>)}
                                        </ul>
                                      )}
                                      {m.requisitos?.length > 0 && (
                                        <ul className="list-disc pl-4 mt-1">
                                          {m.requisitos.map((r, j) => <li key={j}>{r}</li>)}
                                        </ul>
                                      )}
                                    </div>
                                  ))}
                                  {brief.criteriosAceptacion?.length > 0 && (
                                    <div>
                                      <p className="text-[11px] text-muted-foreground mb-0.5">Criterios de aceptación</p>
                                      <ul className="list-disc pl-4">
                                        {brief.criteriosAceptacion.map((x, i) => <li key={i}>{x}</li>)}
                                      </ul>
                                    </div>
                                  )}
                                  {brief.fueraDeAlcance?.length > 0 && (
                                    <div>
                                      <p className="text-[11px] text-muted-foreground mb-0.5">Fuera de alcance</p>
                                      <ul className="list-disc pl-4 text-muted-foreground">
                                        {brief.fueraDeAlcance.map((x, i) => <li key={i}>{x}</li>)}
                                      </ul>
                                    </div>
                                  )}
                                  {brief.stackSugerido?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {brief.stackSugerido.map((x, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded-full border border-foreground/10 bg-card/60">{x}</span>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <p className="text-sm font-semibold flex items-center gap-2"><FolderKanban className="w-4 h-4 text-primary" /> Proyectos activos</p>
                  {/* El interruptor solo aparece si hay asignaciones: sin ellas
                      no filtraría nada y sería un control que miente. */}
                  {hayAsignaciones && (
                    <button
                      type="button"
                      onClick={() => setSoloMios(v => !v)}
                      aria-pressed={soloMios}
                      className={`text-[11px] px-2 py-1 rounded-lg border transition ${soloMios ? "border-primary bg-primary/10 text-primary" : "border-foreground/15 text-muted-foreground hover:border-foreground/30"}`}
                    >
                      {soloMios ? `Los míos (${mios.length})` : `Todos (${activos.length})`}
                    </button>
                  )}
                </div>
                {visibles.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {activos.length > 0 && soloMios ? "No tienes proyectos asignados." : "No hay proyectos activos."}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {visibles.map(p => {
                      const prog = projectProgress(p.id, tasks);
                      const days = daysUntil(p.due);
                      return (
                        <li key={p.id}>
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{PROJ_STATUS[p.status] || p.status}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-primary/80 to-orange-500/70" style={{ width: `${prog.pct}%` }} />
                            </div>
                            <span className="text-[11px] text-muted-foreground tabular-nums w-24 text-right">{prog.done}/{prog.total} · {prog.pct}%</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                            <span>{p.client || "Sin cliente"}</span>
                            {p.due && (
                              <span className={days !== null && days < 0 ? "text-red-400" : days !== null && days <= 7 ? "text-amber-400" : ""}>
                                Entrega {fmtDate(p.due)}
                              </span>
                            )}
                            {carpetaDe(p) && (
                              <a
                                href={urlDeCarpeta(carpetaDe(p)!)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                Carpeta del proyecto <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {puedeEditarProyectos && prog.total === 0 && (
                              // Sin tareas no hay avance calculable: se informa a mano
                              // para que el proyecto no se vea muerto en el panel.
                              <label className="inline-flex items-center gap-1.5">
                                Avance informado
                                <input
                                  type="number" min={0} max={100} defaultValue={p.prog ?? 0}
                                  onBlur={e => {
                                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                    if (v !== (p.prog ?? 0)) actualizarProgreso(p, v);
                                  }}
                                  className="w-14 h-6 rounded border border-foreground/15 bg-card/60 px-1.5 text-[11px] text-right"
                                />
                                %
                              </label>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Tablero compartido con la dirección{board?.owner ? ` (${board.owner.name || board.owner.email})` : ""}.
              Los contratos llegan sin información comercial: se ve el alcance, no el precio.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}

function TarjetaTarea({
  tarea, proyecto, editable, abierta, guardando, onAbrir, onMover, onActualizar,
}: {
  tarea: TareaVista;
  proyecto: string;
  editable: boolean;
  abierta: boolean;
  guardando: boolean;
  onAbrir: () => void;
  onMover: (dir: -1 | 1) => void;
  onActualizar: (campos: Partial<TareaVista>) => void;
}) {
  const [notas, setNotas] = useState(tarea.notes || "");
  const i = STAGE_IDS.indexOf(tarea.stage);
  const estancada = tarea.stage !== "done" && tarea.stage !== "backlog" && horasEnEtapa(tarea) >= ESTANCADA_HORAS;

  return (
    <div
      className="rounded-lg border border-foreground/10 bg-card/50 p-2.5"
      style={{ borderLeft: `3px solid ${CRIT_COLOR[tarea.crit] || "#7a8699"}` }}
    >
      <button onClick={onAbrir} className="w-full text-left">
        <p className="text-xs font-medium leading-snug">{tarea.title}</p>
      </button>
      {/* `ticketId` era un campo del sistema viejo que NADIE escribía: UI
          muerta. En su lugar va algo que antes no existía aquí — saber que la
          tarea te la asignó otra persona, porque ahora esta lista es la misma
          que ve la jefatura. */}
      {tarea.ajena && (
        <p className="text-[10px] text-amber-400 mt-1">Te la asignaron</p>
      )}
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
        <span className="px-1.5 py-0.5 rounded" style={{ background: `${CRIT_COLOR[tarea.crit] || "#7a8699"}22`, color: CRIT_COLOR[tarea.crit] || "#7a8699" }}>{tarea.crit}</span>
        <span className="truncate flex-1">{proyecto}</span>
        {tarea.stage !== "done" && (
          <span className={`whitespace-nowrap inline-flex items-center gap-0.5 ${estancada ? "text-red-400 font-semibold" : ""}`}>
            {estancada ? <Flame className="w-2.5 h-2.5" /> : <Timer className="w-2.5 h-2.5" />} {stageAge(tarea)}
          </span>
        )}
      </div>

      {!abierta && tarea.notes && (
        <p className="text-[10px] text-muted-foreground/80 mt-1.5 line-clamp-3">{tarea.notes}</p>
      )}

      {editable && (
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={() => onMover(-1)}
            disabled={i <= 0 || guardando}
            title="Etapa anterior"
            className="h-6 w-6 rounded border border-foreground/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-30 transition-base"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={() => onMover(1)}
            disabled={i >= STAGE_IDS.length - 1 || guardando}
            title="Etapa siguiente"
            className="h-6 flex-1 rounded border border-foreground/10 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 disabled:opacity-30 transition-base inline-flex items-center justify-center gap-1"
          >
            {i >= STAGE_IDS.length - 1 ? "Lista" : STAGES[i + 1]?.label} <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {abierta && editable && (
        <div className="mt-2 pt-2 border-t border-foreground/10 space-y-2">
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            onBlur={() => { if (notas !== (tarea.notes || "")) onActualizar({ notes: notas }); }}
            rows={3}
            placeholder="Notas técnicas, bloqueos, decisiones…"
            className="w-full rounded-lg border border-foreground/15 bg-card/60 px-2 py-1.5 text-[11px] resize-y"
          />
          <AsistenteRedaccion
            tipo="reporte"
            valor={notas}
            contexto={`Notas de avance de la tarea "${tarea.title}".`}
            onAceptar={(texto) => { setNotas(texto); onActualizar({ notes: texto }); }}
            etiqueta="Ordenar mis notas"
          />
          <div className="flex flex-wrap gap-1">
            {CRITS.map(c => (
              <button
                key={c}
                onClick={() => onActualizar({ crit: c })}
                className={`px-1.5 py-0.5 rounded text-[10px] border transition-base ${
                  tarea.crit === c ? "border-transparent" : "border-foreground/10 text-muted-foreground hover:text-foreground"
                }`}
                style={tarea.crit === c ? { background: `${CRIT_COLOR[c]}22`, color: CRIT_COLOR[c] } : undefined}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
