---
name: Frescura de documentos de contrato
description: Reglas de huellas (hashes) de frescura para los PDFs cliente/técnico de contratos y sus trampas
---

# Frescura de documentos de contrato (panel Documentos)

- **La huella solo se guarda si el PDF de verdad quedó en Drive Y salió del MISMO documento estructurado.**
  **Why:** una huella guardada "por optimismo" hace que el panel jure "Al día" sobre un PDF que no existe o que se dibujó desde otra fuente (p. ej. el asistente sube un PDF hecho desde JSON editable del LLM; si el JSON fue editado a mano o sus totales difieren de la ficha, la huella mentiría). Fue el hallazgo SEVERO de la revisión.
  **How to apply:** al subir, persistir `docHash`/`briefHash` solo dentro del branch donde ese PDF concreto se subió; si la fuente del PDF pudo divergir del doc (JSON editado, totales distintos), omitir la huella — el panel mostrará "Desactualizado" hasta regenerar, que es lo honesto.

- **Fallo parcial ⇒ borrar la huella del documento dependiente, nunca re-subir contenido viejo.**
  **Why:** si el brief técnico no se pudo regenerar pero la cotización sí, re-subir el brief viejo (o conservar su huella) lo mostraría "Al día" describiendo un documento que ya no existe.
  **How to apply:** en regeneraciones multi-documento, cuando una pieza falla: no incluirla en la subida, poner su hash en `undefined` (el jsonb passthrough elimina la clave) y decirlo en el toast ("quedó marcado desactualizado").

- **Huella ausente = desactualizado una sola vez (self-healing).** Contratos legados con PDF pero sin hash muestran "Desactualizado"; la primera regeneración los alinea. No inventar migraciones de hashes.

- **La lib de hash vive duplicada byte-a-byte en api-server y admin-panel, con un test que compara los bytes de ambos archivos.**
  **Why:** el monorepo no comparte libs entre esos dos paquetes sin build extra; el hash DEBE ser idéntico en ambos lados o la frescura se rompe silenciosamente.
  **How to apply:** cualquier cambio se hace en los dos archivos a la vez; el test de identidad byte-a-byte en api-server falla si se olvida. La normalización descarta ids/módulos sin nombre/generatedAt para que reordenar u hojear no ensucie la huella.

- **Nunca usar flags pegajosos tipo `docDirty` para frescura.** Derivar siempre de hash(contenido actual) vs hash guardado; los flags se desincronizan con guardados concurrentes del Hub y ediciones de IA.
