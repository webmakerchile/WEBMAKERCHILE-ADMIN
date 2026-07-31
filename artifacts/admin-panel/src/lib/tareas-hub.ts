// Adaptador de tareas: UNA sola fuente de verdad.
//
// Convivían DOS sistemas de tareas sin ninguna conexión:
//
//  · `hub_tasks` (tabla de verdad) — el tablero Scrum del Hub Ejecutivo, los
//    playbooks, los handoffs al cerrar una venta, las notificaciones.
//  · `hub_state.data.tasks` (una colección dentro del blob) — usada EN
//    EXCLUSIVA por la página "Mis tareas".
//
// O sea que una tarea que un dev se creaba desde el brief era invisible para
// su jefe, y una tarea que el jefe le asignaba desde el tablero era invisible
// para él. Cada uno miraba una lista distinta creyendo que era la misma.
//
// Este módulo presenta `hub_tasks` con la forma que ya renderiza "Mis tareas",
// así que la página no cambia de aspecto pero pasa a mirar la lista real.

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");
export const TAREAS_QUERY_KEY = ["hub-tasks-mias"] as const;

/** Etapas válidas del servidor (`VALID_STAGES` en routes/hub/tasks). */
export const ETAPAS = ["backlog", "sprint", "doing", "qa_sent", "qa_rev", "done"] as const;
export type Etapa = (typeof ETAPAS)[number];

/** Prioridades válidas del servidor (`VALID_PRIORITIES`). */
const PRIORIDADES = ["crítica", "alta", "media", "baja"] as const;

/** La forma que renderiza "Mis tareas". Se mantiene para no rehacer la vista. */
export interface TareaVista {
  /** id numérico real de `hub_tasks`, en texto para encajar con la vista. */
  id: string;
  title: string;
  projectId: string;
  crit: string;
  stage: string;
  stageSince: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
  /** Quién la tiene asignada, si alguien. Antes ni existía en el blob. */
  asignadoA: { id: number; name: string | null; email: string | null } | null;
  /** true si la tarea la creó otra persona: es trabajo que te asignaron. */
  ajena: boolean;
  /**
   * "arranque_ia" | "arranque_brief" | "contenido_ia" si la generó el sistema;
   * null si la escribió una persona. Solo lectura: la fija el servidor.
   */
  origin: string | null;
  /** Semana ISO comprometida ("2026-W31") o null si sigue en backlog. */
  sprintWeek: string | null;
  /** La otra mitad del par de contenido (redes ↔ edición), si existe. */
  pareja: { id: number; title: string; stage: string; assigneeName: string | null } | null;
}

interface FilaServidor {
  id: number;
  title: string;
  notes: string | null;
  priority: string;
  stage: string;
  stageSince: string | null;
  projectRef: string | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  assignee: { id: number; name: string | null; email: string | null } | null;
  origin?: string | null;
  sprintWeek?: string | null;
  pareja?: { id: number; title: string; stage: string; assigneeName: string | null } | null;
}

const ms = (v: string | null | undefined, porDefecto: number): number => {
  if (!v) return porDefecto;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : porDefecto;
};

/** Fila del servidor → la forma que espera la vista. */
export function aVista(r: FilaServidor, miId: number | null): TareaVista {
  const creada = ms(r.createdAt, Date.now());
  return {
    id: String(r.id),
    title: r.title,
    projectId: r.projectRef ?? "",
    crit: (PRIORIDADES as readonly string[]).includes(r.priority) ? r.priority : "media",
    stage: (ETAPAS as readonly string[]).includes(r.stage) ? r.stage : "backlog",
    stageSince: ms(r.stageSince, creada),
    notes: r.notes ?? "",
    createdAt: creada,
    updatedAt: ms(r.updatedAt, creada),
    asignadoA: r.assignee,
    ajena: miId !== null && r.createdById !== miId,
    origin: r.origin ?? null,
    sprintWeek: r.sprintWeek ?? null,
    pareja: r.pareja ?? null,
  };
}

/** Campos de la vista → cuerpo que entiende PATCH /hub/tasks/:id. */
export function aServidor(campos: Partial<TareaVista>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (campos.title !== undefined) body.title = campos.title;
  if (campos.notes !== undefined) body.notes = campos.notes || null;
  if (campos.stage !== undefined) body.stage = campos.stage;
  if (campos.crit !== undefined) body.priority = campos.crit;
  // El proyecto vacío es "sin proyecto", no la cadena "": la columna acepta null.
  if (campos.projectId !== undefined) body.projectRef = campos.projectId || null;
  return body;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  if (!r.ok) {
    const b = (await r.json().catch(() => null)) as { error?: unknown } | null;
    const msg = typeof b?.error === "string" ? b.error : `El servidor respondió ${r.status}`;
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

/**
 * Las tareas reales de quien mira.
 *
 * El servidor ya decide el alcance: sin gestión total devuelve las asignadas
 * a ti o creadas por ti, así que no hay que filtrar nada aquí.
 */
export function useTareasHub(miId: number | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: TAREAS_QUERY_KEY,
    queryFn: () => pedir<{ tasks: FilaServidor[] }>(`${API_BASE}/hub/tasks?limit=500`),
    staleTime: 15_000,
  });

  const tareas = useMemo(
    () => (query.data?.tasks ?? []).map((r) => aVista(r, miId)),
    [query.data, miId],
  );

  const refrescar = useCallback(() => { void qc.invalidateQueries({ queryKey: TAREAS_QUERY_KEY }); }, [qc]);

  const crear = useMutation({
    mutationFn: (t: { title: string; projectId?: string; crit?: string; notes?: string }) =>
      pedir(`${API_BASE}/hub/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t.title,
          notes: t.notes || undefined,
          priority: (PRIORIDADES as readonly string[]).includes(t.crit ?? "") ? t.crit : "media",
          projectRef: t.projectId || undefined,
          stage: "backlog",
        }),
      }),
    onSuccess: refrescar,
  });

  const actualizar = useMutation({
    mutationFn: (p: { id: string; campos: Partial<TareaVista> }) =>
      pedir(`${API_BASE}/hub/tasks/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aServidor(p.campos)),
      }),
    onSuccess: refrescar,
  });

  return { tareas, cargando: query.isLoading, error: query.error as Error | null, crear, actualizar, refrescar };
}

/* ── Mi semana: carga, cumplimiento y dónde ayudar ──────────────────────── */

export const MI_SEMANA_QUERY_KEY = ["hub-tasks-mi-semana"] as const;

export interface SugerenciaAyuda {
  id: number;
  title: string;
  priority: string;
  stage: string;
  projectRef: string | null;
  sprintWeek: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  /** true = está libre y se puede tomar; false = tiene dueño, solo ofrecer ayuda. */
  puedeTomar: boolean;
}

export interface MiSemana {
  /** Clave ISO de la semana en curso, ej. "2026-W31". */
  semana: string;
  progreso: { total: number; done: number };
  /** El servidor decide: semana propia completa (y con algo hecho). */
  elegible: boolean;
  sugerencias: SugerenciaAyuda[];
}

export function useMiSemana() {
  return useQuery({
    queryKey: MI_SEMANA_QUERY_KEY,
    queryFn: () => pedir<MiSemana>(`${API_BASE}/hub/tasks/mi-semana`),
    staleTime: 30_000,
  });
}

/** Tomar una tarea libre, o avisarle al responsable que puedes ayudar. */
export function useAyudar() {
  const qc = useQueryClient();
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: TAREAS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: MI_SEMANA_QUERY_KEY });
  };
  const tomar = useMutation({
    mutationFn: (id: number) => pedir(`${API_BASE}/hub/tasks/${id}/tomar`, { method: "POST" }),
    onSuccess: refrescar,
  });
  const ofrecer = useMutation({
    mutationFn: (p: { id: number; mensaje?: string }) =>
      pedir(`${API_BASE}/hub/tasks/${p.id}/ofrecer-ayuda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: p.mensaje ?? "" }),
      }),
    onSuccess: refrescar,
  });
  return { tomar, ofrecer };
}

/** Generar el plan semanal de contenido: pares redes ↔ edición con IA. */
export function useGenerarContenido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force?: boolean) =>
      pedir<{ semana: string; pares: number; tareas: number }>(
        `${API_BASE}/hub/tasks/generar-contenido`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: Boolean(force) }),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TAREAS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: MI_SEMANA_QUERY_KEY });
    },
  });
}
