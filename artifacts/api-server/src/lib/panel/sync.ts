import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { panelSyncEstado } from "@workspace/db/schema";
import { panelConfigurado, panelGet, type ListadoPanel } from "./cliente";
import { estadoSyncFila, guardarRegistros, RECURSOS_PANEL } from "./espejo";
import { limpiarCacheVistas } from "./cache-vistas";

/** Cada cuánto se refresca el espejo (el manifiesto sugiere 5–15 min). */
const FRESCURA_MS = 10 * 60 * 1000;

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
        porRecurso[recurso] = await guardarRegistros(recurso, datos, tx);
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
    await sincronizarPanel("auto");
  } catch (e) {
    console.error("[PanelSync] fallo:", e instanceof Error ? e.message : e);
  }
}
