import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Espejo de solo lectura del panel autoadministrable de webmakerlatam.com.
 *
 * Cada fila es una copia fiel (jsonb) de un registro del panel, identificada
 * por (recurso, id). El panel es la única fuente de verdad: aquí NUNCA se
 * editan registros a mano — cada sync los pisa completos (upsert por id).
 * Guardar el json entero (en vez de columnas tipadas) evita que un cambio de
 * esquema del panel rompa el sync: siempre almacenamos exactamente lo que llega.
 */
export const panelEspejo = pgTable(
  "panel_espejo",
  {
    /** Nombre del recurso en el panel: "clientes", "presupuestos", … */
    recurso: text("recurso").notNull(),
    /** UUID estable que emite el panel; clave del upsert. */
    id: text("id").notNull(),
    /** El registro tal cual lo devuelve la API del panel. */
    datos: jsonb("datos").notNull().$type<Record<string, unknown>>(),
    /** updatedAt (o createdAt) del registro en el panel; ordena los listados. */
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }),
    /** Cuándo llegó esta copia al espejo. */
    sincronizadoEn: timestamp("sincronizado_en", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recurso, t.id] }),
    porRecursoFecha: index("panel_espejo_recurso_fecha_idx").on(t.recurso, t.actualizadoEn),
  })
);

/**
 * Estado del sync incremental (una sola fila, id = 1). El cursor vive en la
 * base — no en memoria — para sobrevivir reinicios y publicaciones.
 */
export const panelSyncEstado = pgTable("panel_sync_estado", {
  id: integer("id").primaryKey(),
  /** Cursor ISO que devuelven /sync/snapshot y /sync/cambios. */
  cursor: text("cursor"),
  ultimaCorrida: timestamp("ultima_corrida", { withTimezone: true }),
  ultimoExito: timestamp("ultimo_exito", { withTimezone: true }),
  ultimoError: text("ultimo_error"),
  /** Resumen de la última corrida: { tipo, porRecurso, totalRegistros, duracionMs }. */
  detalle: jsonb("detalle").notNull().$type<Record<string, unknown>>().default({}),
});
