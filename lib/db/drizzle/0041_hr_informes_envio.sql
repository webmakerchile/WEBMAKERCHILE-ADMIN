-- Informe semanal de RRHH: envío formal a dirección (separado de guardar un
-- borrador), con el mismo seguimiento de correo que ya tienen los reportes
-- diarios.
--
-- Cómo llega esto a producción (convención de la casa, igual que 0035–0039):
-- el DDL ya está aplicado en la base de DESARROLLO; al Publicar, Replit
-- introspecciona dev y prod y aplica el diff de esquema automáticamente.
-- Nada ejecuta `drizzle-kit migrate` (por eso no hay entrada en _journal),
-- y NO se agrega DDL al arranque del servidor: el esquema de producción no
-- es responsabilidad de la aplicación.

ALTER TABLE "hr_weekly_reports" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
ALTER TABLE "hr_weekly_reports" ADD COLUMN IF NOT EXISTS "email_status" text DEFAULT '' NOT NULL;
ALTER TABLE "hr_weekly_reports" ADD COLUMN IF NOT EXISTS "email_detail" text DEFAULT '' NOT NULL;
