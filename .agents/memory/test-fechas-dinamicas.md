---
name: Fechas dinámicas en tests
description: Tests con fechas "futuras" fijas caducan solos; cómo escribir fechas que no se vencen.
---

# Fechas en tests: nada de "futuro" hardcodeado

**Regla:** cuando un endpoint valida ventanas relativas al reloj real ("desde hoy en
adelante": licencias, agendamientos, recurrencias), el test no puede usar una fecha
fija que hoy es futura — el día que quede atrás, el test revienta sin que nadie haya
tocado ese código. Derivar la fecha del reloj (p. ej. próximo lunes → viernes: siempre
futuro y siempre 5 días hábiles, en cualquier zona horaria).

**Why:** un test así se vence solo y el rojo aparece en medio de una tarea ajena,
acusando al diff equivocado y costando diagnóstico.

**How to apply:** fechas fijas solo para datos históricos o claves de período ya
pasadas (no caducan). Si un test que era verde falla "solo", buscar primero fechas
vencidas antes de sospechar del cambio actual.
