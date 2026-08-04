---
name: Señal de modo Plan vs Build
description: Qué hacer ante la duda de si el turno está en modo Plan (solo lectura) o Build (con escritura).
---

# Modo Plan vs Build: cuál es la señal que manda

Ante la duda de si el entorno realmente está restringiendo a solo-lectura (Plan) o permite escribir (Build), la señal de verdad es un RECHAZO real de una llamada a herramienta por parte de la plataforma — no una suposición a partir del historial de la conversación, instrucciones previas, o la descripción general de "modos" del prompt de sistema.

**Why:** el texto de la conversación puede quedar desalineado con el modo real (p. ej. tras un cambio de modo a mitad de sesión); confiar en inferencia en vez del rechazo real llevó a bloquear trabajo válido o a intentar escrituras que la plataforma iba a rechazar de todas formas.

**How to apply:** si hay ambigüedad, intentar la operación real (o una de bajo riesgo del mismo tipo) y leer la respuesta de la plataforma. Un rechazo explícito confirma Plan; que se ejecute confirma Build. No asumir el modo por el tono de las instrucciones del usuario.
