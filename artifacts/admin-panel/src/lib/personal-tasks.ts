import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// "Mis pendientes": tareas y checklists 100% privados por usuario. No tiene
// relación con `tareas-hub.ts` (el tablero compartido del Hub detrás de la
// página "Mis tareas") — son dos secciones distintas a propósito.

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface PersonalTask {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface PersonalChecklist {
  id: number;
  title: string;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonalTasksResponse {
  tasks: PersonalTask[];
  checklists: PersonalChecklist[];
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

const QUERY_KEY = ["personal-tasks"] as const;

export function usePersonalTasks() {
  return useQuery<PersonalTasksResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => api<PersonalTasksResponse>("/personal-tasks"),
    staleTime: 15_000,
  });
}

function useSync() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: QUERY_KEY }); };
}

/* ── Tareas simples ──────────────────────────────────────────────────── */

export function useCreateTask() {
  const sync = useSync();
  return useMutation({
    mutationFn: (title: string) =>
      api<{ task: PersonalTask }>("/personal-tasks", { method: "POST", body: JSON.stringify({ title }) }),
    onSuccess: sync,
  });
}

export function useUpdateTask() {
  const sync = useSync();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; title?: string; done?: boolean }) =>
      api<{ task: PersonalTask }>(`/personal-tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: sync,
  });
}

export function useDeleteTask() {
  const sync = useSync();
  return useMutation({
    mutationFn: (id: number) => api<{ success: true }>(`/personal-tasks/${id}`, { method: "DELETE" }),
    onSuccess: sync,
  });
}

/* ── Checklists ──────────────────────────────────────────────────────── */

export function useCreateChecklist() {
  const sync = useSync();
  return useMutation({
    mutationFn: (title: string) =>
      api<{ checklist: PersonalChecklist }>("/personal-checklists", { method: "POST", body: JSON.stringify({ title }) }),
    onSuccess: sync,
  });
}

export function useRenameChecklist() {
  const sync = useSync();
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      api<{ checklist: PersonalChecklist }>(`/personal-checklists/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    onSuccess: sync,
  });
}

export function useDeleteChecklist() {
  const sync = useSync();
  return useMutation({
    mutationFn: (id: number) => api<{ success: true }>(`/personal-checklists/${id}`, { method: "DELETE" }),
    onSuccess: sync,
  });
}

export function useAddChecklistItem() {
  const sync = useSync();
  return useMutation({
    mutationFn: ({ checklistId, text }: { checklistId: number; text: string }) =>
      api<{ checklist: PersonalChecklist }>(`/personal-checklists/${checklistId}/items`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: sync,
  });
}

export function useUpdateChecklistItem() {
  const sync = useSync();
  return useMutation({
    mutationFn: ({ checklistId, itemId, ...patch }: { checklistId: number; itemId: string; text?: string; done?: boolean }) =>
      api<{ checklist: PersonalChecklist }>(`/personal-checklists/${checklistId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: sync,
  });
}

export function useDeleteChecklistItem() {
  const sync = useSync();
  return useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: number; itemId: string }) =>
      api<{ checklist: PersonalChecklist }>(`/personal-checklists/${checklistId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: sync,
  });
}
