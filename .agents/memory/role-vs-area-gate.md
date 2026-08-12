---
name: Gate por rol cuando dos roles comparten área
description: Cuándo un gate por ÁREA no alcanza y hace falta uno por ROL explícito — Historias (community-gate.ts) e Ideas (ideas-gate.ts) son las dos instancias del patrón.
---

# Gate por rol cuando dos roles comparten área

`ROLE_TO_AREA` (lib/areas) puede mapear dos roles distintos a la MISMA área
(p. ej. `social` y `marketing` → área `"marketing"`). Cuando una feature debe
ser visible para uno de esos roles pero no el otro, `requireArea`/
`AREA_API_PREFIXES` no sirven: estructuralmente no pueden distinguir dos
roles que comparten la misma área, sin importar cómo se ajuste la lista de
prefijos.

**Why:** ya pasó dos veces — Historias (`community-gate.ts`) e Ideas
(`ideas-gate.ts`) son ambas features exclusivas de un subconjunto de roles
que comparte área con roles que NO deben tener acceso. Meter el prefijo en
`AREA_API_PREFIXES` bajo el área compartida inevitablemente se lo da
también al rol que no debería tenerlo.

**How to apply:** cuando una feature nueva deba limitarse a roles
específicos y alguno de ellos comparte área con un rol excluido, escribir un
gate dedicado que compare `normalizeRole(user?.teamRole, user?.role ===
"superadmin")` contra una lista explícita de roles permitidos (mismo patrón
en `community-gate.ts` e `ideas-gate.ts`), montarlo como middleware propio
antes del router en `routes/index.ts`, y NO agregar el prefijo de esa
feature a la lista del área compartida en `AREA_API_PREFIXES` — dejar un
comentario ahí explicando por qué falta a propósito. Efecto secundario
aceptado: la pantalla de Permisos (genérica, por área) puede seguir
mostrando el toggle como si aplicara a todos los roles del área; el gate
real del backend igual bloquea al rol que no corresponde.
