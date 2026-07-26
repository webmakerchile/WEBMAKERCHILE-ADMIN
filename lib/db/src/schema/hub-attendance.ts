import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * Sesión de jornada (asistencia): entrada/salida de un integrante.
 * `workDate` es el día local YYYY-MM-DD en America/Santiago al momento del
 * check-in; una sesión nocturna cuenta para el día en que se inició.
 * El índice único parcial garantiza a lo sumo UNA sesión abierta por usuario.
 */
export const hubWorkSessions = pgTable(
  "hub_work_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Día local YYYY-MM-DD (America/Santiago) al momento del check-in. */
    workDate: text("work_date").notNull(),
    checkIn: timestamp("check_in", { withTimezone: true }).defaultNow().notNull(),
    checkOut: timestamp("check_out", { withTimezone: true }),
    /** Autodeclaración al marcar entrada: "estoy conectado en Discord". */
    onDiscord: boolean("on_discord").notNull().default(false),
    /**
     * Verificación automática (bot) al marcar entrada: true/false = resultado
     * real en canal de voz; null = no verificable (sin bot o sin emparejar).
     */
    discordCheckin: boolean("discord_checkin"),
    /** Nº de verificaciones automáticas de voz durante la sesión. */
    discordChecks: integer("discord_checks").notNull().default(0),
    /** Verificaciones en que SÍ estaba en un canal de voz. */
    discordHits: integer("discord_hits").notNull().default(0),
    /** Última vez visto en un canal de voz durante esta sesión. */
    discordLastSeenAt: timestamp("discord_last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserDate: index("hub_work_sessions_user_date_idx").on(t.userId, t.workDate),
    byDate: index("hub_work_sessions_date_idx").on(t.workDate),
    openUniq: uniqueIndex("hub_work_sessions_open_uniq")
      .on(t.userId)
      .where(sql`${t.checkOut} IS NULL`),
  }),
);

/**
 * Checklist diario "qué hice hoy" de cada integrante. Ítems individuales por
 * día; el historial (día/semana/mes) se arma agrupando por logDate.
 */
export const hubDayLogs = pgTable(
  "hub_day_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Día local YYYY-MM-DD (America/Santiago). */
    logDate: text("log_date").notNull(),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserDate: index("hub_day_logs_user_date_idx").on(t.userId, t.logDate),
    byDate: index("hub_day_logs_date_idx").on(t.logDate),
  }),
);

export type HubWorkSessionRow = typeof hubWorkSessions.$inferSelect;
export type InsertHubWorkSession = typeof hubWorkSessions.$inferInsert;
export type HubDayLogRow = typeof hubDayLogs.$inferSelect;
export type InsertHubDayLog = typeof hubDayLogs.$inferInsert;
