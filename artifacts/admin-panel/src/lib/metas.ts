import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export const PERIODS = ["diaria", "semanal", "mensual"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  diaria: "Hoy",
  semanal: "Esta semana",
  mensual: "Este mes",
};

export const PERIOD_STYLE: Record<Period, string> = {
  diaria: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  semanal: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  mensual: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

export type GoalStatus = "pendiente" | "cumplida" | "no_cumplida";

export interface Persona { id: number; name: string | null; email: string; picture: string | null }

export interface Goal {
  id: number;
  title: string;
  description: string;
  period: Period;
  periodKey: string;
  assignedTo: number;
  createdBy: number;
  status: GoalStatus;
  target: number | null;
  progress: number;
  completedAt: string | null;
  createdAt: string;
  assignee: Persona | null;
  creator: Persona | null;
}

export interface GoalsResponse {
  goals: Goal[];
  periods: Period[];
  currentKeys: Record<Period, string>;
  canAssign: boolean;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}) as { error?: string });
    throw new Error((e as { error?: string }).error || "Error de conexión");
  }
  return r.json() as Promise<T>;
}

/** `scope: "team"` trae las metas de todo el equipo (solo para quien asigna). */
export function useGoals(scope: "mias" | "team" = "mias") {
  return useQuery<GoalsResponse>({
    queryKey: ["goals", scope],
    queryFn: () => api<GoalsResponse>(`/goals${scope === "team" ? "?scope=team" : ""}`),
    staleTime: 30_000,
  });
}

function useGoalsSync() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["goals"] }); };
}

export interface NewGoal {
  title: string;
  description?: string;
  period: Period;
  assignedTo: number;
  target?: number | null;
}

export function useCreateGoal() {
  const sync = useGoalsSync();
  return useMutation({
    mutationFn: (g: NewGoal) => api<Goal>("/goals", { method: "POST", body: JSON.stringify(g) }),
    onSuccess: sync,
  });
}

export function useUpdateGoal() {
  const sync = useGoalsSync();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Goal> & { id: number }) =>
      api<Goal>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: sync,
  });
}

export function useDeleteGoal() {
  const sync = useGoalsSync();
  return useMutation({
    mutationFn: (id: number) => api<{ ok: true }>(`/goals/${id}`, { method: "DELETE" }),
    onSuccess: sync,
  });
}

/** Avance en porcentaje cuando la meta tiene número; si no, cumplida = 100. */
export function goalPercent(g: Goal): number {
  if (g.status === "cumplida") return 100;
  if (!g.target || g.target <= 0) return 0;
  return Math.min(100, Math.round((g.progress / g.target) * 100));
}
