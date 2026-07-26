-- Torre de control CEO: costo hora, metas de empresa e imputación de horas a proyecto.
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "hourly_cost" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_goals" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "period" text NOT NULL DEFAULT 'mensual',
  "period_key" text NOT NULL,
  "target" integer,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_goals_period_idx" ON "company_goals" ("period", "period_key");
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "company_goal_id" integer REFERENCES "company_goals"("id") ON DELETE set null;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "project_ref" text NOT NULL,
  "allocation_pct" integer NOT NULL DEFAULT 100,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_assignments_uq" ON "project_assignments" ("user_id", "project_ref");
--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_pct_ck" CHECK ("allocation_pct" BETWEEN 1 AND 100);
--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_hourly_cost_ck" CHECK ("hourly_cost" IS NULL OR "hourly_cost" >= 0);
