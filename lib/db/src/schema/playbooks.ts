import { boolean, index, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Tarea estándar de un playbook (plantilla de proceso por tipo de trabajo). */
export type PlaybookTask = {
  title: string;
  notes?: string;
  /** crítica | alta | media | baja */
  priority?: string;
};

export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Tipo de trabajo al que aplica: "Sitio Web", "Campaña", "Video", … */
  workType: text("work_type").notNull().default(""),
  description: text("description").notNull().default(""),
  tasks: jsonb("tasks").$type<PlaybookTask[]>().notNull().default([]),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Registro de handoffs ejecutados. La restricción única (kind, entityId) es la
 * garantía de idempotencia: si una etapa "rebota" (activo → borrador → activo),
 * el handoff no se ejecuta dos veces.
 */
export const handoffLog = pgTable(
  "handoff_log",
  {
    id: serial("id").primaryKey(),
    /** venta_cerrada | video_aprobado | proyecto_entregado */
    kind: text("kind").notNull(),
    entityId: text("entity_id").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    onePerEntity: uniqueIndex("handoff_log_kind_entity_uq").on(t.kind, t.entityId),
    byCreated: index("handoff_log_created_idx").on(t.createdAt),
  }),
);

export type Playbook = typeof playbooks.$inferSelect;
export type InsertPlaybook = typeof playbooks.$inferInsert;
export type HandoffLogRow = typeof handoffLog.$inferSelect;
