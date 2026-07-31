import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Foto de cada semana de sprint al cerrarse (lunes, hora de Santiago).
 *
 * El cierre ARRASTRA las tareas pendientes a la semana nueva, así que sin esta
 * foto la historia se reescribiría: una semana con 3 pendientes aparecería
 * después como impecable. Lo que pasó en la semana queda congelado aquí y de
 * aquí sale la evolución que compara RRHH.
 *
 * Una fila por persona y semana; UNIQUE(week_key, user_id) hace el cierre
 * idempotente (reintentos y ticks dobles insertan con ON CONFLICT DO NOTHING).
 */
export const sprintWeekClosures = pgTable(
  "sprint_week_closures",
  {
    id: serial("id").primaryKey(),
    /** Clave ISO de la semana cerrada, ej. "2026-W31". */
    weekKey: text("week_key").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Tareas comprometidas a la semana al momento del cierre. */
    total: integer("total").notNull().default(0),
    /** De esas, cuántas quedaron listas. */
    done: integer("done").notNull().default(0),
    /** Pendientes que se arrastraron a la semana siguiente. */
    carried: integer("carried").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    weekUser: unique("sprint_week_closures_week_user_uq").on(t.weekKey, t.userId),
  }),
);

export type SprintWeekClosureRow = typeof sprintWeekClosures.$inferSelect;
