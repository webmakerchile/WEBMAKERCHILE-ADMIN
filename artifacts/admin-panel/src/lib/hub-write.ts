import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HubScope } from "@workspace/roles";
import type { HubProject, HubTask, HubContract, HubClient, HubMeeting } from "@/lib/hub-owner";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/**
 * Escritura sobre el tablero compartido.
 *
 * `/api/hub/owner` es la vista de lectura; esta capa usa `/api/hub`, que además
 * devuelve la versión del tablero y qué colecciones puede modificar el rol
 * (`writeScopes`). El servidor fusiona entidad por entidad usando `baseVersion`,
 * así que el cliente manda la colección completa que tiene y nadie se pisa el
 * trabajo: gana la entidad con `updatedAt` más reciente.
 *
 * De ahí la regla de oro al modificar: SIEMPRE subir `updatedAt` de la entidad
 * tocada, o el servidor conservará la copia guardada.
 */

export interface HubBoard {
  data: {
    projects?: HubProject[];
    tasks?: HubTask[];
    contracts?: HubContract[];
    clients?: HubClient[];
    meetings?: HubMeeting[];
    notes?: unknown[];
  } | null;
  version: number;
  scopes: HubScope[];
  writeScopes: HubScope[];
  owner: { name: string | null; email: string } | null;
}

export function useHubBoard() {
  return useQuery<HubBoard>({
    queryKey: ["hub-board"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/hub`, { credentials: "include" });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || "No se pudo cargar el tablero");
      }
      return r.json();
    },
    staleTime: 30_000,
  });
}

type HubPatchBody = Partial<Record<HubScope, unknown[]>>;

export function useHubPatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, baseVersion }: { data: HubPatchBody; baseVersion: number }) => {
      const r = await fetch(`${API_BASE}/hub`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, baseVersion }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || "No se pudo guardar el cambio");
      }
      return r.json() as Promise<HubBoard>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hub-board"] });
      // El resto del panel lee la vista recortada: que se entere también.
      void qc.invalidateQueries({ queryKey: ["hub-owner"] });
    },
  });
}

/** Reemplaza una entidad de la lista sellando su `updatedAt`. */
export function replaceEntity<T extends { id: string; updatedAt?: number }>(
  list: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return list.map(e => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e));
}

/** Identificador estable para entidades nuevas creadas desde el panel. */
export function newHubId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
