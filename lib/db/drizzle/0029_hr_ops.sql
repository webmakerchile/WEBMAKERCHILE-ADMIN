ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "vacation_days_per_year" integer NOT NULL DEFAULT 15;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "role" text NOT NULL UNIQUE,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboardings" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "assigned_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL DEFAULT 'vacaciones',
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "days" integer NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pendiente',
  "decided_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_user_idx" ON "leave_requests" ("user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_range_idx" ON "leave_requests" ("start_date","end_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "period_key" text NOT NULL,
  "goals_total" integer NOT NULL DEFAULT 0,
  "goals_met" integer NOT NULL DEFAULT 0,
  "attendance_minutes" integer NOT NULL DEFAULT 0,
  "attendance_days" integer NOT NULL DEFAULT 0,
  "leave_days" integer NOT NULL DEFAULT 0,
  "comment" text NOT NULL DEFAULT '',
  "reviewer_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "performance_reviews_user_period_uq" ON "performance_reviews" ("user_id","period_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "url" text NOT NULL DEFAULT '',
  "expires_at" text NOT NULL DEFAULT '',
  "alert_sent_for" text NOT NULL DEFAULT '',
  "archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_documents_user_idx" ON "employee_documents" ("user_id");
