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
    /** true = la abrió el bot al detectar al usuario en el canal de voz. */
    autoStarted: boolean("auto_started").notNull().default(false),
    /**
     * Quién cerró la jornada, cuando NO fue la propia persona.
     *
     * Null es "la cerró quien la trabajó". Una jornada que cerró RRHH porque
     * quedó encendida no es lo mismo que una que cerró su dueño, y en un
     * registro de horas esa diferencia se tiene que poder auditar.
     */
    closedBy: integer("closed_by").references(() => users.id, { onDelete: "set null" }),
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

/**
 * Pausas dentro de una jornada: baño, almuerzo, un imprevisto.
 *
 * Existen porque la jornada corría de corrido entre la entrada y la salida, y
 * ese tiempo NO es tiempo trabajado. Se guardan como filas propias en vez de
 * como un contador en la sesión para poder auditar cuándo y por qué se pausó,
 * que es justo lo que dirección, ventas y RRHH necesitan para medir.
 *
 * `createdBy` distingue quién la abrió: la propia persona o alguien que
 * supervisa. El índice único parcial garantiza a lo sumo UNA pausa abierta por
 * sesión, igual que con las sesiones abiertas por usuario.
 */
export const hubWorkBreaks = pgTable(
  "hub_work_breaks",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => hubWorkSessions.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    /** Null mientras la pausa sigue abierta. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Motivo declarado (opcional): "almuerzo", "trámite", … */
    reason: text("reason").notNull().default(""),
    /** Quién la abrió: la propia persona o quien supervisa. */
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bySession: index("hub_work_breaks_session_idx").on(t.sessionId),
    byUser: index("hub_work_breaks_user_idx").on(t.userId, t.startedAt),
    openUniq: uniqueIndex("hub_work_breaks_open_uniq")
      .on(t.sessionId)
      .where(sql`${t.endedAt} IS NULL`),
  }),
);

export type HubWorkSessionRow = typeof hubWorkSessions.$inferSelect;
export type HubWorkBreakRow = typeof hubWorkBreaks.$inferSelect;
export type InsertHubWorkBreak = typeof hubWorkBreaks.$inferInsert;
export type InsertHubWorkSession = typeof hubWorkSessions.$inferInsert;
export type HubDayLogRow = typeof hubDayLogs.$inferSelect;
export type InsertHubDayLog = typeof hubDayLogs.$inferInsert;
