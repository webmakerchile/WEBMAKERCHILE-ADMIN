-- Reconciliación periódica del espejo del panel: además del sync por cursor
-- (que solo aplica altas/cambios y nunca borra), corre ~1 vez al día un pull
-- completo (/sync/snapshot) por recurso, pisa los datos frescos y poda del
-- espejo los ids que ya no existen en el origen. ultima_reconciliacion es
-- independiente de ultima_corrida/ultimo_exito (que reflejan el sync normal).
--
-- Cómo llega esto a producción (convención de la casa, igual que 0035–0042):
-- el DDL ya está aplicado en la base de DESARROLLO; al Publicar, Replit
-- introspecciona dev y prod y aplica el diff de esquema automáticamente.
-- Nada ejecuta `drizzle-kit migrate` (por eso no hay entrada en _journal),
-- y NO se agrega DDL al arranque del servidor: el esquema de producción no
-- es responsabilidad de la aplicación.

ALTER TABLE panel_sync_estado ADD COLUMN IF NOT EXISTS ultima_reconciliacion TIMESTAMPTZ;
