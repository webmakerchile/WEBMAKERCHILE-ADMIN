import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const VALID_STAGES = ["backlog", "sprint", "doing", "qa_sent", "qa_rev", "done"] as const;
export type HubStage = (typeof VALID_STAGES)[number];

export const VALID_PRIORITIES = ["crítica", "alta", "media", "baja"] as const;
export type HubPriority = (typeof VALID_PRIORITIES)[number];

/** Subtarea embebida en la tarea (checklist). */
export type HubChecklistItem = { id: string; text: string; done: boolean };

export const hubTasks = pgTable(
  "hub_tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assigneeId: integer("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    projectRef: text("project_ref"),
    /** Scrumban column: backlog → sprint → doing → qa_sent → qa_rev → done */
    stage: text("stage").notNull().default("backlog"),
    /** When the task entered the current stage */
    stageSince: timestamp("stage_since", { withTimezone: true }).defaultNow().notNull(),
    /** Seconds spent in each stage: { backlog: 120, sprint: 3600, ... } */
    stageTime: jsonb("stage_time").$type<Record<string, number>>().notNull().default({}),
    /** Human priority: crítica | alta | media | baja */
    priority: text("priority").notNull().default("media"),
    /**
     * De dónde salió la tarea. null = la escribió una persona.
     *  · "arranque_ia":    generada por IA al activarse el contrato
     *  · "arranque_brief": generada mecánicamente desde el brief (IA no disponible)
     * Solo la escribe el servidor en el arranque; ninguna ruta la acepta del cliente.
     */
    origin: text("origin"),
    dueDate: text("due_date"),
    /** Checklist embebido: [{ id, text, done }] */
    checklist: jsonb("checklist").$type<HubChecklistItem[]>().notNull().default([]),
    /**
     * Dedupe de recordatorios de vencimiento: "<dueDate>:today" | "<dueDate>:tomorrow".
     * Si cambia dueDate el marcador deja de coincidir y se vuelve a recordar.
     */
    dueReminderSentFor: text("due_reminder_sent_for"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    byAssignee: index("hub_tasks_assignee_idx").on(t.assigneeId),
    byStage: index("hub_tasks_stage_idx").on(t.stage),
    byCreatedBy: index("hub_tasks_created_by_idx").on(t.createdById),
    byProjectRef: index("hub_tasks_project_ref_idx").on(t.projectRef),
  }),
);

export type HubTaskRow = typeof hubTasks.$inferSelect;
export type InsertHubTask = typeof hubTasks.$inferInsert;
