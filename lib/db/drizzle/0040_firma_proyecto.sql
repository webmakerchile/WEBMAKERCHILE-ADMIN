-- Firma digital: extender contract_signatures a aprobación de inicio y cierre
-- de proyecto (antes solo servía para contratos).
--
-- Cómo llega esto a producción (convención de la casa, igual que 0035–0039):
-- el DDL ya está aplicado en la base de DESARROLLO; al Publicar, Replit
-- introspecciona dev y prod y aplica el diff de esquema automáticamente.
-- Nada ejecuta `drizzle-kit migrate` (por eso no hay entrada en _journal),
-- y NO se agrega DDL al arranque del servidor: el esquema de producción no
-- es responsabilidad de la aplicación.

-- Una fila ahora puede firmar UN contrato O UN proyecto: "motivo" dice cuál
-- ("contrato" | "aprobacion_proyecto" | "cierre_proyecto") y solo la columna
-- que corresponde va llena. Sin CHECK en la DB — la disciplina es de la app,
-- igual que en el resto de esta tabla.
ALTER TABLE "contract_signatures" ALTER COLUMN "contract_id" DROP NOT NULL;
ALTER TABLE "contract_signatures" ADD COLUMN IF NOT EXISTS "project_id" text;
ALTER TABLE "contract_signatures" ADD COLUMN IF NOT EXISTS "motivo" text DEFAULT 'contrato' NOT NULL;
CREATE INDEX IF NOT EXISTS "contract_signatures_project_idx" ON "contract_signatures" ("project_id");
