-- Tareas 2.0: checklist por tarea, recordatorios de vencimiento y comentarios.
-- Ya aplicado en desarrollo (2026-07-24); pendiente de aplicar en producción al publicar.

ALTER TABLE "hub_tasks" ADD COLUMN IF NOT EXISTS "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "hub_tasks" ADD COLUMN IF NOT EXISTS "due_reminder_sent_for" text;
-- Columna legada sin uso (reemplazada hace tiempo por "stage"); bloqueaba drizzle push.
ALTER TABLE "hub_tasks" DROP COLUMN IF EXISTS "status";

CREATE TABLE IF NOT EXISTS "hub_task_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "task_id" integer NOT NULL REFERENCES "hub_tasks"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "hub_task_comments_task_idx" ON "hub_task_comments" ("task_id");
