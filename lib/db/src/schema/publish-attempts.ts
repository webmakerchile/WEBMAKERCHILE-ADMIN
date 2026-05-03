import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { videos } from "./videos";

export const publishAttempts = pgTable(
  "publish_attempts",
  {
    id: serial("id").primaryKey(),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    outcome: text("outcome").notNull(),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byVideoCreated: index("publish_attempts_video_created_idx").on(t.videoId, t.createdAt),
  }),
);

export type PublishAttempt = typeof publishAttempts.$inferSelect;
export type InsertPublishAttempt = typeof publishAttempts.$inferInsert;
