import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Tickets: la pieza que conecta las áreas.
 *
 * Cualquier persona pide algo a otra área (ventas → desarrollo, marketing →
 * contenido, quien sea → RRHH) sin saber a quién le toca: el ticket entra en la
 * bandeja del área y quien la atiende lo toma.
 *
 * Los enlaces (`projectId`, `contractId`, `taskId`, `videoId`) apuntan al resto
 * del sistema. `projectId`/`contractId`/`taskId` son ids del tablero del Hub,
 * que son strings generados en el cliente, por eso van como texto y sin FK.
 */
export const tickets = pgTable(
  "tickets",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Área destino: direccion | ventas | desarrollo | contenido | redes | marketing | rrhh | finanzas */
    area: text("area").notNull(),
    /** abierto | en_progreso | en_revision | resuelto | cerrado */
    status: text("status").notNull().default("abierto"),
    /** Desde cuándo está en el estado actual (para SLA por etapa). */
    statusSince: timestamp("status_since", { withTimezone: true }).defaultNow().notNull(),
    /** crítica | alta | media | baja */
    priority: text("priority").notNull().default("media"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Persona que lo tomó. Null = sigue en la bandeja del área. */
    assignedTo: integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
    /** Fecha comprometida (YYYY-MM-DD), opcional. */
    dueDate: text("due_date").notNull().default(""),
    /** Enlaces al tablero: proyecto, contrato y tarea generada desde este ticket. */
    projectId: text("project_id").notNull().default(""),
    contractId: text("contract_id").notNull().default(""),
    taskId: text("task_id").notNull().default(""),
    clientName: text("client_name").notNull().default(""),
    /** Video del panel de contenido al que se refiere, si aplica. */
    videoId: integer("video_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byArea: index("tickets_area_status_idx").on(t.area, t.status),
    byAssignee: index("tickets_assigned_idx").on(t.assignedTo),
  }),
);

export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTicket: index("ticket_comments_ticket_idx").on(t.ticketId, t.createdAt),
  }),
);

export type Ticket = typeof tickets.$inferSelect;
export type TicketComment = typeof ticketComments.$inferSelect;
