import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Jornada laboral medida por presencia en Discord.
 *
 * La fuente de verdad es la sesión de voz: mientras la persona está conectada a
 * un canal de voz del servidor, la jornada corre. Nadie tiene que apretar nada,
 * que era justamente el problema — olvidarse de marcar entrada.
 *
 * `lastSeenAt` es la última vez que el sondeo la vio conectada. Al cerrar una
 * sesión se usa ESE instante y no "ahora": entre sondeo y sondeo pasa un
 * minuto, y contar tiempo que no se estuvo conectado sería medir de más.
 */
export const workSessions = pgTable(
  "work_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** discord = detectada por presencia en voz; manual = marcada a mano. */
    source: text("source").notNull().default("discord"),
    /** Canal de voz donde se detectó (solo para source=discord). */
    channelId: text("channel_id").notNull().default(""),
    channelName: text("channel_name").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null mientras la sesión sigue abierta. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Última confirmación de presencia. Marca el cierre real de la sesión. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Duración congelada al cerrar, en segundos. */
    durationSeconds: integer("duration_seconds").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserStart: index("work_sessions_user_started_idx").on(t.userId, t.startedAt),
    byOpen: index("work_sessions_ended_idx").on(t.endedAt),
  }),
);

export type WorkSession = typeof workSessions.$inferSelect;
