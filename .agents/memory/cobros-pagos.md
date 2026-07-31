---
name: Cobros y registro de pagos
description: Decisiones del módulo de cobros — ledger en tabla real, estadoPago calculado, auto-marca "pagado" de un solo sentido, y la única escritura al tablero desde la ruta pública de firma.
---

# Cobros: decisiones de diseño

- **El ledger de pagos vive en una tabla real (`contract_payments`), no en el blob del tablero.** **Why:** la plata necesita filas auditables (quién, cuándo, cuánto) y sumas recalculables; meterla al jsonb la expone a las carreras de guardado del blob. **How to apply:** cualquier dato financiero acumulativo nuevo → tabla propia referenciando el id del contrato del tablero (texto), nunca dentro de `hub_state`.
- **`estadoPago` (pendiente/parcial/pagado) se CALCULA siempre de total vs suma de pagos; jamás se persiste.** Sin total conocido nunca se declara "pagado" (a lo más "parcial").
- **La auto-marca `cobro.estado="pagado"` es de un solo sentido y re-verifica dentro del loop de reintentos:** relee el tablero (si un request rival ya marcó, NO escribe ni pisa `fechaPago`) y re-suma pagos desde la DB (un borrado simultáneo pudo descompletar). `fechaPago` = fecha del ÚLTIMO abono, no la del request ganador. **Why:** las comisiones cuelgan del mes de `fechaPago`; pisarla mueve plata de mes. Borrar un pago NUNCA desmarca — deshacer gestión es decisión humana.
- **Registro manual de dinero necesita guardia anti doble-clic en el server:** mismo autor + fecha + monto en <30 s → 409. El disabled del botón no basta (reintentos de red).
- **La ruta pública de firma hace UNA sola escritura acotada al tablero:** borrador→activo vía módulo dedicado (nunca toca perdido/activo/vencido, guardado condicionado a versión, jamás rompe el flujo de firma si falla). El arranque de proyecto post-activación queda deliberadamente fuera (tarea aguas abajo). **How to apply:** si otra ruta pública necesita tocar el tablero, copiar este patrón: módulo aparte, transición única permitida, try/catch total.
- **Adjuntos con tipo "empresa"** (bóveda de documentos, entityId fijo "webmaker"): gate por rol (ceo/ventas/contador) en GET, POST **y DELETE** — el DELETE también, porque quien subió un papel puede haber cambiado de rol.
