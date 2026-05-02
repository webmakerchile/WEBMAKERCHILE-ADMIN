import { integer, jsonb, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { videos } from "./videos";

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Array of userIds mentioned via @ in the body. */
    mentions: jsonb("mentions").notNull().$type<number[]>().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byVideoCreated: index("comments_video_created_idx").on(t.videoId, t.createdAt),
  }),
);

/**
 * A review request: someone (requestedBy) asks someone else (assignedTo) to
 * approve a video. The latest non-resolved row drives the wizard's approval UI.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    requestedBy: integer("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedTo: integer("assigned_to")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** pending | approved | changes_requested */
    status: text("status").notNull().default("pending"),
    message: text("message"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAssignedStatus: index("reviews_assigned_status_idx").on(t.assignedTo, t.status),
    byVideo: index("reviews_video_idx").on(t.videoId),
  }),
);

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;
