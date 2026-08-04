-- RRHH: campos nuevos de ficha + reportes diarios + informe semanal.
--
-- Cómo llega esto a producción (convención de la casa, igual que 0035–0038):
-- el DDL ya está aplicado en la base de DESARROLLO; al Publicar, Replit
-- introspecciona dev y prod y aplica el diff de esquema automáticamente.
-- Nada ejecuta `drizzle-kit migrate` (por eso no hay entrada en _journal),
-- y NO se agrega DDL al arranque del servidor: el esquema de producción no
-- es responsabilidad de la aplicación.

-- Fichas: correo personal, correo de empresa, RUT y fecha de nacimiento.
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "personal_email" text DEFAULT '' NOT NULL;
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "company_email" text DEFAULT '' NOT NULL;
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "rut" text DEFAULT '' NOT NULL;
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "birth_date" text DEFAULT '' NOT NULL;

-- Reportes diarios de RRHH (con resultado del correo en la fila).
CREATE TABLE IF NOT EXISTS "hr_daily_reports" (
"id" serial PRIMARY KEY NOT NULL,
"report_date" text NOT NULL,
"content" text NOT NULL,
"author_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
"email_status" text DEFAULT '' NOT NULL,
"email_detail" text DEFAULT '' NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "hr_daily_reports_date_idx" ON "hr_daily_reports" ("report_date");

-- Informe semanal de RRHH: una fila por semana (lunes YYYY-MM-DD).
CREATE TABLE IF NOT EXISTS "hr_weekly_reports" (
"id" serial PRIMARY KEY NOT NULL,
"week_key" text NOT NULL UNIQUE,
"resumen" text DEFAULT '' NOT NULL,
"destacadas" text DEFAULT '' NOT NULL,
"analisis" text DEFAULT '' NOT NULL,
"updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
