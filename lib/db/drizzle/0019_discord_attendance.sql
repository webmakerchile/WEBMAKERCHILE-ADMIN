-- Verificación automática de presencia en Discord (canal de voz) para asistencia.
-- users: emparejamiento panel ↔ cuenta de Discord.
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_tag text;
CREATE UNIQUE INDEX IF NOT EXISTS users_discord_user_id_uniq
  ON users (discord_user_id) WHERE discord_user_id IS NOT NULL;

-- hub_work_sessions: resultado de la verificación al marcar entrada y
-- acumuladores del barrido periódico (cada ~10 min durante la jornada).
ALTER TABLE hub_work_sessions ADD COLUMN IF NOT EXISTS discord_checkin boolean;
ALTER TABLE hub_work_sessions ADD COLUMN IF NOT EXISTS discord_checks integer NOT NULL DEFAULT 0;
ALTER TABLE hub_work_sessions ADD COLUMN IF NOT EXISTS discord_hits integer NOT NULL DEFAULT 0;
ALTER TABLE hub_work_sessions ADD COLUMN IF NOT EXISTS discord_last_seen_at timestamptz;
