CREATE TABLE IF NOT EXISTS "playbooks" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "work_type" text NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "tasks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "handoff_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "entity_id" text NOT NULL,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "handoff_log_kind_entity_uq" ON "handoff_log" ("kind", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "handoff_log_created_idx" ON "handoff_log" ("created_at");
