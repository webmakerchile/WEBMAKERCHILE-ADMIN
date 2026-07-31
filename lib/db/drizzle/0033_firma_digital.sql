-- Firma digital en la página pública de aceptación + estado de los correos
-- de confirmación (cliente y equipo). El envío tiene que fallar de forma
-- visible en el panel, así que el resultado se guarda junto a la firma.
ALTER TABLE contract_signatures
  ADD COLUMN IF NOT EXISTS signature_kind text,
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS email_cliente_estado text,
  ADD COLUMN IF NOT EXISTS email_equipo_estado text,
  ADD COLUMN IF NOT EXISTS email_detalle text;
