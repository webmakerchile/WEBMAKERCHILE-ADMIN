import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const communityContent = pgTable("community_content", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  subtype: text("subtype"),
  topic: text("topic").notNull(),
  data: jsonb("data").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CommunityContent = typeof communityContent.$inferSelect;
export type InsertCommunityContent = typeof communityContent.$inferInsert;
