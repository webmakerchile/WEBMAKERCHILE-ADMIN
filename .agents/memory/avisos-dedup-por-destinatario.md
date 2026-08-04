---
name: Dedup de avisos por destinatario
description: Por qué una clave de deduplicación que no incluye al destinatario pierde avisos en silencio cuando hay más de uno.
---

# Dedup de avisos: la clave debe incluir al destinatario

En sistemas de avisos/recordatorios que evitan re-notificar el mismo hecho dos veces (dedup por `ref` o clave equivalente, en un Map/Set en memoria o una restricción única en DB), si esa clave se arma solo a partir del HECHO (p. ej. el id del proyecto o la tarea) y NO incorpora también al destinatario, entonces "avisar a la persona A sobre X" y "avisar a la persona B sobre X" colisionan en la misma clave. Solo uno de los dos avisos sobrevive — el otro se descarta en silencio, sin error visible.

**Why:** encontrado al revisar un flujo de avisos con varios destinatarios posibles (p. ej. dirección + quien tiene asignado el proyecto) donde ambos podían compartir el mismo hecho disparador.

**How to apply:** cuando un aviso puede ir a más de un destinatario por el mismo hecho, la clave de dedup debe ser compuesta (hecho + destinatario), nunca solo el hecho. Al revisar código de notificaciones existente, comprobar explícitamente qué pasa cuando dos destinatarios comparten la misma clave antes de dar por buena la lógica.
