---
name: Permisos de navegación editables por rol
description: Por qué el mapa de rutas por rol viaja completo en /auth/me (no solo el propio) y por qué el catálogo de secciones vive separado de la data visual del sidebar.
---

# Permisos de navegación editables por rol

Cuando se hizo editable (vía DB) qué secciones ve cada rol — antes un array estático en `lib/roles` — dos decisiones de diseño quedan documentadas acá porque no son obvias releyendo el código:

## 1. `/auth/me` manda el mapa COMPLETO `{ [role]: rutas }`, no solo el del usuario actual

La app ya tenía una función de "Ver como" (simular otro rol sin cambiar de sesión). Si `/auth/me` solo mandara las rutas del rol real del usuario logueado, simular otro rol exigiría: (a) un fetch nuevo por cada rol simulado, con su propio loading state, o (b) lógica especial que distinga "modo simulación" en cada punto de consumo. Ambas opciones agregan estados async nuevos en paths de render sensibles (sidebar, guard de rutas).

Mandar el mapa completo evita las dos: cada punto de consumo simplemente indexa `roleRoutes[rolEfectivo]` con el mismo lookup sin importar si `rolEfectivo` viene de la sesión real o de la simulación — cero código nuevo condicionado a "¿estoy simulando?". El costo (mandar ~8 roles × su lista de rutas en cada `/auth/me`) es despreciable comparado con la complejidad evitada.

**Por qué importa:** cualquier feature nueva de permisos/visibilidad por rol en esta app debería preguntarse primero "¿esto tiene que convivir con Ver-como?" — si sí, preferir mandar la tabla completa indexable por rol en vez de un valor ya resuelto para "el usuario actual".

## 2. Rutas estáticas fuera del catálogo configurable deben sobrevivir cualquier override guardado

Un rol puede tener rutas fijas (no togglables desde la UI de permisos) además de las configurables. Si el cálculo de "rutas efectivas" simplemente reemplaza el default estático completo por el override guardado, esas rutas fijas desaparecen en cuanto se guarda cualquier cambio para ese rol — un self-lockout silencioso (se descubre solo probando el flujo real de guardar, no leyendo el código).

**Por qué importa:** al agregar un permiso "todo-o-nada" fuera del catálogo configurable para algún rol, la función que calcula permisos efectivos tiene que unir (no reemplazar) esas rutas fijas por encima del override, siempre — igual que ya se hacía con la ruta de inicio del rol.

## 3. La visibilidad por rol tiene más superficies globales que el sidebar

Un control de "qué rutas puede ver este rol" se siente completo apenas el menú lateral las filtra — pero la paleta de comandos, los atajos de teclado globales ("ir a X") y su diálogo de ayuda/leyenda suelen mantener listas de páginas propias, hardcodeadas e independientes del menú. Si no se auditan una por una, alguna deja rutas igual de "alcanzables/visibles" aunque el sidebar ya las oculte bien — se descubre solo probando esas superficies puntualmente, no leyendo el código del sidebar.

**Por qué importa:** al agregar o revisar cualquier control de visibilidad por rol en esta app, buscar TODOS los lugares que enumeran páginas del sitio (paleta de comandos, atajos y su ayuda, breadcrumbs, quick-links de dashboard), no solo el nav principal.
