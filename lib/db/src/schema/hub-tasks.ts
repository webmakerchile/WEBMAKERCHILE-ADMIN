import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

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
    priority: text("priority").notNull().default("media"),
    status: text("status").notNull().default("pendiente"),
    dueDate: text("due_date"),
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
    byStatus: index("hub_tasks_status_idx").on(t.status),
    byCreatedBy: index("hub_tasks_created_by_idx").on(t.createdById),
    byProjectRef: index("hub_tasks_project_ref_idx").on(t.projectRef),
  }),
);

export type HubTaskRow = typeof hubTasks.$inferSelect;
export type InsertHubTask = typeof hubTasks.$inferInsert;
