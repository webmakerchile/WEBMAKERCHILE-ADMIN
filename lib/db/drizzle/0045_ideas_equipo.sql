-- Tablero de Ideas de Editora + Redes sociales: pasa de lista privada por
-- usuario (kanban de 4 columnas, sin ninguna pantalla real usándola salvo un
-- widget suelto en el Dashboard que quedó fuera de la vista de este cambio)
-- a tablero de EQUIPO con 2 columnas ("funciona" / "no_funciona"),
-- compartido por todas las cuentas de esos roles. El gate real es por ROL,
-- no por área — ver ideas-gate.ts en el backend: Marketing comparte área
-- "marketing" con Redes sociales pero no debe ver esta sección.
--
-- La tabla `ideas` estaba vacía antes de este cambio, así que se reescribe
-- en vez de migrar datos existentes.
--
-- Cómo llega esto a producción (convención de la casa, igual que 0035–0044):
-- el DDL ya está aplicado en la base de DESARROLLO; al Publicar, Replit
-- introspecciona dev y prod y aplica el diff de esquema automáticamente.
-- Nada ejecuta `drizzle-kit migrate` (por eso no hay entrada en _journal), y
-- NO se agrega DDL al arranque del servidor: el esquema de producción no es
-- responsabilidad de la aplicación.

ALTER TABLE ideas DROP COLUMN IF EXISTS description;
ALTER TABLE ideas DROP COLUMN IF EXISTS kanban_order;
ALTER TABLE ideas RENAME COLUMN user_id TO created_by_user_id;
ALTER TABLE ideas RENAME COLUMN kanban_status TO column_id;
ALTER TABLE ideas ALTER COLUMN column_id SET DEFAULT 'funciona';
UPDATE ideas SET column_id = 'funciona' WHERE column_id NOT IN ('funciona', 'no_funciona');
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS created_by_name TEXT;
CREATE INDEX IF NOT EXISTS ideas_column_id_idx ON ideas (column_id);
