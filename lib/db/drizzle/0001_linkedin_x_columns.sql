-- Incremental, idempotent migration for LinkedIn + X integration.
-- Safe to run on databases provisioned before 0000 was applied as a baseline.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_person_urn" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_org_urn" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_access_token" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_refresh_token" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_token_expires_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_name" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_picture" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "x_user_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "x_username" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "x_access_token" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "x_refresh_token" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "x_token_expires_at" timestamp;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "linkedin_description" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "x_description" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "linkedin_post_id" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "linkedin_status" text DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "linkedin_error" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "x_post_id" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "x_status" text DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "x_error" text;
