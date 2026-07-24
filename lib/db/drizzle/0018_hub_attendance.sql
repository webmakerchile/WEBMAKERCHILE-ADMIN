-- Asistencia y jornada del equipo (Hub Ejecutivo → pestaña Asistencia + tarjeta "Mi jornada").
-- Aplicado en desarrollo (2026-07-24); pendiente de aplicar en producción al publicar.

CREATE TABLE IF NOT EXISTS "hub_work_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "work_date" text NOT NULL,
  "check_in" timestamp with time zone DEFAULT now() NOT NULL,
  "check_out" timestamp with time zone,
  "on_discord" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "hub_work_sessions_user_date_idx" ON "hub_work_sessions" ("user_id","work_date");
CREATE INDEX IF NOT EXISTS "hub_work_sessions_date_idx" ON "hub_work_sessions" ("work_date");
-- A lo sumo una sesión abierta por usuario (protege contra doble check-in).
CREATE UNIQUE INDEX IF NOT EXISTS "hub_work_sessions_open_uniq" ON "hub_work_sessions" ("user_id") WHERE "check_out" IS NULL;

CREATE TABLE IF NOT EXISTS "hub_day_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "log_date" text NOT NULL,
  "text" text NOT NULL,
  "done" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "hub_day_logs_user_date_idx" ON "hub_day_logs" ("user_id","log_date");
CREATE INDEX IF NOT EXISTS "hub_day_logs_date_idx" ON "hub_day_logs" ("log_date");
