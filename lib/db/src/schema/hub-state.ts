import { integer, jsonb, pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const hubState = pgTable("hub_state", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type HubStateRow = typeof hubState.$inferSelect;
