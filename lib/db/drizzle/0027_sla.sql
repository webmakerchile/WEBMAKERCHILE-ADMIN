CREATE TABLE IF NOT EXISTS "sla_policies" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "stage" text NOT NULL,
  "max_hours" integer NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sla_policies_type_stage_uq" ON "sla_policies" ("entity_type", "stage");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_breaches" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "stage" text NOT NULL,
  "stage_entered_at" timestamp with time zone NOT NULL,
  "label" text NOT NULL DEFAULT '',
  "responsible_id" integer REFERENCES "users"("id") ON DELETE set null,
  "notified_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reason" text,
  "reason_by_id" integer REFERENCES "users"("id") ON DELETE set null,
  "reason_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sla_breaches_episode_uq" ON "sla_breaches" ("entity_type", "entity_id", "stage", "stage_entered_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sla_breaches_responsible_idx" ON "sla_breaches" ("responsible_id");
