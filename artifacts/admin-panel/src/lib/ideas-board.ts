// Tablero de Ideas: compartido entre TODAS las cuentas de Editora y Redes
// sociales (y los roles de acceso total) — no es una lista privada por
// usuario. Dos columnas fijas, sin edición de texto ni comentarios: solo
// cargar, mover y eliminar. Ver ideas-gate.ts en el backend para el gate por
// ROL (Marketing comparte área con Redes sociales pero no tiene acceso).
//
// Distinto del generador de ideas de video con IA de Estudio
// (ai-video-ideas-tab.tsx, tabla `video_ideas`, `/api/studio/ideas`).

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export const IDEA_COLUMNS = ["funciona", "no_funciona"] as const;
export type IdeaColumnId = (typeof IDEA_COLUMNS)[number];

export interface Idea {
  id: number;
  title: string;
  columnId: IdeaColumnId;
  createdByUserId: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const IDEAS_QUERY_KEY = ["ideas-board"] as const;

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  if (!r.ok) {
    const b = (await r.json().catch(() => null)) as { error?: unknown } | null;
    const msg = typeof b?.error === "string" ? b.error : `El servidor respondió ${r.status}`;
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export function useIdeasBoard() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: IDEAS_QUERY_KEY,
    queryFn: () => pedir<{ ideas: Idea[] }>(`${API_BASE}/ideas`),
    staleTime: 15_000,
  });

  const lista = query.data?.ideas ?? [];

  const grouped = useMemo(() => {
    const g: Record<IdeaColumnId, Idea[]> = { funciona: [], no_funciona: [] };
    for (const idea of lista) {
      (g[idea.columnId] ?? g.funciona).push(idea);
    }
    return g;
  }, [lista]);

  const refrescar = () => { void qc.invalidateQueries({ queryKey: IDEAS_QUERY_KEY }); };

  const crear = useMutation({
    mutationFn: (p: { title: string; columnId: IdeaColumnId }) =>
      pedir<{ idea: Idea }>(`${API_BASE}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      }),
    onSuccess: refrescar,
  });

  const mover = useMutation({
    mutationFn: (p: { id: number; columnId: IdeaColumnId }) =>
      pedir<{ idea: Idea }>(`${API_BASE}/ideas/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId: p.columnId }),
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: IDEAS_QUERY_KEY });
      const prev = qc.getQueryData<{ ideas: Idea[] }>(IDEAS_QUERY_KEY);
      if (prev) {
        qc.setQueryData<{ ideas: Idea[] }>(IDEAS_QUERY_KEY, {
          ideas: prev.ideas.map((i) => (i.id === vars.id ? { ...i, columnId: vars.columnId } : i)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(IDEAS_QUERY_KEY, ctx.prev);
    },
    onSettled: refrescar,
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => pedir<{ success: true }>(`${API_BASE}/ideas/${id}`, { method: "DELETE" }),
    onSuccess: refrescar,
  });

  return {
    grouped,
    cargando: query.isLoading,
    error: query.error as Error | null,
    crear,
    mover,
    eliminar,
  };
}
