-- Arranque automático de proyecto: las tareas generadas al activarse un
-- contrato quedan marcadas con su origen ("arranque_ia" | "arranque_brief");
-- null = tarea escrita por una persona.
ALTER TABLE "hub_tasks" ADD COLUMN IF NOT EXISTS "origin" text;
