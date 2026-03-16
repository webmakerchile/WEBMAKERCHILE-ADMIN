import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  coverPrompt: text("cover_prompt"),
  coverImageBase64: text("cover_image_base64"),
  coverMimeType: text("cover_mime_type"),
  driveFileId: text("drive_file_id"),
  driveFolderId: text("drive_folder_id"),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  month: text("month"),
  week: text("week"),
  day: text("day"),
  videoNumber: text("video_number"),
  tiktokDescription: text("tiktok_description"),
  instagramDescription: text("instagram_description"),
  youtubeTitle: text("youtube_title"),
  youtubeDescription: text("youtube_description"),
  tiktokPublishId: text("tiktok_publish_id"),
  tiktokStatus: text("tiktok_status").default("pending"),
  instagramStatus: text("instagram_status").default("pending"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeStatus: text("youtube_status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
