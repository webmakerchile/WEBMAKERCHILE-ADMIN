ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_linked_at" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source" text DEFAULT 'discord' NOT NULL,
	"channel_id" text DEFAULT '' NOT NULL,
	"channel_name" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_sessions_user_started_idx" ON "work_sessions" ("user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_sessions_ended_idx" ON "work_sessions" ("ended_at");
