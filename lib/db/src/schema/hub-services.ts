import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Plan de precios de un servicio (ej: Inicia / Escala / Domina).
 *
 * `price` es lo que se MUESTRA (lleva matices: "desde", "/mes"); `amount` es
 * lo que se CALCULA. Van separados porque con solo el texto no se podía sumar
 * ni precargar una cotización, y el asistente acababa estimando los precios
 * con IA teniendo el catálogo real al lado. Opcional: se deduce del texto para
 * los servicios que ya existían.
 */
export type HubServiceTier = { plan: string; price: string; detail: string; amount?: number | null };

/**
 * Catálogo de servicios del Hub Ejecutivo (antes hardcodeado en el frontend).
 * Editable desde la pestaña Servicios; se archiva en vez de borrar.
 */
export const hubServices = pgTable(
  "hub_services",
  {
    id: serial("id").primaryKey(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    includes: text("includes").notNull().default(""),
    note: text("note").notNull().default(""),
    tiers: jsonb("tiers").$type<HubServiceTier[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byArchived: index("hub_services_archived_idx").on(t.archived),
    bySort: index("hub_services_sort_idx").on(t.sortOrder),
  }),
);

export type HubServiceRow = typeof hubServices.$inferSelect;
export type InsertHubService = typeof hubServices.$inferInsert;
