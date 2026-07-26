import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Imputación simple de horas a proyecto para rentabilidad: cada persona puede
 * estar asignada a proyectos del Hub con un % de dedicación. Sus horas de
 * jornada se reparten según ese % — sin timesheet por tarea, que sería
 * burocracia que nadie llenaría.
 */
export const projectAssignments = pgTable("project_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** id (string) del proyecto en el blob del Hub. */
  projectRef: text("project_ref").notNull(),
  /** % de la jornada de esta persona imputado a este proyecto (1–100). */
  allocationPct: integer("allocation_pct").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uq: uniqueIndex("project_assignments_uq").on(t.userId, t.projectRef),
}));

export type ProjectAssignmentRow = typeof projectAssignments.$inferSelect;
