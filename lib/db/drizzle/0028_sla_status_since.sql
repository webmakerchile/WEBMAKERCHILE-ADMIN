ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "status_since" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "workflow_status_since" timestamp with time zone NOT NULL DEFAULT now();
