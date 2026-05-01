-- Incremental, idempotent migration for Facebook integration.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facebook_page_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facebook_page_name" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facebook_page_picture" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facebook_page_access_token" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facebook_user_access_token" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facebook_token_expires_at" timestamp;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "facebook_description" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "facebook_post_id" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "facebook_status" text DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "facebook_error" text;
