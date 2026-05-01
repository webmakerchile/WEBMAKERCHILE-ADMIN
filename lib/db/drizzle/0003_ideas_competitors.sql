-- Incremental, idempotent migration for Ideas (kanban) and Competitors (inspirations panel).

CREATE TABLE IF NOT EXISTS "ideas" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "kanban_status" text DEFAULT 'por_hacer' NOT NULL,
    "kanban_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_user_status_idx" ON "ideas" ("user_id", "kanban_status", "kanban_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competitors" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "platform" text NOT NULL,
    "handle" text NOT NULL,
    "display_name" text,
    "last_fetched_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitors_user_idx" ON "competitors" ("user_id");
