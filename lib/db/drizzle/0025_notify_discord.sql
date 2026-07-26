ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_discord" boolean NOT NULL DEFAULT true;
