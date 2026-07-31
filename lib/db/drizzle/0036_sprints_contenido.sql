-- Sprints semanales + pares de contenido (redes ↔ edición).
-- sprint_week: semana ISO (Santiago) a la que está comprometida la tarea.
-- paired_task_id: la otra mitad del par de contenido; borrar una deja la otra suelta.
ALTER TABLE hub_tasks ADD COLUMN IF NOT EXISTS sprint_week text;
ALTER TABLE hub_tasks ADD COLUMN IF NOT EXISTS paired_task_id integer REFERENCES hub_tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS hub_tasks_sprint_week_idx ON hub_tasks (sprint_week);

-- Foto de cada semana al cerrarse: el arrastre reescribe sprint_week de las
-- pendientes, así que la historia vive aquí, no en las tareas.
CREATE TABLE IF NOT EXISTS sprint_week_closures (
  id serial PRIMARY KEY,
  week_key text NOT NULL,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total integer NOT NULL DEFAULT 0,
  done integer NOT NULL DEFAULT 0,
  carried integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sprint_week_closures_week_user_uq UNIQUE (week_key, user_id)
);
