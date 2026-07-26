CREATE TABLE IF NOT EXISTS "activity_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "entity_label" text NOT NULL,
  "action" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_actor_idx" ON "activity_log" ("actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_created_idx" ON "activity_log" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_entity_idx" ON "activity_log" ("entity_type","entity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_day_summaries" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "summary_date" date NOT NULL,
  "summary" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_day_summaries_user_date_idx" ON "activity_day_summaries" ("user_id","summary_date");
