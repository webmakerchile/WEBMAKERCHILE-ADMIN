import { integer, jsonb, pgTable, serial, text, timestamp, index, uniqueIndex, date } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Bitácora de actividad transversal: cada mutación relevante (tareas, tickets,
 * metas, videos, contratos/proyectos del hub) deja un registro normalizado.
 * A diferencia de hub_task_activity (histórico específico de tareas), esta
 * tabla alimenta el feed "Actividad" y los resúmenes de cierre de jornada.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "task" | "ticket" | "goal" | "video" | "contract" | "project" */
    entityType: text("entity_type").notNull(),
    /** ID de la entidad en su propio dominio (número o string del hub). */
    entityId: text("entity_id").notNull(),
    /** Snapshot del título/nombre al momento de la acción (para mostrar tras renombres). */
    entityLabel: text("entity_label").notNull(),
    /** "created" | "stage_change" | "status_change" | "assigned" | "commented" | "completed" | "deleted" */
    action: text("action").notNull(),
    /** Contexto extra: { from, to, ... } — nunca texto libre sensible. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byActor: index("activity_log_actor_idx").on(t.actorId),
    byCreated: index("activity_log_created_idx").on(t.createdAt),
    byEntity: index("activity_log_entity_idx").on(t.entityType, t.entityId),
  }),
);

/**
 * Resumen persistido de la jornada de un usuario (computado desde activity_log
 * al hacer check-out). Un registro por usuario y día; si hay varios check-outs
 * en el día, se recalcula y se sobreescribe.
 */
export const activityDaySummaries = pgTable(
  "activity_day_summaries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Día local (America/Santiago) YYYY-MM-DD. */
    summaryDate: date("summary_date").notNull(),
    /** { totals: {task_completed: n, ...}, highlights: [{entityType, action, label}], minutes } */
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserDate: uniqueIndex("activity_day_summaries_user_date_idx").on(t.userId, t.summaryDate),
  }),
);

export type ActivityLogRow = typeof activityLog.$inferSelect;
export type InsertActivityLog = typeof activityLog.$inferInsert;
export type ActivityDaySummaryRow = typeof activityDaySummaries.$inferSelect;
