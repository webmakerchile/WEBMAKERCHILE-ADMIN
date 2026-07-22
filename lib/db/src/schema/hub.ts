import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * Hub Ejecutivo v2 — datos compartidos del equipo en tablas normalizadas.
 * Convenciones (ver contrato):
 *  - serial id PK.
 *  - createdBy → users.id (set null al borrar el usuario), nullable.
 *  - createdAt/updatedAt timestamptz defaultNow; updatedAt se pisa en cada PATCH.
 *  - `extra` jsonb default {} para datos de UI no normalizados (timers de etapa,
 *    campos legacy del blob que no mapean, etc.).
 *  - Dinero en pesos chilenos enteros (integer, CLP sin decimales).
 */

export const hubClients = pgTable(
  "hub_clients",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    extra: jsonb("extra").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUpdated: index("hub_clients_updated_idx").on(t.updatedAt),
  }),
);

export const hubProjects = pgTable(
  "hub_projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    clientId: integer("client_id").references(() => hubClients.id, { onDelete: "set null" }),
    status: text("status"),
    stage: text("stage"),
    priority: text("priority"),
    progress: integer("progress"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    description: text("description"),
    extra: jsonb("extra").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUpdated: index("hub_projects_updated_idx").on(t.updatedAt),
    byClient: index("hub_projects_client_idx").on(t.clientId),
  }),
);

export const hubTasks = pgTable(
  "hub_tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    projectId: integer("project_id").references(() => hubProjects.id, { onDelete: "set null" }),
    /** 'por_hacer' | 'en_progreso' | 'en_revision' | 'hecho' */
    status: text("status"),
    priority: text("priority"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    /** Array de userIds responsables de la tarea. */
    assigneeIds: jsonb("assignee_ids").notNull().$type<number[]>().default(sql`'[]'::jsonb`),
    extra: jsonb("extra").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUpdated: index("hub_tasks_updated_idx").on(t.updatedAt),
    byStatusDue: index("hub_tasks_status_due_idx").on(t.status, t.dueDate),
  }),
);

export const hubMeetings = pgTable(
  "hub_meetings",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    clientId: integer("client_id").references(() => hubClients.id, { onDelete: "set null" }),
    date: timestamp("date", { withTimezone: true }),
    summary: text("summary"),
    notes: text("notes"),
    followUp: text("follow_up"),
    /** Marca del recordatorio "reunión en 1 hora" ya enviado (scheduler). */
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    extra: jsonb("extra").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUpdated: index("hub_meetings_updated_idx").on(t.updatedAt),
    byDate: index("hub_meetings_date_idx").on(t.date),
  }),
);

export const hubNotes = pgTable(
  "hub_notes",
  {
    id: serial("id").primaryKey(),
    title: text("title"),
    content: text("content").notNull().default(""),
    /** 'team' (visible para todos) | 'personal' (solo su creador). */
    scope: text("scope").notNull().default("team"),
    pinned: boolean("pinned").notNull().default(false),
    extra: jsonb("extra").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUpdated: index("hub_notes_updated_idx").on(t.updatedAt),
    byScopeCreator: index("hub_notes_scope_creator_idx").on(t.scope, t.createdBy),
  }),
);

export const hubContracts = pgTable(
  "hub_contracts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    clientId: integer("client_id").references(() => hubClients.id, { onDelete: "set null" }),
    clientName: text("client_name"),
    status: text("status"),
    /** Monto en CLP enteros. */
    amount: integer("amount"),
    currency: text("currency").notNull().default("CLP"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Marca del aviso de vencimiento (≤7 días) ya enviado (scheduler). */
    expiryRemindedAt: timestamp("expiry_reminded_at", { withTimezone: true }),
    driveFileId: text("drive_file_id"),
    body: text("body"),
    extra: jsonb("extra").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUpdated: index("hub_contracts_updated_idx").on(t.updatedAt),
    byExpires: index("hub_contracts_expires_idx").on(t.expiresAt),
  }),
);

/** Item de presupuesto: [{descripcion, cantidad, precioUnitario}]. */
export type HubQuoteItem = { descripcion: string; cantidad: number; precioUnitario: number };

export const hubQuotes = pgTable(
  "hub_quotes",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    clientId: integer("client_id").references(() => hubClients.id, { onDelete: "set null" }),
    clientName: text("client_name"),
    /** 'borrador' | 'enviado' | 'aceptado' | 'rechazado' */
    status: text("status").notNull().default("borrador"),
    currency: text("currency").notNull().default("CLP"),
    items: jsonb("items").notNull().$type<HubQuoteItem[]>().default(sql`'[]'::jsonb`),
    subtotal: integer("subtotal"),
    discount: integer("discount").notNull().default(0),
    /** IVA calculado, CLP enteros. */
    tax: integer("tax"),
    total: integer("total"),
    validityDays: integer("validity_days").notNull().default(15),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    /** Estado completo del wizard para reeditar/regenerar el PDF. */
    wizData: jsonb("wiz_data").$type<Record<string, unknown> | null>(),
    contractId: integer("contract_id").references(() => hubContracts.id, { onDelete: "set null" }),
    extra: jsonb("extra").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUpdated: index("hub_quotes_updated_idx").on(t.updatedAt),
    byStatus: index("hub_quotes_status_idx").on(t.status),
  }),
);

export type HubClient = typeof hubClients.$inferSelect;
export type InsertHubClient = typeof hubClients.$inferInsert;
export type HubProject = typeof hubProjects.$inferSelect;
export type InsertHubProject = typeof hubProjects.$inferInsert;
export type HubTask = typeof hubTasks.$inferSelect;
export type InsertHubTask = typeof hubTasks.$inferInsert;
export type HubMeeting = typeof hubMeetings.$inferSelect;
export type InsertHubMeeting = typeof hubMeetings.$inferInsert;
export type HubNote = typeof hubNotes.$inferSelect;
export type InsertHubNote = typeof hubNotes.$inferInsert;
export type HubContract = typeof hubContracts.$inferSelect;
export type InsertHubContract = typeof hubContracts.$inferInsert;
export type HubQuote = typeof hubQuotes.$inferSelect;
export type InsertHubQuote = typeof hubQuotes.$inferInsert;
