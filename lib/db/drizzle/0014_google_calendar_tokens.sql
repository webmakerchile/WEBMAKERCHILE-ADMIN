ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_calendar_access_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_calendar_refresh_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_calendar_token_expiry" timestamp;
ALTER TABLE "users" DROP COLUMN IF EXISTS "calendar_enabled";
