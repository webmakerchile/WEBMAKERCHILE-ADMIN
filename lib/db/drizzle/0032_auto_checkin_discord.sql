-- Entrada automática por Discord: marcar sesiones iniciadas por el bot al detectar voz.
ALTER TABLE "hub_work_sessions" ADD COLUMN IF NOT EXISTS "auto_started" boolean NOT NULL DEFAULT false;
