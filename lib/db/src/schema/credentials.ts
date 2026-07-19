import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const platformCredentials = pgTable("platform_credentials", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  encryptedValue: text("encrypted_value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});
