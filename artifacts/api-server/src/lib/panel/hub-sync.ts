import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { hubState, hubTasks, panelEspejo, type HubStateRow } from "@workspace/db/schema";
import { findBoardOwner } from "../hub-board";

/**
 * Puente Proyectos (WMC) → tablero del Hub, subsección Kanban de "Scrum/Ban".
 *
 * El Hub tiene su PROPIO tablero de proyectos (`hub_state.data.projects`,
 * columnas `STATUS` en `pages/hub/shared.tsx`) — un concepto distinto y
 * anterior al espejo de wmc (`panel_espejo`, recurso "proyectos"). Este
 * módulo NO fusiona los dos modelos: crea/actualiza, del lado del Hub, una
 * tarjeta "espejo" por cada proyecto wmc (marcada con `wmcId`), ubicada en
 * la columna que corresponde a su etapa actual. Las tarjetas sin `wmcId`
 * (proyectos propios del Hub, sin relación con wmc) nunca se tocan.
 *
 * Se llama desde `sync.ts` (delta, reconciliación y el respaldo de arranque)
 * justo después de `guardarRegistros("proyectos", ...)`, dentro de la MISMA
 * transacción cuando la hay: si el cursor rebota a otra instancia, esta
 * escritura tampoco se aplica.
 */

/** La transacción de drizzle o la conexión normal: mismos métodos. */
type Ejecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Etapa wmc (`Project.status`, ver `shared-wmc/schema.ts`) → columna del
 * Kanban del Hub (`STATUS` en `pages/hub/shared.tsx`). Los labels de ambos
 * lados ya coinciden en significado: MOCKUP="Diseño"↔design,
 * DEVELOPMENT="Desarrollo"↔dev, QA="Testing"↔testing, DELIVERY="Entrega"↔done.
 * COMPLETED no tiene columna propia en el Hub (no hay etapa después de
 * "Entrega"): se deja también en "done", que ya es la última columna.
 * Una etapa que no esté en este mapa (dato nuevo del origen, todavía sin
 * clasificar acá) se omite a propósito — mejor no ubicar la tarjeta que
 * ubicarla a ciegas en una columna que no le corresponde.
 */
const WMC_STATUS_A_ETAPA_HUB: Record<string, string> = {
  MOCKUP: "design",
  DEVELOPMENT: "dev",
  QA: "testing",
  DELIVERY: "done",
  COMPLETED: "done",
};

interface ProyectoWmc {
  id: string;
  name?: unknown;
  clientId?: unknown;
  status?: unknown;
  driveFolderUrl?: unknown;
}

function esProyectoWmcValido(
  r: Record<string, unknown>,
): r is ProyectoWmc & Record<string, unknown> {
  return typeof r?.id === "string" && r.id.length > 0;
}

/**
 * Sincroniza los proyectos wmc entregados con el tablero del Hub. Devuelve
 * cuántas tarjetas creó y cuántas movió de columna (para logging).
 */
export async function sincronizarProyectosWmcAlHub(
  proyectos: Array<Record<string, unknown>>,
  tx: Ejecutor = db,
): Promise<{ creados: number; movidos: number }> {
  // Filtra temprano por etapa conocida: evita tocar la base entera (dueño,
  // tablero, espejo de clientes) cuando este lote no trae ningún proyecto
  // que en verdad vaya a ubicarse en el Kanban (p. ej. un delta que solo
  // trajo proyectos con una etapa que este puente todavía no clasifica).
  const validos = proyectos
    .filter(esProyectoWmcValido)
    .filter((p) => WMC_STATUS_A_ETAPA_HUB[String(p.status ?? "")]);
  if (validos.length === 0) return { creados: 0, movidos: 0 };

  const owner = await findBoardOwner();
  if (!owner) return { creados: 0, movidos: 0 };

  const [fila] = await tx
    .select()
    .from(hubState)
    .where(eq(hubState.userId, owner.id))
    .limit(1);
  const dataActual = (fila?.data ?? {}) as Record<string, unknown>;
  const actuales: Array<Record<string, unknown>> = Array.isArray(
    dataActual.projects,
  )
    ? (dataActual.projects as Array<Record<string, unknown>>)
    : [];
  const porWmcId = new Map(
    actuales
      .filter((p) => typeof p.wmcId === "string")
      .map((p) => [String(p.wmcId), p]),
  );

  // Nombre de cliente, para que la tarjeta no quede con "client" vacío.
  // Se lee del propio espejo local (recurso "clientes"), ya sincronizado
  // aparte — sin llamar de nuevo al origen.
  const idsCliente = [
    ...new Set(validos.map((p) => String(p.clientId ?? "")).filter(Boolean)),
  ];
  const nombreClientePorId = new Map<string, string>();
  if (idsCliente.length > 0) {
    const filasCliente = await tx
      .select({ id: panelEspejo.id, datos: panelEspejo.datos })
      .from(panelEspejo)
      .where(eq(panelEspejo.recurso, "clientes"));
    for (const f of filasCliente) {
      const nombre = (f.datos as Record<string, unknown> | null)?.companyName;
      if (typeof nombre === "string" && nombre)
        nombreClientePorId.set(f.id, nombre);
    }
  }

  const nuevas: Array<Record<string, unknown>> = [];
  const cambios: Array<{ wmcId: string; etapa: string; wmcStatus: string }> =
    [];
  const ahora = Date.now();

  for (const p of validos) {
    const etapa = WMC_STATUS_A_ETAPA_HUB[String(p.status ?? "")];
    if (!etapa) continue;
    const existente = porWmcId.get(p.id);
    if (!existente) {
      nuevas.push({
        id: `wmc:${p.id}`,
        wmcId: p.id,
        wmcStatus: String(p.status ?? ""),
        name: String(p.name ?? "Proyecto sin nombre").slice(0, 200),
        client: nombreClientePorId.get(String(p.clientId ?? "")) ?? "",
        type: "",
        prio: "media",
        status: etapa,
        owner: "",
        prog: 0,
        notes: "Sincronizado automáticamente desde Proyectos (WMC).",
        // Solo Drive: `link` alimenta el chip "Drive" de la tarjeta (ver
        // small-components.tsx), no un link genérico — un repositorio ahí
        // saldría rotulado como carpeta de Drive por error.
        link: String(p.driveFolderUrl ?? ""),
        createdAt: ahora,
        updatedAt: ahora,
        stageSince: ahora,
        stageTime: {},
      });
    } else if (String(existente.wmcStatus ?? "") !== String(p.status ?? "")) {
      cambios.push({ wmcId: p.id, etapa, wmcStatus: String(p.status ?? "") });
    }
  }

  if (nuevas.length > 0) {
    // Upsert atómico: agrega las tarjetas nuevas al array `projects` sin
    // leer-modificar-escribir el blob completo (no pisa cambios concurrentes
    // de otras colecciones ni de otras tarjetas). Crea la fila si el dueño
    // del tablero todavía no tiene una (primer arranque).
    await tx.execute(sql`
      INSERT INTO hub_state (user_id, data, updated_at)
      VALUES (${owner.id}, jsonb_build_object('projects', ${JSON.stringify(nuevas)}::jsonb), now())
      ON CONFLICT (user_id) DO UPDATE SET
        data = jsonb_set(
          COALESCE(hub_state.data, '{}'::jsonb),
          '{projects}',
          COALESCE(hub_state.data->'projects', '[]'::jsonb) || ${JSON.stringify(nuevas)}::jsonb
        ),
        updated_at = now()
    `);
  }

  for (const c of cambios) {
    // Actualización atómica de UN elemento del array por `wmcId`: recalcula
    // solo esa tarjeta (columna + marca de etapa wmc), sin tocar el resto del
    // blob — mismo criterio de atomicidad que la inserción de arriba.
    await tx.execute(sql`
      UPDATE hub_state
      SET data = jsonb_set(
        data,
        '{projects}',
        COALESCE((
          SELECT jsonb_agg(
            CASE WHEN elem->>'wmcId' = ${c.wmcId}
              THEN elem || jsonb_build_object(
                'status', ${c.etapa}::text,
                'wmcStatus', ${c.wmcStatus}::text,
                'stageSince', ${ahora}::bigint,
                'updatedAt', ${ahora}::bigint
              )
              ELSE elem
            END
          )
          FROM jsonb_array_elements(COALESCE(data->'projects', '[]'::jsonb)) elem
        ), '[]'::jsonb)
      ),
      updated_at = now()
      WHERE user_id = ${owner.id}
    `);
  }

  return { creados: nuevas.length, movidos: cambios.length };
}

/**
 * Respaldo de arranque: sincroniza contra TODO lo que el espejo local ya
 * tenga guardado de "proyectos" (sin llamar al origen). Cubre dos casos que
 * el sync incremental por delta no resuelve solo:
 *  1) Proyectos wmc que ya existían ANTES de que este puente existiera —
 *     sin esto, quedarían sin tarjeta hasta la próxima reconciliación diaria.
 *  2) Un reinicio del servidor en medio de una corrida: se vuelve a intentar
 *     sin duplicar nada (`sincronizarProyectosWmcAlHub` es idempotente por
 *     `wmcId`).
 */
export async function respaldarProyectosWmcAlHubDesdeEspejo(): Promise<void> {
  const filas = await db
    .select({ datos: panelEspejo.datos })
    .from(panelEspejo)
    .where(eq(panelEspejo.recurso, "proyectos"));
  if (filas.length === 0) return;
  const { creados, movidos } = await sincronizarProyectosWmcAlHub(
    filas.map((f) => f.datos),
  );
  if (creados || movidos) {
    console.log(
      `[PanelSync→Hub] respaldo de arranque: ${creados} tarjeta(s) nueva(s), ${movidos} movida(s) de fase`,
    );
  }
  try {
    const puente = await sincronizarTareasWmcAlScrum();
    if (puente.creadas || puente.completadas || puente.revinculadas || puente.notas) {
      console.log(
        `[PanelSync->Scrum] respaldo: ${puente.creadas} tarea(s) sembrada(s), ${puente.completadas} completada(s), ${puente.revinculadas} revinculada(s), ${puente.notas} nota(s) de proyecto actualizada(s)`,
      );
    }
  } catch (e) {
    console.error("[PanelSync->Scrum] respaldo fallo:", e instanceof Error ? e.message : e);
  }
}

/**
 * Puente tareas wmc -> tablero Scrum/Ban del Hub (hub_tasks).
 *
 * - Siembra cada tarea wmc como tarjeta en Backlog una sola vez (marca
 *   origin = "wmc:<id>"); despues el equipo la mueve con total libertad.
 * - Si la tarea se completa en wmc, la tarjeta pasa a "done" (nunca se
 *   revierte en el otro sentido una columna movida por el equipo).
 * - Rellena las notas de la tarjeta de proyecto del Kanban con los alcances
 *   (tareas por fase) mientras la nota siga siendo la del sync automatico.
 */
const FASES_WMC = ["MOCKUP", "DEVELOPMENT", "QA", "DELIVERY", "COMPLETED"] as const;
const FASE_LABEL: Record<string, string> = {
  MOCKUP: "Diseño",
  DEVELOPMENT: "Desarrollo",
  QA: "Testing",
  DELIVERY: "Entrega",
  COMPLETED: "Completado",
};
const NOTA_PLACEHOLDER = "Sincronizado automáticamente desde Proyectos (WMC).";

function esTareaWmcValida(r: Record<string, unknown>): r is { id: string } & Record<string, unknown> {
  return typeof r?.id === "string" && r.id.length > 0;
}

export async function sincronizarTareasWmcAlScrum(): Promise<{
  creadas: number;
  completadas: number;
  revinculadas: number;
  notas: number;
}> {
  const nada = { creadas: 0, completadas: 0, revinculadas: 0, notas: 0 };
  const owner = await findBoardOwner();
  if (!owner) return nada;

  const filas = await db
    .select({ datos: panelEspejo.datos })
    .from(panelEspejo)
    .where(eq(panelEspejo.recurso, "tareas"));
  if (filas.length === 0) return nada;
  const tareas = filas
    .map((f) => f.datos as Record<string, unknown>)
    .filter(esTareaWmcValida);
  if (tareas.length === 0) return nada;

  const existentes = await db
    .select({
      id: hubTasks.id,
      stage: hubTasks.stage,
      origin: hubTasks.origin,
      projectRef: hubTasks.projectRef,
    })
    .from(hubTasks)
    .where(sql`${hubTasks.origin} LIKE 'wmc:%'`);
  const porOrigin = new Map(existentes.map((t) => [String(t.origin), t]));

  // Las tarjetas del Kanban tienen id propio; `projectRef` tiene que apuntar a
  // ese id (no al uuid de wmc) para que la tarea se vincule al proyecto en la UI.
  const [estado] = await db
    .select({ datos: hubState.data })
    .from(hubState)
    .where(eq(hubState.userId, owner.id))
    .limit(1);
  const tarjetasProyecto = Array.isArray((estado?.datos as Record<string, unknown> | undefined)?.projects)
    ? (((estado!.datos as Record<string, unknown>).projects) as Record<string, unknown>[])
    : [];
  const refPorWmcId = new Map<string, string>();
  for (const tarjeta of tarjetasProyecto) {
    const wmcId = tarjeta?.wmcId != null ? String(tarjeta.wmcId) : "";
    const id = tarjeta?.id != null ? String(tarjeta.id) : "";
    if (wmcId && id) refPorWmcId.set(wmcId, id);
  }

  let creadas = 0;
  let completadas = 0;
  let revinculadas = 0;
  const ahora = new Date();
  for (const t of tareas) {
    const origin = `wmc:${t.id}`;
    const completadaEnWmc = String(t.status ?? "") === "completed";
    const previa = porOrigin.get(origin);
    if (!previa) {
      const fase = FASE_LABEL[String(t.phase ?? "")] ?? "";
      const desc = typeof t.description === "string" ? t.description.trim() : "";
      const notas = [fase ? `Fase: ${fase}` : "", desc].filter(Boolean).join("\n");
      const idProyecto = t.projectId != null ? String(t.projectId) : "";
      await db.insert(hubTasks).values({
        title: String(t.title ?? "Tarea wmc").slice(0, 300),
        notes: notas || null,
        createdById: owner.id,
        projectRef: refPorWmcId.get(idProyecto) ?? null,
        stage: completadaEnWmc ? "done" : "backlog",
        origin,
        completedAt: completadaEnWmc ? ahora : null,
      });
      creadas += 1;
    } else {
      // Reparar el vinculo al proyecto si quedo apuntando al uuid de wmc o si la
      // tarjeta del Kanban aparecio despues de haber sembrado la tarea.
      const idProyecto = t.projectId != null ? String(t.projectId) : "";
      const refCorrecta = refPorWmcId.get(idProyecto) ?? null;
      if (refCorrecta && previa.projectRef !== refCorrecta) {
        await db
          .update(hubTasks)
          .set({ projectRef: refCorrecta, updatedAt: ahora })
          .where(eq(hubTasks.id, previa.id));
        revinculadas += 1;
      }
    }
    if (previa && completadaEnWmc && previa.stage !== "done") {
      await db
        .update(hubTasks)
        .set({ stage: "done", stageSince: ahora, completedAt: ahora, updatedAt: ahora })
        .where(eq(hubTasks.id, previa.id));
      completadas += 1;
    }
  }

  // Alcances en la tarjeta de proyecto del Kanban. Se arma el resumen por
  // proyecto y se escribe dentro de una transaccion con FOR UPDATE, para no
  // pisar lo que el equipo mueva en paralelo.
  const porProyecto = new Map<string, Record<string, unknown>[]>();
  for (const t of tareas) {
    const pid = t.projectId != null ? String(t.projectId) : "";
    if (!pid) continue;
    const lista = porProyecto.get(pid) ?? [];
    lista.push(t);
    porProyecto.set(pid, lista);
  }

  const notasPorProyecto = new Map<string, string>();
  for (const [pid, lista] of porProyecto) {
    const lineas: string[] = [];
    for (const fase of FASES_WMC) {
      const deFase = lista.filter((t) => String(t.phase ?? "") === fase);
      if (deFase.length === 0) continue;
      lineas.push(`${FASE_LABEL[fase]}:`);
      for (const t of deFase) {
        const marca = String(t.status ?? "") === "completed" ? "[x]" : "[ ]";
        lineas.push(`${marca} ${String(t.title ?? "")}`);
      }
    }
    if (lineas.length > 0) {
      notasPorProyecto.set(pid, `Alcances (WMC):\n${lineas.join("\n")}`);
    }
  }

  let notasActualizadas = 0;
  if (notasPorProyecto.size > 0) {
    await db.transaction(async (tx) => {
      notasActualizadas = 0;
      const [fila] = await tx
        .select({ datos: hubState.data })
        .from(hubState)
        .where(eq(hubState.userId, owner.id))
        .for("update")
        .limit(1);
      if (!fila) return;
      const datos = (fila.datos ?? {}) as Record<string, unknown>;
      const proyectos = Array.isArray(datos.projects)
        ? (datos.projects as Record<string, unknown>[])
        : [];
      if (proyectos.length === 0) return;
      const ahoraMs = Date.now();
      const nuevos = proyectos.map((p) => {
        const wmcId = p?.wmcId != null ? String(p.wmcId) : "";
        const nota = notasPorProyecto.get(wmcId);
        if (!nota) return p;
        const actual = typeof p.notes === "string" ? p.notes : "";
        if (actual === nota) return p;
        // Nunca pisamos una nota escrita a mano.
        const esNuestra =
          actual === "" ||
          actual === NOTA_PLACEHOLDER ||
          actual.startsWith("Alcances (WMC):");
        if (!esNuestra) return p;
        notasActualizadas += 1;
        return { ...p, notes: nota, updatedAt: ahoraMs };
      });
      if (notasActualizadas === 0) return;
      await tx
        .update(hubState)
        .set({
          data: { ...datos, projects: nuevos } as HubStateRow["data"],
          updatedAt: new Date(),
        })
        .where(eq(hubState.userId, owner.id));
    });
  }

  return { creadas, completadas, revinculadas, notas: notasActualizadas };
}
