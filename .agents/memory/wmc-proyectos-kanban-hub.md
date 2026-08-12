---
name: Puente Proyectos (WMC) → Kanban del Hub
description: Cómo y dónde los proyectos wmc aparecen como tarjetas en el tablero Scrum/Ban del Hub (subsección Kanban), y por qué NO se fusionaron los dos modelos de "proyecto".
---

# Proyectos (WMC) → Kanban del Hub (Scrum/Ban)

Hay DOS conceptos de "proyecto" en este repo que no hay que confundir ni fusionar:

1. **Proyectos WMC** (`shared-wmc/schema.ts` `Project`, `status`: MOCKUP/DEVELOPMENT/QA/DELIVERY/COMPLETED). Dato ajeno: webmakerlatam.com es el dueño real (ver [wmc-screens-proxy-port.md](wmc-screens-proxy-port.md)); localmente solo existe un ESPEJO de solo lectura en `panel_espejo` (recurso `"proyectos"`, ver [panel-agencia-espejo.md](panel-agencia-espejo.md)).
2. **Proyectos del Hub** (`pages/hub/shared.tsx` `Project`, `status`: lead/disc/design/dev/testing/done — columnas `STATUS`). Viven en `hub_state.data.projects` (el tablero compartido de dirección), la pestaña "Scrum/Ban" del Hub, subsección **Kanban** (`ProjView`, `projView === "board"`).

**El puente** (`artifacts/api-server/src/lib/panel/hub-sync.ts`, `sincronizarProyectosWmcAlHub`) NO mezcla los modelos: crea, del lado del Hub, una tarjeta espejo por cada proyecto wmc, marcada con `wmcId` (id del proyecto en wmc) y `wmcStatus` (última etapa wmc vista). La columna se decide con `WMC_STATUS_A_ETAPA_HUB` (MOCKUP→design, DEVELOPMENT→dev, QA→testing, DELIVERY→done, COMPLETED→done — los labels de ambos lados ya coincidían 1 a 1 en significado). Tarjetas SIN `wmcId` son proyectos propios del Hub y el puente jamás las toca.

## Cuándo corre (no hay webhook del origen)
No existe un evento "proyecto creado" que el origen empuje — se aprovecha el sync/reconciliación YA existente del espejo (`lib/panel/sync.ts`), llamando al puente justo después de que la transacción del espejo confirma (`guardarRegistros("proyectos", ...)` ya aplicado), pero FUERA de esa transacción y envuelto en try/catch de solo-log: un fallo del puente jamás puede revertir ni bloquear el sync del espejo, que es lo crítico (delta cada ~10 min vía `checkPanelSync`, snapshot completo en la reconciliación diaria). Además, `index.ts` corre un respaldo de arranque (`respaldarProyectosWmcAlHubDesdeEspejo`) que sincroniza contra lo que YA esté en `panel_espejo` sin llamar al origen — cubre proyectos wmc creados antes de que este puente existiera, sin esperar la reconciliación diaria. Es decir: "automático al crearse un proyecto wmc" en la práctica significa *dentro de la ventana del próximo sync* (minutos), no en tiempo real — no hay forma de hacerlo más inmediato sin que el origen (fuera de este repo) agregue un webhook.

## Idempotencia y atomicidad
`sincronizarProyectosWmcAlHub` es idempotente por `wmcId` (una tarjeta por proyecto wmc, sin importar cuántas veces corra). Las escrituras a `hub_state.projects` son atómicas por SQL (`jsonb_set`/`jsonb_agg` sobre la fila, no lee-modifica-escribe el blob completo): no pisa cambios concurrentes de otras colecciones (`clients`, `contracts`, …) ni de otras tarjetas del propio `projects`, a diferencia de un `saveBoard()` con el blob entero.

## Qué NO hace (a propósito)
- No borra tarjetas si el proyecto wmc desaparece del espejo (nunca se supo de un proyecto wmc borrado de verdad; ver `ESTADOS_PROYECTO_FINAL`/reconciliación).
- No sincroniza en sentido inverso: mover a mano una tarjeta `wmcId` en el Kanban del Hub NO cambia nada en wmc, y el próximo sync la puede volver a mover si la etapa wmc real cambió mientras tanto (se compara contra `wmcStatus`, no contra la columna actual).
- No ubica la tarjeta si `status` del proyecto wmc no está en `WMC_STATUS_A_ETAPA_HUB` (dato nuevo del origen, sin clasificar) — mejor omitir que ubicar a ciegas.
