import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { ActivityFeed } from "@/components/activity-feed";
import { TAREAS_QUERY_KEY } from "@/lib/tareas-hub";
import { X, AlertTriangle, Clock3, Send, ChevronDown, ChevronUp } from "lucide-react";
import type { ChecklistItem, TeamMember } from "../shared";
import { HUB_API_BASE, uid } from "../shared";

export interface TeamTask {
  id: number; title: string; stage: string; priority: string;
  dueDate: string | null; stageSinceMs: number; stagnant: boolean; overdue: boolean; dueToday: boolean;
}
export interface TeamMemberCard {
  id: number; name: string | null; picture: string | null; email: string | null; teamRole: string | null;
  semaphore: "green" | "yellow" | "red"; activeTasks: TeamTask[]; activeCount: number;
}
export interface TeamActivityItem {
  id: number; taskId: number; taskTitle: string; action: string;
  oldStage: string | null; newStage: string | null; createdAt: string; actorName: string | null;
}

export const TV_STAGE: Record<string, string> = { backlog: "Backlog", sprint: "Sprint", doing: "Progreso", qa_sent: "QA→", qa_rev: "QA✓", done: "Listo" };
export const TV_STAGE_CLS: Record<string, string> = { backlog: "bg-foreground/10 text-foreground/50", sprint: "bg-sky-400/10 text-sky-400", doing: "bg-primary/15 text-primary", qa_sent: "bg-purple-400/10 text-purple-400", qa_rev: "bg-purple-400/10 text-purple-300", done: "bg-emerald-500/10 text-emerald-400" };
export const TV_PRIO: Record<string, string> = { "crítica": "text-red-400", "alta": "text-orange-400", "media": "text-blue-400", "baja": "text-foreground/40" };
export const SEM_DOT: Record<string, string> = { green: "bg-emerald-500", yellow: "bg-yellow-400", red: "bg-red-500" };
export const SEM_RING: Record<string, string> = { green: "ring-emerald-500/30", yellow: "ring-yellow-400/30", red: "ring-red-500/30" };
export const SEM_BORDER: Record<string, string> = { green: "border-foreground/10", yellow: "border-yellow-400/25", red: "border-red-500/25" };
export const SEM_LABEL: Record<string, string> = { green: "Al día", yellow: "Con carga", red: "Atención" };
export const SEM_PILL: Record<string, string> = { green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", yellow: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25", red: "bg-red-500/10 text-red-400 border-red-500/25" };

export function fmtMs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function TeamView({ teamMembers, showToast, onRefreshTasks, onConfirm }: {
  teamMembers: TeamMember[];
  showToast: (msg: string, undo?: () => void) => void;
  onRefreshTasks: () => void;
  onConfirm: (msg: string, onYes: () => void) => void;
}) {
  const authUser = useAuth();
  const queryClient = useQueryClient();
  const canDelete = authUser?.role === "superadmin" || authUser?.teamRole === "ceo";
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [priority, setPriority] = useState<"crítica" | "alta" | "media" | "baja">("media");
  const [dueDate, setDueDate] = useState("");
  const [clItems, setClItems] = useState<ChecklistItem[]>([]);
  const [clDraft, setClDraft] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [composing, setComposing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  const { data: tvData, isLoading: tvLoading, refetch: tvRefetch } = useQuery<{ members: TeamMemberCard[] }>({
    queryKey: ["hub-team-view"],
    queryFn: async () => {
      const r = await fetch(`${HUB_API_BASE}/hub/tasks/team-view`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: actData } = useQuery<{ items: TeamActivityItem[] }>({
    queryKey: ["hub-activity", expandedId, today],
    queryFn: async () => {
      const r = await fetch(`${HUB_API_BASE}/hub/tasks/activity?userId=${expandedId}&date=${today}`, { credentials: "include" });
      if (!r.ok) return { items: [] };
      return r.json();
    },
    enabled: expandedId !== null,
    staleTime: 30_000,
  });

  const members = tvData?.members ?? [];
  // Selector de asignación: cards del team-view (traen carga actual) filtradas
  // por la lista team-members, que el servidor ya limita según la regla del
  // dueño (solo el dueño puede asignarse tareas a sí mismo).
  const allowedIds = new Set(teamMembers.map(m => m.id));
  const selectable: Array<{ id: number; name: string | null; email: string | null; picture: string | null; teamRole: string | null; activeCount: number | null }> =
    members.length > 0
      ? members.filter(m => allowedIds.has(m.id)).map(m => ({ id: m.id, name: m.name, email: m.email, picture: m.picture, teamRole: m.teamRole, activeCount: m.activeCount }))
      : teamMembers.map(m => ({ id: m.id, name: m.name, email: m.email, picture: m.picture, teamRole: m.teamRole, activeCount: null }));

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || composing) return;
    setComposing(true);
    try {
      const body: Record<string, unknown> = { title: title.trim(), priority };
      if (assigneeId) body["assigneeId"] = assigneeId;
      if (dueDate) body["dueDate"] = dueDate;
      if (desc.trim()) body["notes"] = desc.trim();
      if (clItems.length) body["checklist"] = clItems;
      const r = await fetch(`${HUB_API_BASE}/hub/tasks`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e2 = await r.json().catch(() => ({} as Record<string, unknown>));
        throw new Error((e2 as { error?: string }).error || "Error al crear tarea");
      }
      const assigned = selectable.find(m => m.id === assigneeId);
      setTitle(""); setDesc(""); setDueDate(""); setClItems([]); setClDraft(""); setPriority("media"); setShowDetails(false);
      showToast(assigned ? `Tarea asignada a ${(assigned.name ?? assigned.email ?? "").split(" ")[0]} ✓` : "Tarea creada");
      tvRefetch(); onRefreshTasks();
      setTimeout(() => titleRef.current?.focus(), 80);
    } catch (err: any) { showToast(err.message || "Error al crear tarea"); }
    finally { setComposing(false); }
  };

  const deleteTask = async (id: number) => {
    try {
      const r = await fetch(`${HUB_API_BASE}/hub/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e2 = await r.json().catch(() => ({} as Record<string, unknown>)); showToast((e2 as { error?: string }).error || "Error al eliminar"); return; }
      showToast("Tarea eliminada");
      tvRefetch(); onRefreshTasks(); void queryClient.invalidateQueries({ queryKey: TAREAS_QUERY_KEY });
    } catch { showToast("Error de conexión"); }
  };

  const PRIOS: ("crítica" | "alta" | "media" | "baja")[] = ["crítica", "alta", "media", "baja"];
  const PRIO_ON: Record<string, string> = { "crítica": "bg-red-500/15 text-red-400", "alta": "bg-orange-400/15 text-orange-400", "media": "bg-blue-400/15 text-blue-400", "baja": "bg-foreground/10 text-foreground/70" };

  return (
    <div className="main-scroll p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Panel de asignación */}
      <form onSubmit={handleAssign} className="bg-card border border-foreground/10 rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Asignar tarea</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {selectable.length === 0 && <p className="text-xs text-muted-foreground py-1">Cargando equipo…</p>}
          {selectable.map(m => {
            const on = assigneeId === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setAssigneeId(on ? null : m.id)}
                className={`flex items-center gap-2 flex-shrink-0 rounded-xl border px-3 py-2 transition-colors ${on ? "border-primary bg-primary/10" : "border-foreground/10 bg-background hover:border-foreground/30"}`}>
                {m.picture
                  ? <img src={m.picture} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full" />
                  : <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold">{(m.name ?? m.email ?? "?")[0]?.toUpperCase()}</div>}
                <span className="text-left">
                  <span className="block text-xs font-semibold leading-tight">{(m.name ?? m.email ?? "—").split(" ")[0]}</span>
                  <span className="block text-[10px] text-muted-foreground leading-tight capitalize">{m.teamRole ?? "—"}{m.activeCount != null ? ` · ${m.activeCount} activa${m.activeCount !== 1 ? "s" : ""}` : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
        <input ref={titleRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="¿Qué hay que hacer?" className="w-full bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-foreground/15 overflow-hidden">
            {PRIOS.map(p => (
              <button type="button" key={p} onClick={() => setPriority(p)}
                className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${priority === p ? PRIO_ON[p] : "text-muted-foreground hover:text-foreground"}`}>{p}</button>
            ))}
          </div>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <button type="button" onClick={() => setShowDetails(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1">
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Detalles{(desc.trim() || clItems.length > 0) ? " ●" : ""}
          </button>
          <button type="submit" disabled={composing || !title.trim()}
            className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
            <Send className="w-3.5 h-3.5" />{composing ? "Enviando…" : assigneeId ? "Asignar tarea" : "Crear tarea"}
          </button>
        </div>
        {showDetails && (
          <div className="space-y-2 pt-1">
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Descripción / contexto (opcional)"
              className="w-full bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y" />
            <div className="space-y-1">
              {clItems.map(it => (
                <div key={it.id} className="flex items-center gap-2 text-xs bg-foreground/4 rounded-lg px-2.5 py-1.5">
                  <span className="text-muted-foreground">☐</span>
                  <span className="flex-1 text-foreground/80">{it.text}</span>
                  <button type="button" onClick={() => setClItems(clItems.filter(x => x.id !== it.id))} className="text-muted-foreground/60 hover:text-red-400 transition-colors" title="Quitar"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <input type="text" value={clDraft} onChange={e => setClDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const t2 = clDraft.trim(); if (t2) { setClItems([...clItems, { id: uid(), text: t2, done: false }]); setClDraft(""); } } }}
                placeholder="Paso del checklist + Enter" className="w-full bg-background border border-foreground/15 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
        )}
      </form>

      {/* Member cards */}
      {tvLoading && <p className="text-center text-sm text-muted-foreground py-8">Cargando equipo…</p>}
      {!tvLoading && members.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground border border-dashed border-foreground/15 rounded-2xl">
          Sin integrantes visibles todavía — cuando el equipo inicie sesión aparecerá aquí.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2 items-start">
        {members.map(member => {
          const sem = member.semaphore;
          const isExp = expandedId === member.id;
          return (
            <div key={member.id} className={`bg-card border rounded-2xl overflow-hidden ${SEM_BORDER[sem]}`}>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="relative flex-shrink-0">
                  {member.picture
                    ? <img src={member.picture} alt="" className={`w-9 h-9 rounded-full ring-2 ${SEM_RING[sem]}`} />
                    : <div className={`w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center text-sm font-bold ring-2 ${SEM_RING[sem]}`}>{(member.name ?? "?")[0]?.toUpperCase()}</div>}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${SEM_DOT[sem]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{member.name ?? member.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{member.teamRole ?? "—"} · {member.activeCount} tarea{member.activeCount !== 1 ? "s" : ""} activa{member.activeCount !== 1 ? "s" : ""}</p>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${SEM_PILL[sem]}`}>{SEM_LABEL[sem]}</span>
                <button onClick={() => setExpandedId(isExp ? null : member.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" title={isExp ? "Colapsar" : "Ver actividad del día"}>
                  {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Active tasks */}
              {member.activeTasks.length > 0 && (
                <div className="px-4 pb-3 space-y-1">
                  {member.activeTasks.map(t => (
                    <div key={t.id} className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${t.stagnant || t.overdue ? "bg-red-500/8" : t.dueToday ? "bg-yellow-400/8" : "bg-foreground/4"}`}>
                      <span className={`flex-shrink-0 text-[8px] ${TV_PRIO[t.priority] ?? "text-foreground/40"}`}>●</span>
                      <span className="flex-1 text-foreground/80 truncate">{t.title}</span>
                      <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TV_STAGE_CLS[t.stage] ?? "text-muted-foreground"}`}>{TV_STAGE[t.stage] ?? t.stage}</span>
                      {t.stageSinceMs > 0 && (
                        <span className={`flex-shrink-0 flex items-center gap-0.5 ${t.stagnant ? "text-red-400" : "text-muted-foreground"}`}>
                          <Clock3 className="w-2.5 h-2.5" />{fmtMs(t.stageSinceMs)}
                          {t.stagnant && <AlertTriangle className="w-2.5 h-2.5" />}
                        </span>
                      )}
                      {t.overdue && <span className="flex-shrink-0 text-red-400 font-medium">Vencida</span>}
                      {t.dueToday && !t.overdue && <span className="flex-shrink-0 text-yellow-400">Hoy</span>}
                      {canDelete && (
                        <button onClick={() => onConfirm(`¿Eliminar "${t.title}"? No se puede deshacer.`, () => { void deleteTask(t.id); })}
                          className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-red-400 transition-colors" title="Eliminar tarea">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {member.activeTasks.length === 0 && (
                <p className="px-4 pb-3 text-xs text-muted-foreground">Sin tareas activas — disponible para asignar</p>
              )}

              {/* Activity log */}
              <AnimatePresence initial={false}>
                {isExp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                    <div className="border-t border-foreground/8 mx-4 pt-3 pb-4 space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Actividad de hoy</p>
                      {(actData?.items ?? []).length === 0
                        ? <p className="text-xs text-muted-foreground">Sin actividad registrada hoy.</p>
                        : (actData?.items ?? []).map(a => {
                            const time = new Date(a.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
                            const desc = a.action === "stage_change"
                              ? `movió "${a.taskTitle}" a ${TV_STAGE[a.newStage ?? ""] ?? a.newStage}`
                              : a.action === "created" ? `creó "${a.taskTitle}"`
                              : a.action === "commented" ? `comentó en "${a.taskTitle}"`
                              : `reasignó "${a.taskTitle}"`;
                            return (
                              <div key={a.id} className="flex gap-2 text-xs text-muted-foreground">
                                <span className="flex-shrink-0 font-mono text-[10px]">{time}</span>
                                <span className="text-foreground/60">{desc}</span>
                              </div>
                            );
                          })
                      }
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Bitácora global del equipo (filtrable por persona) */}
      <ActivityFeed global people={selectable.map(m => ({ id: m.id, name: m.name, email: m.email }))} />
    </div>
  );
}

/* ═══════════════════ ASISTENCIA (jornada + registro diario) ═══════════════════ */

