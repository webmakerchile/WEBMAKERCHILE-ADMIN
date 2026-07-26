import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Torre de control de Ventas.
 *
 * Las oportunidades viven en el tablero del Hub (contratos en estado
 * "borrador" con campos de pipeline). Estas tablas guardan lo que NO puede
 * vivir en el blob: los marcadores de deduplicación de alertas que escriben
 * los jobs en segundo plano (mutar el blob desde jobs pisa ediciones humanas)
 * y la configuración global del módulo.
 */

/** Marcadores de alertas ya enviadas: una fila = un aviso emitido. */
export const salesAlerts = pgTable("sales_alerts", {
  id: serial("id").primaryKey(),
  /** "follow_up" | "renewal" */
  kind: text("kind").notNull(),
  /** id (string) del contrato/oportunidad en el blob del Hub. */
  contractRef: text("contract_ref").notNull(),
  /** Fecha que disparó el aviso (nextFollowUp o expiresAt): re-alerta solo si cambia. */
  marker: text("marker").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("sales_alerts_dedupe").on(t.kind, t.contractRef, t.marker),
]);

/** Configuración global de ventas (una sola fila, id = 1). */
export const salesSettings = pgTable("sales_settings", {
  id: integer("id").primaryKey().default(1),
  /** Días de antelación para la alerta de renovación de contratos. */
  renewalAlertDays: integer("renewal_alert_days").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SalesAlertRow = typeof salesAlerts.$inferSelect;
export type SalesSettingsRow = typeof salesSettings.$inferSelect;
