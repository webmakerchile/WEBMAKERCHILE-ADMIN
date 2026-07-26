import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Metas y tareas con período: lo que alguien debe cumplir hoy, esta semana o
 * este mes.
 *
 * No son las tareas del tablero (esas son trabajo de proyecto): son
 * compromisos de gestión — "3 reuniones esta semana", "publicar todos los
 * días". Por eso viven aparte y se miden por período, no por etapa.
 *
 * `periodKey` es la ventana a la que pertenece la meta, ya calculada en hora
 * local: `2026-07-28` (día), `2026-W31` (semana) o `2026-07` (mes). Guardarla
 * evita recalcular rangos en cada consulta y hace que "las metas de esta
 * semana" sea una comparación de texto exacta.
 */
export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** diaria | semanal | mensual */
    period: text("period").notNull().default("semanal"),
    /** Ventana concreta: 2026-07-28 | 2026-W31 | 2026-07 */
    periodKey: text("period_key").notNull(),
    assignedTo: integer("assigned_to")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** pendiente | cumplida | no_cumplida */
    status: text("status").notNull().default("pendiente"),
    /** Meta numérica opcional: "8 publicaciones". Null = solo cumplir/no cumplir. */
    target: integer("target"),
    progress: integer("progress").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAssignee: index("goals_assigned_period_idx").on(t.assignedTo, t.periodKey),
    byPeriod: index("goals_period_idx").on(t.period, t.periodKey),
  }),
);

export type Goal = typeof goals.$inferSelect;
