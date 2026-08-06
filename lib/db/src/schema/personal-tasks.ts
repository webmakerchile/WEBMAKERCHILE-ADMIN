import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * "Mis pendientes": espacio 100% privado por usuario, sin relación con el
 * tablero del Hub (`hub_tasks`, compartido/gestionado por rol). Toda ruta que
 * lea o escriba estas tablas DEBE filtrar por `userId = quien pide` — no hay
 * excepción de rol (ni CEO ve tareas o checklists ajenas).
 */

export const personalTasks = pgTable(
  "personal_tasks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("personal_tasks_user_idx").on(t.userId),
  }),
);

export type PersonalTaskRow = typeof personalTasks.$inferSelect;
export type InsertPersonalTask = typeof personalTasks.$inferInsert;

/**
 * Ítem embebido de un checklist. `lastDoneKey` guarda la clave del día
 * (`periodKey("diaria")`, hora de Santiago) en que se marcó por última vez;
 * "hecho hoy" se calcula comparando esa clave contra la de hoy al leer, así
 * el reinicio diario no necesita ningún job en segundo plano.
 */
export type PersonalChecklistItem = { id: string; text: string; lastDoneKey: string | null };

export const personalChecklists = pgTable(
  "personal_checklists",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    items: jsonb("items").$type<PersonalChecklistItem[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("personal_checklists_user_idx").on(t.userId),
  }),
);

export type PersonalChecklistRow = typeof personalChecklists.$inferSelect;
export type InsertPersonalChecklist = typeof personalChecklists.$inferInsert;
