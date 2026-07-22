import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import type {
  ClientRow, ContractRow, HubOverview, MeetingRow, MemberRow, NoteRow,
  ProjectRow, QuoteRow, TaskRow,
} from "./types";

/* ============================================================
   CAPA DE DATOS — TanStack Query contra /api/hub/*
   staleTime 15s · refetchInterval 30s · refetchOnWindowFocus
   Mutaciones optimistas con rollback.
   ============================================================ */

export type HubEntity = "clients" | "projects" | "tasks" | "meetings" | "notes" | "contracts" | "quotes";

export const hubKey = (segment: string) => ["hub", segment] as const;

const LIST_OPTS = {
  staleTime: 15_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
} as const;

interface HubRowLike { id: number; updatedAt?: string; }

function useHubList<T extends HubRowLike>(entity: HubEntity) {
  return useQuery<T[]>({
    queryKey: hubKey(entity),
    queryFn: () => apiGet<T[]>(`/hub/${entity}`),
    ...LIST_OPTS,
  });
}

export const useClients = () => useHubList<ClientRow>("clients");
export const useProjects = () => useHubList<ProjectRow>("projects");
export const useTasks = () => useHubList<TaskRow>("tasks");
export const useMeetings = () => useHubList<MeetingRow>("meetings");
export const useNotes = () => useHubList<NoteRow>("notes");
export const useContracts = () => useHubList<ContractRow>("contracts");
export const useQuotes = () => useHubList<QuoteRow>("quotes");

export function useMembers() {
  return useQuery<MemberRow[]>({
    queryKey: hubKey("members"),
    queryFn: () => apiGet<MemberRow[]>("/hub/members"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useHubOverview() {
  return useQuery<HubOverview>({
    queryKey: hubKey("overview"),
    queryFn: () => apiGet<HubOverview>("/hub/overview"),
    ...LIST_OPTS,
  });
}

/** Todas las listas juntas (comparten caché — barato de usar en varios componentes). */
export function useHubData() {
  const clients = useClients();
  const projects = useProjects();
  const tasks = useTasks();
  const meetings = useMeetings();
  const notes = useNotes();
  const contracts = useContracts();
  const quotes = useQuotes();
  return {
    clients: clients.data ?? [],
    projects: projects.data ?? [],
    tasks: tasks.data ?? [],
    meetings: meetings.data ?? [],
    notes: notes.data ?? [],
    contracts: contracts.data ?? [],
    quotes: quotes.data ?? [],
    isLoading: clients.isLoading || projects.isLoading || tasks.isLoading ||
      meetings.isLoading || notes.isLoading || contracts.isLoading || quotes.isLoading,
    isError: clients.isError || projects.isError || tasks.isError ||
      meetings.isError || notes.isError || contracts.isError || quotes.isError,
  };
}

/* ============================================================
   MUTACIONES OPTIMISTAS
   ============================================================ */

interface MutCtx<T> { prev: T[] | undefined; }

let tempSeq = 0;
/** Id temporal negativo para filas optimistas (el servidor asigna el real). */
function tempId(): number { tempSeq += 1; return -(Date.now() % 1_000_000_000) - tempSeq * 1_000_000_000; }

export type CreateMutation<T> = UseMutationResult<T, Error, Record<string, unknown>, MutCtx<T>>;
export type UpdateMutation<T> = UseMutationResult<T, Error, { id: number; patch: Record<string, unknown> }, MutCtx<T>>;
export type DeleteMutation<T> = UseMutationResult<void, Error, number, MutCtx<T>>;

export interface EntityMutations<T> {
  create: CreateMutation<T>;
  update: UpdateMutation<T>;
  remove: DeleteMutation<T>;
}

export function useEntityMutations<T extends HubRowLike>(entity: HubEntity): EntityMutations<T> {
  const qc = useQueryClient();
  const key = hubKey(entity);

  const snapshot = async (): Promise<T[] | undefined> => {
    await qc.cancelQueries({ queryKey: key });
    return qc.getQueryData<T[]>(key);
  };
  const rollback = (ctx: MutCtx<T> | undefined) => {
    if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
  };
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: hubKey("overview") });
  };

  const create = useMutation<T, Error, Record<string, unknown>, MutCtx<T>>({
    mutationFn: (body) => apiPost<T>(`/hub/${entity}`, body),
    onMutate: async (body) => {
      const prev = await snapshot();
      const now = new Date().toISOString();
      const temp = { id: tempId(), createdBy: null, createdAt: now, updatedAt: now, extra: {}, ...body } as unknown as T;
      qc.setQueryData<T[]>(key, [temp, ...(prev ?? [])]);
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const update = useMutation<T, Error, { id: number; patch: Record<string, unknown> }, MutCtx<T>>({
    mutationFn: ({ id, patch }) => apiPatch<T>(`/hub/${entity}/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      const prev = await snapshot();
      const now = new Date().toISOString();
      qc.setQueryData<T[]>(key, (prev ?? []).map(row =>
        row.id === id ? ({ ...row, ...patch, updatedAt: now } as unknown as T) : row,
      ));
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  const remove = useMutation<void, Error, number, MutCtx<T>>({
    mutationFn: (id) => apiDelete(`/hub/${entity}/${id}`),
    onMutate: async (id) => {
      const prev = await snapshot();
      qc.setQueryData<T[]>(key, (prev ?? []).filter(row => row.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  });

  return { create, update, remove };
}

/** Campos re-creables de una fila (para deshacer un borrado vía POST). */
export function creatableBody(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  delete out.id;
  delete out.createdAt;
  delete out.updatedAt;
  delete out.createdBy;
  delete out.reminderSentAt;
  delete out.expiryRemindedAt;
  delete out.contractId;
  return out;
}

/* ============================================================
   ACCIONES ESPECIALES
   ============================================================ */

export function useConvertQuote() {
  const qc = useQueryClient();
  return useMutation<{ contract: ContractRow }, Error, number>({
    mutationFn: (quoteId) => apiPost<{ contract: ContractRow }>(`/hub/quotes/${quoteId}/convert-to-contract`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: hubKey("contracts") });
      void qc.invalidateQueries({ queryKey: hubKey("quotes") });
      void qc.invalidateQueries({ queryKey: hubKey("overview") });
    },
  });
}

export interface MigrateResult { migrated: boolean; counts?: Record<string, number>; }

export function useMigrateLegacy() {
  const qc = useQueryClient();
  return useMutation<MigrateResult, Error, void>({
    mutationFn: () => apiPost<MigrateResult>("/hub/migrate-legacy"),
    onSuccess: (res) => {
      if (res.migrated) void qc.invalidateQueries({ queryKey: ["hub"] });
    },
  });
}

export function useInvalidateHub() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["hub"] }); };
}
