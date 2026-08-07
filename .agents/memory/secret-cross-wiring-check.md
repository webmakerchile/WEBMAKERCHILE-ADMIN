---
name: Verificar qué secreto es cuál antes de conectar una clave externa
description: Un secreto puede terminar con el valor de OTRO secreto del mismo proveedor/forma; el síntoma es un "unauthorized" genérico indistinguible de una clave vencida.
---

# Verificar qué secreto es cuál

Cuando dos secretos del mismo proveedor/familia tienen nombres o formas parecidas (ej. una API key para el panel propio y otra para integración servicio-a-servicio del mismo dominio), es fácil pegar el valor de una en el secreto equivocado.

**Síntoma:** el origen responde "Unauthorized" (clave presente pero inválida) en vez de "falta la clave" — indistinguible a simple vista de una clave real pero vencida/revocada. Se puede perder tiempo depurando URL/headers/timeouts del lado propio cuando el problema es simplemente el valor cargado.

**Por qué:** ambos secretos comparten prefijo/formato visual, y quien configura puede copiar el valor correcto al campo incorrecto sin darse cuenta.

**Cómo aplicar:** antes de escalar como "bug de integración", comparar un fingerprint no sensible (largo del string + primeros ~12 hex de SHA-256) del secreto actualmente cargado contra lo que la fuente de verdad (el dueño del otro sistema) confirma que debería ser — nunca comparar ni imprimir el valor crudo. Si el fingerprint no coincide con lo esperado, es la clave equivocada, no una clave vencida.
