---
name: Puertos ocupados por procesos huérfanos
description: Qué hacer cuando un workflow backend no abre su puerto al reiniciar
---

# Puertos y procesos huérfanos (backend :3001)

- El arranque frío del backend (tsx) puede tardar >90s: si `WorkflowsRestart` falla por timeout pero el log muestra "Server listening", reintentar con `workflow_timeout` mayor ANTES de tocar código.
- **Trampa del huérfano:** puede quedar un proceso viejo con `PORT=3001` en loop de reintento de bind; en cuanto liberas el puerto (p. ej. `fuser -k 3001/tcp` mata solo al dueño ACTUAL del socket), el huérfano lo captura y el workflow nuevo ya no puede abrirlo → timeouts en serie.
  **How to apply:** ante restarts fallidos repetidos, `ps aux | grep tsx` + revisar `/proc/<pid>/environ` (PORT=) y matar por PID al huérfano, no solo al socket. Luego un único restart limpio.
- Señal típica: `curl :3001` responde (401) pero el workflow figura FAILED → el que responde no es el proceso administrado.
