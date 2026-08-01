---
name: Auditoría móvil del panel
description: Cómo auditar responsive sin falsos PASS y el patrón para elementos fixed sobre la tab bar móvil
---

# Auditoría móvil (panel admin)

- **Siempre auditar con textos en ESPAÑOL.** Un barrido en inglés dio PASS y el CEO encontró un botón cortado a 390px: las etiquetas ES son más largas y son las que desbordan. Antes de revisar, cambiar el idioma con el chip del header.
  **Why:** el desborde depende del ancho del texto; el usuario real usa la app en español.

- **Sonda programática > ojo.** Por ruta, en consola: comparar `document.scrollingElement.scrollWidth` vs `innerWidth` y listar elementos con `getBoundingClientRect().right > innerWidth+1`. Falsos positivos esperados y benignos: los blobs decorativos absolutos con `blur-[120px]` (fondo) y elementos `truncate` internos; si `scrollW == innerW`, no hay scroll real.

- **Elementos `fixed bottom-*` deben librar la tab bar móvil** (h-16 + safe-bottom en el layout): patrón `bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-6` (env() con coma funciona en valores arbitrarios de Tailwind). Aplica a FABs, toasts y barras pegajosas de wizard; en desktop restaurar con `lg:`. Bandas reservadas: tab bar → FABs/toasts/barras en 4.75rem → banners (instalación) en 9.5rem, para que nunca se pisen entre sí.

- **Solo corre UN subagente de testing a la vez** (límite de plataforma): los barridos largos van en secuencia, no en Promise.all; partir rutas en tandas y esperar cada una (waitForJob máx 600s, re-esperar si expira).

- **Los testers dejan semillas:** el paso "abrir el modal principal" puede crear borradores (p. ej. el wizard de videos crea el video al avanzar). Al cerrar la sesión de pruebas, revisar las tablas tocadas y borrar lo creado (complementa dev-auth-verification.md).
