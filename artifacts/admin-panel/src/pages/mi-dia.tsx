import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { CheckSquare2, Square, ChevronDown, ChevronUp, AlertTriangle, CalendarDays, Clock3, CalendarX, CheckCheck, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Priority = "crítica" | "alta" | "media" | "baja";

interface DayTask {
  id: number;
  title: string;
  stage: string;
  priority: Priority;
  dueDate: string | null;
  completedAt: string | null;
  projectRef: string | null;
  notes: string | null;
  stageSince: string | null;
}

interface MyDayResponse {
  groups: {
    vencidas: DayTask[];
    hoy: DayTask[];
    semana: DayTask[];
    sinFecha: DayTask[];
    completedToday: DayTask[];
  };
  progress: { done: number; total: number };
}

const PRIO_COLOR: Record<Priority, string> = {
  "crítica": "text-red-400 border-red-400/40",
  "alta":    "text-orange-400 border-orange-400/40",
  "media":   "text-blue-400 border-blue-400/40",
  "baja":    "text-foreground/40 border-foreground/20",
};

const STAGE_LABELS: Record<string, string> = {
  backlog:  "Backlog",
  sprint:   "Sprint",
  doing:    "En progreso",
  qa_sent:  "QA enviado",
  qa_rev:   "QA revisión",
  done:     "Listo",
};

async function patchTask(id: number, stage: string) {
  const r = await fetch(`${API}/hub/tasks/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function TaskRow({ task, onToggle, pending }: { task: DayTask; onToggle: () => void; pending?: boolean }) {
  const done = task.stage === "done";
  const prio = task.priority in PRIO_COLOR ? task.priority as Priority : "media";

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${done ? "border-foreground/8 opacity-50" : "border-foreground/10 hover:border-foreground/20"} bg-card/60`}>
      <button
        onClick={onToggle}
        disabled={pending}
        className="mt-0.5 flex-shrink-0 transition-colors text-foreground/50 hover:text-primary"
        aria-label={done ? "Marcar pendiente" : "Marcar completada"}
      >
        {pending
          ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          : done
            ? <CheckSquare2 className="w-5 h-5 text-primary" />
            : <Square className="w-5 h-5" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? "line-through text-foreground/40" : "text-foreground"}`}>
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${PRIO_COLOR[prio]}`}>
            {prio}
          </span>
          <span className="text-[10px] text-muted-foreground">{STAGE_LABELS[task.stage] ?? task.stage}</span>
          {task.projectRef && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{task.projectRef}</span>
          )}
          {task.dueDate && !done && (
            <span className="text-[10px] text-muted-foreground">{task.dueDate}</span>
          )}
          {done && task.completedAt && (
            <span className="text-[10px] text-emerald-400">
              {new Date(task.completedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({
  icon,
  label,
  accent,
  tasks,
  defaultCollapsed = false,
  pendingIds,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  accent: string;
  tasks: DayTask[];
  defaultCollapsed?: boolean;
  pendingIds: Set<number>;
  onToggle: (task: DayTask) => void;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className={`${accent} opacity-80`}>{icon}</span>
        <span className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{label}</span>
        <span className="ml-1 text-xs text-muted-foreground">({tasks.length})</span>
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} pending={pendingIds.has(t.id)} onToggle={() => onToggle(t)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MiDiaPage() {
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  const today = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);

  const { data, isLoading, error } = useQuery<MyDayResponse>({
    queryKey: ["my-day"],
    queryFn: async () => {
      const r = await fetch(`${API}/hub/tasks/my-day`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const handleToggle = async (task: DayTask) => {
    const newStage = task.stage === "done" ? "sprint" : "done";
    setPendingIds((s) => new Set([...s, task.id]));

    // Optimistic update
    queryClient.setQueryData<MyDayResponse>(["my-day"], (old) => {
      if (!old) return old;
      const now = new Date().toISOString();
      const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
      const todayStr = new Date().toISOString().slice(0, 10);
      const weekEndDate = new Date(); weekEndDate.setDate(weekEndDate.getDate() + 6);
      const weekEndStr = weekEndDate.toISOString().slice(0, 10);

      const updatedTask = { ...task, stage: newStage, completedAt: newStage === "done" ? now : null };

      const rebuild = (tasks: DayTask[]) => tasks.filter((t) => t.id !== task.id);
      const vencidas = rebuild(old.groups.vencidas);
      const hoy = rebuild(old.groups.hoy);
      const semana = rebuild(old.groups.semana);
      const sinFecha = rebuild(old.groups.sinFecha);
      const completedToday = rebuild(old.groups.completedToday);

      if (newStage === "done") {
        completedToday.unshift(updatedTask);
      } else {
        // Put back in the right group
        if (!updatedTask.dueDate) sinFecha.push(updatedTask);
        else if (updatedTask.dueDate < todayStr) vencidas.push(updatedTask);
        else if (updatedTask.dueDate === todayStr) hoy.push(updatedTask);
        else if (updatedTask.dueDate <= weekEndStr) semana.push(updatedTask);
        else sinFecha.push(updatedTask);
      }

      const total = vencidas.length + hoy.length + semana.length + sinFecha.length + completedToday.length;
      return {
        groups: { vencidas, hoy, semana, sinFecha, completedToday },
        progress: { done: completedToday.length, total },
      };
    });

    try {
      await patchTask(task.id, newStage);
      queryClient.invalidateQueries({ queryKey: ["my-day"] });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["my-day"] });
    } finally {
      setPendingIds((s) => { const n = new Set(s); n.delete(task.id); return n; });
    }
  };

  const g = data?.groups;
  const pct = data ? (data.progress.total === 0 ? 0 : Math.round((data.progress.done / data.progress.total) * 100)) : 0;
  const totalPending = g ? g.vencidas.length + g.hoy.length + g.semana.length + g.sinFecha.length : 0;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mi día</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{todayCapitalized}</p>
        </div>

        {/* Progress bar */}
        {data && data.progress.total > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{data.progress.done} de {data.progress.total} completadas</span>
              <span className="font-medium text-foreground">{pct}%</span>
            </div>
            <div className="h-2 bg-foreground/8 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {/* Tasks */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando tareas...
          </div>
        )}
        {error && (
          <div className="text-center py-8 text-red-400 text-sm">{String(error)}</div>
        )}

        {g && (
          <div className="space-y-6">
            <Group
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              label="Vencidas"
              accent="text-red-400"
              tasks={g.vencidas}
              pendingIds={pendingIds}
              onToggle={handleToggle}
            />
            <Group
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label="Hoy"
              accent="text-orange-400"
              tasks={g.hoy}
              pendingIds={pendingIds}
              onToggle={handleToggle}
            />
            <Group
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label="Esta semana"
              accent="text-blue-400"
              tasks={g.semana}
              pendingIds={pendingIds}
              onToggle={handleToggle}
            />
            <Group
              icon={<Clock3 className="w-3.5 h-3.5" />}
              label="Sin fecha"
              accent="text-foreground/50"
              tasks={g.sinFecha}
              pendingIds={pendingIds}
              onToggle={handleToggle}
            />

            {totalPending === 0 && g.completedToday.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No tienes tareas asignadas por ahora.</p>
              </div>
            )}

            {/* Completed today - collapsible */}
            {g.completedToday.length > 0 && (
              <Group
                icon={<CheckCheck className="w-3.5 h-3.5" />}
                label="Completadas hoy"
                accent="text-emerald-400"
                tasks={g.completedToday}
                defaultCollapsed={true}
                pendingIds={pendingIds}
                onToggle={handleToggle}
              />
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
