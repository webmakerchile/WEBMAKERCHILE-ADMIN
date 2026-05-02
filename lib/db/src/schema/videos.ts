import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
// NOTE: campaignId/templateId are intentionally NOT declared with .references()
// because the foreign-key target tables (`campaigns`, `templates`) live in a
// schema file imported AFTER this one — drizzle-zod's `createInsertSchema`
// resolves references at module load time. The FK constraint is added by the
// generated SQL migration in lib/db/drizzle.
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  coverPrompt: text("cover_prompt"),
  coverImageBase64: text("cover_image_base64"),
  coverMimeType: text("cover_mime_type"),
  videoFileDriveId: text("video_file_drive_id"),
  videoFileName: text("video_file_name"),
  driveFileId: text("drive_file_id"),
  driveFolderId: text("drive_folder_id"),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  month: text("month"),
  week: text("week"),
  day: text("day"),
  videoNumber: text("video_number"),
  scheduleHour: text("schedule_hour"),
  tiktokDescription: text("tiktok_description"),
  instagramDescription: text("instagram_description"),
  youtubeTitle: text("youtube_title"),
  youtubeDescription: text("youtube_description"),
  linkedinDescription: text("linkedin_description"),
  xDescription: text("x_description"),
  facebookDescription: text("facebook_description"),
  tiktokPublishId: text("tiktok_publish_id"),
  tiktokStatus: text("tiktok_status").default("pending"),
  tiktokError: text("tiktok_error"),
  instagramMediaId: text("instagram_media_id"),
  instagramStatus: text("instagram_status").default("pending"),
  instagramError: text("instagram_error"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeStatus: text("youtube_status").default("pending"),
  youtubeError: text("youtube_error"),
  linkedinPostId: text("linkedin_post_id"),
  linkedinStatus: text("linkedin_status").default("pending"),
  linkedinError: text("linkedin_error"),
  xPostId: text("x_post_id"),
  xStatus: text("x_status").default("pending"),
  xError: text("x_error"),
  facebookPostId: text("facebook_post_id"),
  facebookStatus: text("facebook_status").default("pending"),
  facebookError: text("facebook_error"),
  /** Optional grouping into a campaign (Lanzamiento Q2, Promo viernes, etc.). */
  campaignId: integer("campaign_id"),
  /** Optional template the video was created from. */
  templateId: integer("template_id"),
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
