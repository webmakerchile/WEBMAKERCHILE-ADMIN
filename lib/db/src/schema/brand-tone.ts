import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const brandTones = pgTable("brand_tones", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  voice: text("voice").notNull().default(""),
  persona: text("persona").notNull().default(""),
  values: text("values").notNull().default(""),
  avoidWords: text("avoid_words").notNull().default(""),
  examples: text("examples").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BrandTone = typeof brandTones.$inferSelect;
export type InsertBrandTone = typeof brandTones.$inferInsert;
