/**
 * Sprints semanales del tablero de tareas.
 *
 * La semana es la de siempre en la casa: clave ISO en hora de Santiago
 * ("2026-W31", lunes a domingo), la misma de metas y asistencia. Una tarea
 * queda comprometida a la semana en que sale del backlog (sprintWeek); el
 * lunes siguiente el cierre hace dos cosas, ambas idempotentes:
 *
 *   1. FOTO: guarda por persona cuántas tareas tenía la semana que terminó y
 *      cuántas quedaron listas (sprint_week_closures, ON CONFLICT DO NOTHING).
 *      Sin la foto la historia se reescribiría, porque…
 *   2. ARRASTRE: …las pendientes se mueven a la semana nueva (sprintWeek =
 *      semana actual). Las listas conservan su semana histórica.
 *
 * El orden importa: primero la foto, después el arrastre. Si el proceso se
 * cae entre medio, el próximo tick repite ambos pasos sin duplicar nada
 * (la foto ya existe → no inserta; el arrastre es un UPDATE por condición).
 */
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { hubTasks, sprintWeekClosures } from "@workspace/db/schema";
import { periodKey, isPastKey } from "./periods";

/** Clave de la semana en curso (ISO, hora de Santiago). */
export function claveSemanaActual(now: Date = new Date()): string {
  return periodKey("semanal", now);
}

export interface StatsPersona {
  userId: number;
  total: number;
  done: number;
  carried: number;
}

/**
 * Tareas de una semana → estadística por persona. Pura a propósito (es lo
 * testeable): ignora las tareas sin responsable — no hay a quién anotarle
 * el cumplimiento — pero esas igual se arrastran en el UPDATE.
 */
export function agruparPorPersona(
  filas: Array<{ assigneeId: number | null; stage: string }>,
): StatsPersona[] {
  const porPersona = new Map<number, { total: number; done: number }>();
  for (const f of filas) {
    if (f.assigneeId == null) continue;
    const acc = porPersona.get(f.assigneeId) ?? { total: 0, done: 0 };
    acc.total += 1;
    if (f.stage === "done") acc.done += 1;
    porPersona.set(f.assigneeId, acc);
  }
  return [...porPersona.entries()].map(([userId, s]) => ({
    userId,
    total: s.total,
    done: s.done,
    carried: s.total - s.done,
  }));
}

/**
 * Cierra toda semana que haya quedado atrás: foto + arrastre.
 * Devuelve cuántas semanas fotografió y cuántas tareas arrastró (para logs).
 */
export async function cerrarSemanasVencidas(
  now: Date = new Date(),
): Promise<{ semanasCerradas: number; tareasArrastradas: number }> {
  const semanaActual = claveSemanaActual(now);

  const semanasConTareas = await db
    .selectDistinct({ semana: hubTasks.sprintWeek })
    .from(hubTasks)
    .where(isNotNull(hubTasks.sprintWeek));

  const vencidas = semanasConTareas
    .map((r) => r.semana)
    .filter((s): s is string => !!s && isPastKey("semanal", s, now));

  if (vencidas.length === 0) return { semanasCerradas: 0, tareasArrastradas: 0 };

  // ¿Cuáles ya tienen foto? Basta una fila para saber que el cierre corrió;
  // el insert de la foto es un solo statement (atómico), no queda a medias.
  const yaCerradas = new Set(
    (
      await db
        .selectDistinct({ semana: sprintWeekClosures.weekKey })
        .from(sprintWeekClosures)
        .where(inArray(sprintWeekClosures.weekKey, vencidas))
    ).map((r) => r.semana),
  );

  let semanasCerradas = 0;
  for (const semana of vencidas) {
    if (yaCerradas.has(semana)) continue;
    const filas = await db
      .select({ assigneeId: hubTasks.assigneeId, stage: hubTasks.stage })
      .from(hubTasks)
      .where(eq(hubTasks.sprintWeek, semana));
    const stats = agruparPorPersona(filas);
    if (stats.length > 0) {
      await db
        .insert(sprintWeekClosures)
        .values(stats.map((s) => ({ weekKey: semana, ...s })))
        .onConflictDoNothing();
    }
    semanasCerradas += 1;
  }

  // Arrastre: SIEMPRE después de las fotos y para TODAS las semanas vencidas,
  // incluso las ya fotografiadas — así un cierre interrumpido se completa solo.
  const arrastradas = await db
    .update(hubTasks)
    .set({ sprintWeek: semanaActual, updatedAt: now })
    .where(
      and(
        isNotNull(hubTasks.sprintWeek),
        inArray(hubTasks.sprintWeek, vencidas),
        ne(hubTasks.stage, "done"),
      ),
    )
    .returning({ id: hubTasks.id });

  return { semanasCerradas, tareasArrastradas: arrastradas.length };
}

let ultimoCierre = 0;

/** Para el scheduler: se auto-limita a una revisión cada 10 minutos. */
export async function checkCierreSemanal(): Promise<void> {
  if (Date.now() - ultimoCierre < 10 * 60 * 1000) return;
  ultimoCierre = Date.now();
  const r = await cerrarSemanasVencidas();
  if (r.semanasCerradas > 0 || r.tareasArrastradas > 0) {
    console.log(
      `[SprintSemanal] Semanas cerradas: ${r.semanasCerradas}, tareas arrastradas: ${r.tareasArrastradas}`,
    );
  }
}

/** Solo para tests: resetea el debounce del scheduler. */
export function __resetCierreSemanal(): void {
  ultimoCierre = 0;
}
