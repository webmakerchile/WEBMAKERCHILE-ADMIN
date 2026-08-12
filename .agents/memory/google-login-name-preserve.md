---
name: Nombre de usuario no se pisa con el login de Google
description: En el login (Google OAuth o cuenta de prueba), un nombre ya guardado en DB tiene prioridad sobre el profile.displayName entrante.
---

# Nombre de usuario no se pisa con el login de Google

En `artifacts/api-server/src/routes/auth/index.ts`, cuando un usuario ya
existente vuelve a loguearse, el nombre se resuelve como
`existing.name || profile.displayName || null`: si ya hay un nombre
guardado en la fila (aunque haya sido editado a mano o venga de otro flujo),
el login NO lo pisa con lo que traiga el perfil de Google en ese momento.
`profile.displayName` solo se usa como nombre inicial cuando se crea la
fila por primera vez.

**Why:** evita que cambios cosméticos en el nombre de la cuenta de Google
de alguien (o coincidencias con nombres genéricos del perfil) borren un
nombre elegido a propósito dentro del producto.

**How to apply:** al tocar el flujo de login/creación de usuario, mantener
esta prioridad (`existing.name` gana); si hace falta sincronizar el nombre
con Google a propósito en algún caso, hacerlo explícito y no como efecto
lateral del login normal.
