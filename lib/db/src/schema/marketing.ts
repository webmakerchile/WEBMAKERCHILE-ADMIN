import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Cuentas publicitarias de clientes que administra el área de marketing.
 *
 * El apartado de Marketing no tenía dónde vivir lo que la persona a cargo hace
 * de verdad —administrar Google Ads, Meta Ads y TikTok Ads de cada cliente—,
 * así que mostraba un resumen genérico de redes propias que no le servía para
 * trabajar.
 *
 * Tabla propia y no un blob dentro de hub_state porque estos datos son del área
 * de marketing, no de dirección: mezclarlos obligaría a abrirle a marketing todo
 * el estado comercial (contratos y montos incluidos) solo para leer un id de
 * cuenta.
 */
export const marketingAdAccounts = pgTable(
  "marketing_ad_accounts",
  {
    id: serial("id").primaryKey(),
    /** Nombre del cliente tal como se escribe en el resto del panel. */
    clientName: text("client_name").notNull(),
    /** google_ads | meta_ads | tiktok_ads */
    platform: text("platform").notNull(),
    /** Identificador de la cuenta en la plataforma (ej. 123-456-7890). */
    accountId: text("account_id").notNull().default(""),
    /** Nombre visible de la cuenta dentro de la plataforma. */
    accountName: text("account_name").notNull().default(""),
    /** activa | pausada | sin_acceso | cerrada */
    status: text("status").notNull().default("activa"),
    /** Presupuesto mensual acordado, en la moneda indicada. */
    monthlyBudget: integer("monthly_budget"),
    currency: text("currency").notNull().default("CLP"),
    notes: text("notes").notNull().default(""),
    /** Quién la administra dentro del equipo. */
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byClient: index("marketing_ad_accounts_client_idx").on(t.clientName),
    byPlatform: index("marketing_ad_accounts_platform_idx").on(t.platform),
  }),
);

export type MarketingAdAccountRow = typeof marketingAdAccounts.$inferSelect;
export type InsertMarketingAdAccount = typeof marketingAdAccounts.$inferInsert;
