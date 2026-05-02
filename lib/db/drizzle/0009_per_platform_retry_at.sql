ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "youtube_next_retry_at" timestamp with time zone;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "tiktok_next_retry_at" timestamp with time zone;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "instagram_next_retry_at" timestamp with time zone;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "linkedin_next_retry_at" timestamp with time zone;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "x_next_retry_at" timestamp with time zone;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "facebook_next_retry_at" timestamp with time zone;
