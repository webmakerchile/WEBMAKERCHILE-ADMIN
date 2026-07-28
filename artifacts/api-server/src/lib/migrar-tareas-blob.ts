// Migración de las tareas del sistema viejo al real.
//
// "Mis tareas" guardaba en `hub_state.data.tasks`, una colección dentro del
// blob que no miraba nadie más, mientras el tablero del Hub Ejecutivo usaba la
// tabla `hub_tasks`. Ahora las dos pantallas leen `hub_tasks` — pero lo que el
// equipo ya había creado en la colección vieja se quedaría ahí, invisible.
//
// Esto lo mueve una sola vez, al arrancar. La colección vieja NO se borra: si
// algo saliera mal, el dato original sigue estando.

import { db } from "@workspace/db";
import { hubTasks } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveBoard, saveBoard } from "./hub-board";

/** Marca en el blob para no repetir la migración en cada arranque. */
export const MARCA_MIGRACION = "tareasMigradasAHubTasks";

const ETAPAS = new Set(["backlog", "sprint", "doing", "qa_sent", "qa_rev", "done"]);
const PRIORIDADES = new Set(["crítica", "alta", "media", "baja"]);

interface TareaBlob {
  id?: unknown;
  title?: unknown;
  projectId?: unknown;
  crit?: unknown;
  stage?: unknown;
  stageSince?: unknown;
  notes?: unknown;
  createdAt?: unknown;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const fecha = (v: unknown): Date => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n) : new Date();
};

export interface ResultadoMigracion {
  migradas: number;
  omitidas: number;
  motivo?: string;
}

/**
 * Mueve las tareas de la colección vieja a `hub_tasks`.
 *
 * Idempotente por dos vías: la marca en el blob y, dentro, un cotejo por
 * título + proyecto contra lo que ya existe. Duplicar el backlog del equipo
 * sería peor que no migrar nada.
 */
export async function migrarTareasDelBlob(): Promise<ResultadoMigracion> {
  const board = await resolveBoard();
  if (!board) return { migradas: 0, omitidas: 0, motivo: "sin tablero" };

  const data = board.data as Record<string, unknown>;
  if (data[MARCA_MIGRACION] === true) return { migradas: 0, omitidas: 0, motivo: "ya migradas" };

  const viejas = Array.isArray(data.tasks) ? (data.tasks as TareaBlob[]) : [];
  if (viejas.length === 0) {
    await saveBoard(board.boardUserId, { ...data, [MARCA_MIGRACION]: true });
    return { migradas: 0, omitidas: 0, motivo: "no había tareas viejas" };
  }

  // Quién queda como autor: el dueño del tablero. `createdById` es NOT NULL con
  // FK, y el blob no guardaba autor, así que no hay a quién más atribuirlas.
  const autor = board.boardUserId;

  let migradas = 0;
  let omitidas = 0;

  for (const t of viejas) {
    const title = texto(t.title).slice(0, 500);
    if (!title) { omitidas++; continue; }

    const projectRef = texto(t.projectId) || null;
    try {
      // ¿Ya está? Puede haber llegado por el handoff o por un playbook.
      const [existe] = await db
        .select({ id: hubTasks.id })
        .from(hubTasks)
        .where(
          projectRef
            ? and(eq(hubTasks.title, title), eq(hubTasks.projectRef, projectRef))
            : eq(hubTasks.title, title),
        )
        .limit(1);
      if (existe) { omitidas++; continue; }

      const creada = fecha(t.createdAt);
      const stage = ETAPAS.has(texto(t.stage)) ? texto(t.stage) : "backlog";
      await db.insert(hubTasks).values({
        title,
        notes: texto(t.notes) || null,
        createdById: autor,
        projectRef,
        stage,
        stageSince: t.stageSince ? fecha(t.stageSince) : creada,
        stageTime: {},
        priority: PRIORIDADES.has(texto(t.crit)) ? texto(t.crit) : "media",
        orderIndex: 0,
        createdAt: creada,
      });
      migradas++;
    } catch (e) {
      console.warn(`[migrar-tareas] "${title}" no se pudo migrar: ${(e as Error).message}`);
      omitidas++;
    }
  }

  // La marca se guarda pase lo que pase: reintentar en cada arranque con una
  // tarea que siempre falla dejaría el log lleno y no arreglaría nada.
  await saveBoard(board.boardUserId, { ...data, [MARCA_MIGRACION]: true });
  console.log(`[migrar-tareas] ${migradas} migradas, ${omitidas} omitidas (de ${viejas.length} en la colección vieja)`);
  return { migradas, omitidas };
}
