-- Connection health & publication retry tracking.
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "youtube_retries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "tiktok_retries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "instagram_retries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "linkedin_retries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "x_retries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "facebook_retries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_next_retry_idx" ON "videos" ("next_retry_at");
