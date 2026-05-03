ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "revoked_networks" text NOT NULL DEFAULT '';
