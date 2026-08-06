-- "Mis pendientes": tareas simples y checklists 100% privados por usuario,
-- sin relación con el tablero del Hub (hub_tasks, compartido/gestionado por
-- rol). Toda ruta que use estas tablas filtra siempre por user_id = quien
-- pide — ninguna excepción de rol.
--
-- Cómo llega esto a producción (convención de la casa, igual que 0035–0041):
-- el DDL ya está aplicado en la base de DESARROLLO; al Publicar, Replit
-- introspecciona dev y prod y aplica el diff de esquema automáticamente.
-- Nada ejecuta `drizzle-kit migrate` (por eso no hay entrada en _journal),
-- y NO se agrega DDL al arranque del servidor: el esquema de producción no
-- es responsabilidad de la aplicación.

CREATE TABLE IF NOT EXISTS personal_tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_tasks_user_idx ON personal_tasks(user_id);

CREATE TABLE IF NOT EXISTS personal_checklists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_checklists_user_idx ON personal_checklists(user_id);
