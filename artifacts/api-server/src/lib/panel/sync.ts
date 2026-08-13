import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { panelEspejo, panelSyncEstado } from "@workspace/db/schema";
import { panelConfigurado, panelGet, type ListadoPanel } from "./cliente";
import { estadoSyncFila, guardarRegistros, RECURSOS_PANEL } from "./espejo";
import { retirarCompartidosDeTerminados } from "./equipo";
import { limpiarCacheVistas } from "./cache-vistas";
import { sincronizarProyectosWmcAlHub, sincronizarTareasWmcAlScrum } from "./hub-sync";

/** Cada cuánto se refresca el espejo (el manifiesto sugiere 5–15 min). */
const FRESCURA_MS = 10 * 60 * 1000;

/**
 * Cada cuánto se corre la reconciliación completa (independiente del sync
 * normal). El manifiesto es explícito: "el panel casi no borra registros...
 * si necesitás detectar bajas, comparé el universo de ids en cada snapshot
 * completo" — el sync por cursor (arriba) nunca borra, así que esto es lo
 * único que detecta bajas del origen y además autocura cualquier campo que
 * el delta nunca vuelva a traer (p. ej. `tareas` sincroniza por createdAt:
 * si una tarea cambia de estado sin tocar createdAt, el delta jamás la
 * vuelve a traer y queda pegada en el estado con el que se creó).
 */
const RECONCILIACION_MS = 24 * 60 * 60 * 1000;

interface BloqueRecurso {
  total: number;
  devueltos: number;
  truncado: boolean;
  campoFechaSync: string;
  datos: Array<Record<string, unknown>>;
}

interface RespuestaSync {
  ok: boolean;
  tipo: "snapshot" | "delta" | string;
  cursor: string;
  desde: string | null;
  totalRegistros: number;
  recursosTruncados?: string[];
  recursos: Record<string, BloqueRecurso>;
}

export interface ResultadoSync {
  aplicado: boolean;
  motivo?: string;
  tipo?: string;
  totalRegistros?: number;
  porRecurso?: Record<string, number>;
  cursor?: string | null;
  duracionMs?: number;
}

/**
 * Sincroniza el espejo local con el panel de webmakerlatam.com.
 *
 * Patrón anti-carrera (producción corre en autoscale, puede haber varias
 * instancias): las llamadas HTTP van FUERA de la transacción; adentro se toma
 * un advisory lock, se re-chequea que el cursor no lo haya movido otra
 * instancia mientras bajábamos datos, y recién ahí se aplican los upserts y
 * el cursor nuevo — todo o nada. Si otra instancia ganó, se descarta en paz.
 */
export async function sincronizarPanel(modo: "auto" | "manual"): Promise<ResultadoSync> {
  const inicio = Date.now();
  const estado = await estadoSyncFila();
  if (modo === "auto" && estado.ultimaCorrida && Date.now() - estado.ultimaCorrida.getTime() < FRESCURA_MS) {
    return { aplicado: false, motivo: "fresco" };
  }
  const cursorPrevio = estado.cursor;

  try {
    // 1) HTTP fuera de la transacción. Sin cursor → snapshot completo.
    const respuesta = cursorPrevio
      ? await panelGet<RespuestaSync>("/sync/cambios", { params: { desde: cursorPrevio }, timeoutMs: 60_000 })
      : await panelGet<RespuestaSync>("/sync/snapshot", { params: { limitePorRecurso: 1000 }, timeoutMs: 90_000 });

    // 2) Recursos truncados: completar con el listado paginado (mismo corte).
    const extras: Record<string, Array<Record<string, unknown>>> = {};
    for (const recurso of respuesta.recursosTruncados ?? []) {
      if (!(RECURSOS_PANEL as readonly string[]).includes(recurso)) continue;
      let offset = respuesta.recursos[recurso]?.devueltos ?? 0;
      for (let pagina = 0; pagina < 50; pagina++) {
        const lote = await panelGet<ListadoPanel>(`/${recurso}`, {
          params: { limite: 1000, offset, ...(cursorPrevio ? { desde: cursorPrevio } : {}) },
          timeoutMs: 60_000,
        });
        (extras[recurso] ??= []).push(...lote.datos);
        if (!lote.paginacion?.hayMas || lote.datos.length === 0) break;
        offset += lote.datos.length;
      }
    }

    // 3) Aplicar en una transacción con lock + re-chequeo del cursor.
    let datosProyectosAplicados: Array<Record<string, unknown>> | null = null;
    const resultado = await db.transaction(async (tx): Promise<ResultadoSync> => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('panel-sync'))`);
      const fila = await estadoSyncFila(tx);
      if ((fila.cursor ?? null) !== (cursorPrevio ?? null)) {
        return { aplicado: false, motivo: "otra_instancia" };
      }

      const porRecurso: Record<string, number> = {};
      for (const [recurso, bloque] of Object.entries(respuesta.recursos ?? {})) {
        const datos = [...(bloque?.datos ?? []), ...(extras[recurso] ?? [])];
        if (!datos.length) continue;
        if (recurso === "proyectos") {
          // Antes de pisar la copia: si un proyecto PASÓ a terminado, retirar
          // su compartido puntual (deja de verse para el equipo al terminar).
          await retirarCompartidosDeTerminados(datos, tx);
        }
        porRecurso[recurso] = await guardarRegistros(recurso, datos, tx);
        if (recurso === "proyectos") datosProyectosAplicados = datos;
      }

      const ahora = new Date();
      const duracionMs = Date.now() - inicio;
      await tx
        .update(panelSyncEstado)
        .set({
          cursor: respuesta.cursor ?? cursorPrevio,
          ultimaCorrida: ahora,
          ultimoExito: ahora,
          ultimoError: null,
          detalle: { tipo: respuesta.tipo, porRecurso, totalRegistros: respuesta.totalRegistros, duracionMs },
        })
        .where(eq(panelSyncEstado.id, 1));

      return {
        aplicado: true,
        tipo: respuesta.tipo,
        totalRegistros: respuesta.totalRegistros,
        porRecurso,
        cursor: respuesta.cursor,
        duracionMs,
      };
    });

    if (resultado.aplicado) {
      // Sync exitoso (programado o manual): las vistas en vivo cacheadas
      // pueden haber quedado viejas — se botan al tiro.
      limpiarCacheVistas();
      console.log(`[PanelSync] ${resultado.tipo}: ${resultado.totalRegistros} registros en ${resultado.duracionMs}ms`);
      // Puente al Kanban del Hub (Scrum/Ban), DESPUÉS de confirmar la
      // transacción del espejo (no adentro): un fallo acá jamás debe poder
      // revertir ni bloquear el sync del espejo, que es lo crítico. Si algo
      // sale mal se loguea y se reintenta solo en el próximo sync/reconciliación.
      // Puente tareas wmc -> Scrum del Hub (idempotente; lee el espejo ya confirmado).
      try {
        const puenteTareas = await sincronizarTareasWmcAlScrum();
        if (puenteTareas.creadas || puenteTareas.completadas || puenteTareas.notas) {
          console.log(
            `[PanelSync->Scrum] ${puenteTareas.creadas} tarea(s) sembrada(s), ${puenteTareas.completadas} completada(s), ${puenteTareas.notas} nota(s) de proyecto actualizada(s)`,
          );
        }
      } catch (e) {
        console.error("[PanelSync->Scrum] fallo (no afecta el sync del espejo):", e instanceof Error ? e.message : e);
      }
      if (datosProyectosAplicados) {
        try {
          const { creados, movidos } = await sincronizarProyectosWmcAlHub(datosProyectosAplicados);
          if (creados || movidos) {
            console.log(`[PanelSync→Hub] ${creados} tarjeta(s) nueva(s), ${movidos} movida(s) de fase`);
          }
        } catch (e) {
          console.error("[PanelSync→Hub] fallo (no afecta el sync del espejo):", e instanceof Error ? e.message : e);
        }
      }
    }
    return resultado;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    try {
      await db
        .update(panelSyncEstado)
        .set({ ultimaCorrida: new Date(), ultimoError: mensaje })
        .where(eq(panelSyncEstado.id, 1));
    } catch {
      // El error original es el que importa.
    }
    throw e;
  }
}

let ultimoIntentoAuto = 0;

/** Lo llama el scheduler cada 60 s; corre de verdad cada FRESCURA_MS. */
export async function checkPanelSync(): Promise<void> {
  if (!panelConfigurado()) return;
  if (Date.now() - ultimoIntentoAuto < FRESCURA_MS) return;
  ultimoIntentoAuto = Date.now();
  try {
    const estado = await estadoSyncFila();
    const tocaReconciliar =
      !estado.ultimaReconciliacion || Date.now() - estado.ultimaReconciliacion.getTime() >= RECONCILIACION_MS;
    if (tocaReconciliar) {
      await reconciliarPanel();
    } else {
      await sincronizarPanel("auto");
    }
  } catch (e) {
    console.error("[PanelSync] fallo:", e instanceof Error ? e.message : e);
  }
}

/** Trae el universo COMPLETO y actual de todos los recursos, ignorando el cursor guardado (sin tocar la DB). */
async function traerSnapshotCompleto(): Promise<{ cursor: string; porRecurso: Record<string, Array<Record<string, unknown>>> }> {
  const respuesta = await panelGet<RespuestaSync>("/sync/snapshot", {
    params: { limitePorRecurso: 1000 },
    timeoutMs: 90_000,
  });

  const porRecurso: Record<string, Array<Record<string, unknown>>> = {};
  for (const [recurso, bloque] of Object.entries(respuesta.recursos ?? {})) {
    porRecurso[recurso] = [...(bloque?.datos ?? [])];
  }
  for (const recurso of respuesta.recursosTruncados ?? []) {
    if (!(RECURSOS_PANEL as readonly string[]).includes(recurso)) continue;
    const acumulado = (porRecurso[recurso] ??= []);
    let offset = respuesta.recursos[recurso]?.devueltos ?? acumulado.length;
    for (let pagina = 0; pagina < 50; pagina++) {
      const lote = await panelGet<ListadoPanel>(`/${recurso}`, { params: { limite: 1000, offset }, timeoutMs: 60_000 });
      acumulado.push(...lote.datos);
      if (!lote.paginacion?.hayMas || lote.datos.length === 0) break;
      offset += lote.datos.length;
    }
  }
  return { cursor: respuesta.cursor, porRecurso };
}

export interface ResultadoReconciliacion {
  aplicado: boolean;
  motivo?: string;
  porRecursoActualizados?: Record<string, number>;
  porRecursoPodados?: Record<string, number>;
  omitidos?: string[];
  duracionMs?: number;
}

/**
 * Reconciliación completa (además del sync incremental por cursor de
 * arriba, que solo aplica altas/cambios y NUNCA borra):
 *
 *  1) Trae el listado COMPLETO y actual de cada recurso (no un delta).
 *  2) Pisa el espejo con esos datos frescos — autocura cualquier registro
 *     que el delta nunca vuelva a traer (ver comentario de RECONCILIACION_MS).
 *  3) Poda del espejo los ids de ese recurso que ya NO vinieron en el
 *     listado fresco: son bajas del origen que el cursor nunca detecta.
 *
 * Igual patrón anti-carrera que sincronizarPanel: HTTP fuera de la
 * transacción, adentro advisory lock + re-chequeo del cursor.
 *
 * Salvaguarda: si el listado fresco de un recurso viene vacío, se salta la
 * poda de ESE recurso (se loguea) en vez de borrar todo lo local — el
 * manifiesto es explícito en que el panel casi nunca vacía un recurso de
 * verdad, así que una lista vacía es más probable un respuesta rara que una
 * purga real.
 */
export async function reconciliarPanel(): Promise<ResultadoReconciliacion> {
  const inicio = Date.now();
  const estado = await estadoSyncFila();
  const cursorPrevio = estado.cursor;

  try {
    const snapshot = await traerSnapshotCompleto();

    let datosProyectosAplicados: Array<Record<string, unknown>> | null = null;
    const resultado = await db.transaction(async (tx): Promise<ResultadoReconciliacion> => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('panel-sync'))`);
      const fila = await estadoSyncFila(tx);
      if ((fila.cursor ?? null) !== (cursorPrevio ?? null)) {
        return { aplicado: false, motivo: "otra_instancia" };
      }

      const porRecursoActualizados: Record<string, number> = {};
      const porRecursoPodados: Record<string, number> = {};
      const omitidos: string[] = [];

      for (const [recurso, datos] of Object.entries(snapshot.porRecurso)) {
        if (recurso === "proyectos") {
          await retirarCompartidosDeTerminados(datos, tx);
        }
        porRecursoActualizados[recurso] = await guardarRegistros(recurso, datos, tx);
        if (recurso === "proyectos") datosProyectosAplicados = datos;

        const idsFrescos = datos
          .filter((r): r is Record<string, unknown> & { id: string } => typeof r?.id === "string" && r.id.length > 0)
          .map((r) => r.id);

        if (idsFrescos.length === 0) {
          omitidos.push(recurso);
          continue;
        }

        const podados = await tx
          .delete(panelEspejo)
          .where(and(eq(panelEspejo.recurso, recurso), notInArray(panelEspejo.id, idsFrescos)))
          .returning({ id: panelEspejo.id });
        if (podados.length) porRecursoPodados[recurso] = podados.length;
      }

      const ahora = new Date();
      const duracionMs = Date.now() - inicio;
      await tx
        .update(panelSyncEstado)
        .set({
          cursor: snapshot.cursor ?? cursorPrevio,
          ultimaCorrida: ahora,
          ultimoExito: ahora,
          ultimoError: null,
          ultimaReconciliacion: ahora,
          detalle: { tipo: "reconciliacion", porRecursoActualizados, porRecursoPodados, omitidos, duracionMs },
        })
        .where(eq(panelSyncEstado.id, 1));

      return { aplicado: true, porRecursoActualizados, porRecursoPodados, omitidos, duracionMs };
    });

    if (resultado.aplicado) {
      limpiarCacheVistas();
      const totalPodados = Object.values(resultado.porRecursoPodados ?? {}).reduce((a, b) => a + b, 0);
      console.log(
        `[PanelReconciliacion] ok: podados ${totalPodados} en ${resultado.duracionMs}ms — ${JSON.stringify(resultado.porRecursoPodados)}`
      );
      if (resultado.omitidos?.length) {
        console.warn(`[PanelReconciliacion] poda salteada (universo vacío) en: ${resultado.omitidos.join(", ")}`);
      }
      // Puente al Kanban del Hub, después de confirmar la transacción (ver
      // el mismo comentario en sincronizarPanel): nunca debe poder afectar
      // la reconciliación del espejo, que es lo crítico.
      // Puente tareas wmc -> Scrum del Hub (idempotente; lee el espejo ya confirmado).
      try {
        const puenteTareas = await sincronizarTareasWmcAlScrum();
        if (puenteTareas.creadas || puenteTareas.completadas || puenteTareas.notas) {
          console.log(
            `[PanelSync->Scrum] ${puenteTareas.creadas} tarea(s) sembrada(s), ${puenteTareas.completadas} completada(s), ${puenteTareas.notas} nota(s) de proyecto actualizada(s)`,
          );
        }
      } catch (e) {
        console.error("[PanelSync->Scrum] fallo (no afecta el sync del espejo):", e instanceof Error ? e.message : e);
      }
      if (datosProyectosAplicados) {
        try {
          const { creados, movidos } = await sincronizarProyectosWmcAlHub(datosProyectosAplicados);
          if (creados || movidos) {
            console.log(`[PanelReconciliacion→Hub] ${creados} tarjeta(s) nueva(s), ${movidos} movida(s) de fase`);
          }
        } catch (e) {
          console.error("[PanelReconciliacion→Hub] fallo (no afecta la reconciliación del espejo):", e instanceof Error ? e.message : e);
        }
      }
    }
    return resultado;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    try {
      await db.update(panelSyncEstado).set({ ultimaCorrida: new Date(), ultimoError: mensaje }).where(eq(panelSyncEstado.id, 1));
    } catch {
      // El error original es el que importa.
    }
    throw e;
  }
}
