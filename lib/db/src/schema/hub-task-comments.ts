import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { hubTasks } from "./hub-tasks";
import { users } from "./users";

/** Comentarios por tarea del Hub (hilo simple, orden cronológico). */
export const hubTaskComments = pgTable(
  "hub_task_comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => hubTasks.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTask: index("hub_task_comments_task_idx").on(t.taskId),
  }),
);

export type HubTaskCommentRow = typeof hubTaskComments.$inferSelect;
export type InsertHubTaskComment = typeof hubTaskComments.$inferInsert;
