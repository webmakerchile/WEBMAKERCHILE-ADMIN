---
name: Gates de permiso en el cliente (fail closed)
description: Cómo condicionar consultas/render a un permiso comprobado por red (Drive, Calendar…) sin dejar pasar estado viejo ni caché de otra sesión.
---

# Gates de permiso en el cliente

**Regla:** un hook que pregunta "¿esta cuenta tiene permiso X?" debe cerrar por
defecto: al (re)activarse olvida el resultado anterior (`conectado=false`,
`cargando=true`) y un fallo de red o respuesta no-OK deja `conectado=false`.
Solo un `=== true` de la respuesta EN CURSO abre el gate.

**Why:** la revisión de cierre rechazó una primera versión porque el hook
conservaba `conectado=true` viejo si la revalidación fallaba, y porque el
primer render tras reabrir aún veía el estado anterior → habilitaba consultas
y enseñaba caché de una sesión que ya no tenía permiso.

**How to apply:**
- Transiciones puras en un módulo de lib con tests en node (patrón
  `estado-drive.ts`: `estadoInicial/alComprobar/alApagar/alResponder`); el hook
  solo conecta eso a React y a fetch (guard `vivo` por efecto).
- El reset al reactivarse va EN EL RENDER (patrón "adjust state during
  render" con `activoPrevio`), no en un efecto: el efecto llega un frame tarde
  y ese frame ya habilita queries.
- React Query: una query con `enabled:false` CONSERVA `data` y `error` de
  antes. No basta con deshabilitar: al renderizar, filtrar listas y errores por
  el gate (`puedeListar ? datos : []`), o el aviso de "conectar" convive con
  archivos cacheados de otra cuenta.
- Botones con `disabled` no frenan Enter en el input: el handler de submit
  necesita su propio early-return con el flag de guardado.
