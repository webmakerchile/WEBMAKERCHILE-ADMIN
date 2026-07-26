import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { useHubOwner, fmtDate, daysUntil, type HubProject, type HubTask } from "@/lib/hub-owner";
import { TicketsInline } from "@/components/tickets-inline";
import { Loader2, ListChecks, AlertTriangle, ExternalLink, FolderKanban } from "lucide-react";

/** Mismas etapas y colores que el Scrumban del Hub Ejecutivo. */
const STAGES = [
  { id: "backlog", label: "Backlog", color: "#7a8699" },
  { id: "sprint", label: "Sprint", color: "#6aa0c0" },
  { id: "doing", label: "En desarrollo", color: "#e0795a" },
  { id: "qa_sent", label: "QA", color: "#c9a44a" },
  { id: "qa_rev", label: "Revisión", color: "#b07bce" },
  { id: "done", label: "Lista", color: "#1db87b" },
] as const;

const CRIT_COLOR: Record<string, string> = { crítica: "#cc2222", alta: "#e0795a", media: "#c9a44a", baja: "#6aa0c0" };

const PROJ_STATUS: Record<string, string> = { lead: "Lead", disc: "Discovery", dev: "Desarrollo", rev: "Revisión", done: "Entregado" };

/** Tiempo en la etapa actual, en formato corto (2d 4h). */
function stageAge(t: HubTask): string {
  const ms = Date.now() - (t.stageSince || t.createdAt || Date.now());
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function projectProgress(projectId: string, tasks: HubTask[]) {
  const own = tasks.filter(t => t.projectId === projectId);
  if (own.length === 0) return { pct: 0, done: 0, total: 0 };
  const done = own.filter(t => t.stage === "done").length;
  return { pct: Math.round((done / own.length) * 100), done, total: own.length };
}

export default function MisTareasPage() {
  const { data, isLoading, error } = useHubOwner();
  const tasks = useMemo(() => data?.data.tasks ?? [], [data]);
  const projects = useMemo(() => data?.data.projects ?? [], [data]);

  const [projectId, setProjectId] = useState<string>("todos");

  const visible = useMemo(
    () => (projectId === "todos" ? tasks : tasks.filter(t => t.projectId === projectId)),
    [tasks, projectId],
  );

  const byStage = useMemo(() => {
    const map = new Map<string, HubTask[]>(STAGES.map(s => [s.id, []]));
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

  const activos = useMemo(
    () => projects.filter((p: HubProject) => p.status !== "done"),
    [projects],
  );

  const pendientes = visible.filter(t => t.stage !== "done").length;

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
        </header>

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        <TicketsInline title="Solicitudes para desarrollo" />

        {!isLoading && !error && (
          <>
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
                      <div key={stage.id} className="w-64 flex-shrink-0">
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
                            <div
                              key={t.id}
                              className="rounded-lg border border-foreground/10 bg-card/50 p-2.5"
                              style={{ borderLeft: `3px solid ${CRIT_COLOR[t.crit] || "#7a8699"}` }}
                            >
                              <p className="text-xs font-medium leading-snug">{t.title}</p>
                              {t.ticketId && (
                                <p className="text-[10px] text-emerald-400 mt-1">Desde el ticket #{t.ticketId}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                                <span className="px-1.5 py-0.5 rounded" style={{ background: `${CRIT_COLOR[t.crit] || "#7a8699"}22`, color: CRIT_COLOR[t.crit] || "#7a8699" }}>{t.crit}</span>
                                <span className="truncate flex-1">{projectName(t.projectId)}</span>
                                {t.stage !== "done" && <span className="whitespace-nowrap">⏱ {stageAge(t)}</span>}
                              </div>
                              {t.notes && <p className="text-[10px] text-muted-foreground/80 mt-1.5 line-clamp-3">{t.notes}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2"><FolderKanban className="w-4 h-4 text-primary" /> Proyectos activos</p>
                {activos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No hay proyectos activos.</p>
                ) : (
                  <ul className="space-y-3">
                    {activos.map(p => {
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
                            {p.link && (
                              <a href={p.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                Archivos <ExternalLink className="w-2.5 h-2.5" />
                              </a>
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
              Vista de solo lectura del tablero de la dirección{data?.owner ? ` (${data.owner.name || data.owner.email})` : ""}.
              Mover tareas desde aquí llega en el siguiente paso.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
