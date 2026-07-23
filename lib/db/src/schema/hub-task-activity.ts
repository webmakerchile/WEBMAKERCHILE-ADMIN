import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { hubTasks } from "./hub-tasks";
import { users } from "./users";

export const hubTaskActivity = pgTable(
  "hub_task_activity",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => hubTasks.id, { onDelete: "cascade" }),
    /** Snapshot of title at moment of action (for display after renames) */
    taskTitle: text("task_title").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "stage_change" | "created" | "assigned" */
    action: text("action").notNull(),
    oldStage: text("old_stage"),
    newStage: text("new_stage"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTask: index("hub_task_activity_task_idx").on(t.taskId),
    byUser: index("hub_task_activity_user_idx").on(t.userId),
    byCreated: index("hub_task_activity_created_idx").on(t.createdAt),
  }),
);

export type HubTaskActivityRow = typeof hubTaskActivity.$inferSelect;
export type InsertHubTaskActivity = typeof hubTaskActivity.$inferInsert;
