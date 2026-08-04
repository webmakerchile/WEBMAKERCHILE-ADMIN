---
name: Concurrencia del tablero Hub
description: Invariantes al escribir el blob compartido del Hub y al convivir con fichas de inputs no controlados.
---

# Concurrencia del tablero Hub — invariantes

- El tablero se persiste como blob completo y la fusión por entidad solo protege contra escrituras que llegan DESPUÉS (compara updatedAt). No protege una lectura-modificación-guardado que se cruza con otro guardado: la copia vieja pisa en silencio los cambios ajenos.
  **Why:** una revisión de arquitectura encontró esa pérdida silenciosa en endpoints que guardaban el blob sin condición.
  **How to apply:** todo camino servidor que lea-modifique-guarde el blob debe condicionar el guardado a la versión leída y, si choca, releer y reintentar (pocas veces, luego error visible). El reintento debe re-validar con datos frescos: eso corta también carreras de doble transición (p. ej. resolver dos veces lo mismo). Los jobs de fondo siguen sin escribir el blob; si deben agregar entidades, append atómico en SQL.

- Las fichas del Hub con inputs NO controlados leen el DOM al guardar: un cambio de estado hecho por el servidor mientras la ficha está abierta puede revertirse con el próximo guardado (el select viejo re-impone el estado anterior).
  **Why:** registrar "perdido" con la ficha abierta podía des-perderse al guardar después.
  **How to apply:** tras una transición del servidor que deba quedar firme, cerrar la ficha y refrescar (respetando el guard de edición sucia). Transiciones que la ficha no pinta en inputs pueden quedarse abiertas.

- Avisos del embudo: un hecho → un aviso. Si dos recordatorios pueden dispararse por el mismo hecho (fecha de seguimiento que apunta a una reunión pendiente), el genérico se calla a favor del específico; y toda acción que resuelve el hecho debe apagar o mover la fecha que lo alimentaba, o sonará una alarma vencida por algo ya resuelto.

- Para sembrar datos de prueba del tablero en dev: escribir `projects`/`contracts` directo en el JSON de la fila de `hub_state` alcanza — la resolución adopta por CONTENIDO la fila más reciente que tenga algo en `projects/tasks/clients/meetings/notes/contracts`, incluso sin ningún usuario ceo/superadmin en la base. No hace falta crear ni tocar un usuario "dueño" para que el tablero aparezca.
