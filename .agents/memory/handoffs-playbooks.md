---
name: Handoffs & playbooks design
description: Durable rules for automatic cross-area handoffs and playbook task templates.
---

# Handoffs & playbooks — durable rules

- Idempotency: claim a unique (kind, entity) row before side effects, and **release the claim on mid-run failure** so a later stage bounce retries. Claim-first without release permanently drops handoffs on transient errors.
  **Why:** architect review found claim-first alone is a silent data-loss path.
  **How to apply:** any new automatic trigger keyed to a state transition must use this claim/release pattern.
- Background jobs must never read-modify-write the shared hub board blob — append entities atomically in SQL so concurrent client PATCHes can't wipe them.
- Approving a video may only *suggest* a publish date (fill empty scheduledAt); publishing itself stays a human decision.
- Any endpoint that creates tasks needs the task-write gate (dirección), even if it lives under an area users can read — area access ≠ write access (RRHH reads /hub but must not create tasks).
- Santiago-local scheduled times need zone-aware fixed-point math; naive offset math breaks on Chilean DST boundaries.

## Arranque automático (venta_cerrada) con IA
- Los DOS caminos de activación (firma pública vía activar-contrato y transición manual del Hub) convergen en `handoffContractClosed`; el claim `venta_cerrada` dedupe si corren en paralelo. El disparo desde la activación es fire-and-forget: la respuesta de la firma jamás espera al LLM.
- **Regla**: un fallo del LLM se captura DENTRO del claim y cae al arranque mecánico desde el brief — nunca relanza (relanzar liberaría el claim y un camino sin rebote, como la firma, no reintenta jamás: proyecto mudo).
- **Invariante de dinero en la frontera**: todo texto de tarea/aviso pasa por `stripAllMoneyFromText` (contract-view, el ÚNICO sanitizador: cubre "990 UF" que el base no pilla) en el insert, venga de la IA (ya limpia) o de un brief legado/importado con montos. **Why:** los roles sin permiso de dinero ven tareas y notificaciones.
- Tareas generadas llevan `origin` ("arranque_ia" | "arranque_brief") — columna solo-servidor, ninguna ruta la acepta del cliente; asignación por tipo de trabajo: marketing→marketing, resto→dev más antiguo aprobado; asignados fuera del área "desarrollo" reciben aviso personal (el de área no les llega).
