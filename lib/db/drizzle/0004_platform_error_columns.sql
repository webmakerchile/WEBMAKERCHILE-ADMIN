-- Incremental, idempotent migration for per-platform error message columns.

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "youtube_error" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "tiktok_error" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "instagram_error" text;
