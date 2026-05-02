import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/** Per-network description fields a template can pre-fill. */
export type TemplateFields = {
  description?: string;
  tiktokDescription?: string;
  instagramDescription?: string;
  youtubeTitle?: string;
  youtubeDescription?: string;
  linkedinDescription?: string;
  xDescription?: string;
  facebookDescription?: string;
};

export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** JSON object keyed by per-network description fields with `{{var}}` placeholders. */
  fields: jsonb("fields").notNull().$type<TemplateFields>(),
  /** Networks this template targets, e.g. ["tiktok","instagram","youtube"]. */
  networks: jsonb("networks").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  /** Discovered variable names (e.g. ["titulo","enlace"]) for quick UI hints. */
  variables: jsonb("variables").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hashtagGroups = pgTable("hashtag_groups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Hashtags stored without leading `#`, lowercased. */
  hashtags: jsonb("hashtags").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  /** Networks this group is intended for; empty array means "all". */
  networks: jsonb("networks").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** Hex color, defaults to brand orange. */
  color: text("color").notNull().default("#f97316"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;
export type HashtagGroup = typeof hashtagGroups.$inferSelect;
export type InsertHashtagGroup = typeof hashtagGroups.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;
