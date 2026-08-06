---
name: Drive por usuario, no por dueño del tablero
description: Toda ruta de Drive del Hub (incluida contratos) usa el token de Google de quien hace la petición, nunca el del dueño del tablero; por qué eso deja a roles enteros sin poder generar/adjuntar nada, y por qué un redirect_uri_mismatch en dev al conectar Drive no es un bug real.
---

# Drive por usuario, no por dueño del tablero

El Hub (`hub_state`) es un tablero único compartido para toda la agencia, pero **todas** las rutas de Drive (`driveDe(req.user)` en `drive/index.ts` — explorador, adjuntos, subida de PDFs de contratos, etc.) arman el cliente de Google con los tokens de quien HACE LA PETICIÓN, nunca con los del dueño del tablero. Si un miembro del equipo con scope de Hub (p. ej. rol `ventas`) nunca conectó su propia cuenta de Google, cualquier acción que toque Drive le falla con 409 `google_no_conectado` — aunque su rol tenga permiso completo sobre esa sección y el dueño del tablero sí tenga Drive conectado. Esto se ve como "el sistema no genera nada" para esa persona, nunca para el dueño.

**Por qué pasa (patrón recurrente, no un bug puntual):** el botón "Conectar Google Drive" históricamente solo vivía en `/cuentas`. Cualquier rol sin acceso a esa página (p. ej. `ventas`) nunca tuvo dónde conectar Drive, y cada intento de generar/adjuntar algo falla desde el día uno, en silencio hasta que alguien topa con el intento fallido correcto.

**Cómo se corrige (patrón a reutilizar):** el aviso "Falta autorizar Google Drive" (`useEstadoDrive` + `<ConectarDrive volverA=".." />` en `components/conectar-drive.tsx`) debe mostrarse PROACTIVAMENTE — con `useEstadoDrive(activo)` evaluado apenas se abre la pantalla, no solo dentro del `catch` de una acción fallida — en cualquier pantalla donde un rol sin acceso a `/cuentas` pueda intentar algo que toque Drive. Antes de agregar una acción nueva que suba/lea Drive en una pantalla nueva, verificar si esa pantalla ya ofrece el aviso proactivo; si no, es el mismo bug de nuevo con otro nombre en otro lugar.

**Redirect_uri_mismatch en dev al probar la conexión real:** es esperado, no un bug de código. Las rutas de Drive/Calendar reutilizan a propósito un `redirect_uri` YA registrado en Google Cloud Console (ver comentario en `auth/index.ts`), pero ese registro cubre el dominio de producción, no el dominio efímero de cada preview de dev. El flujo real de conexión (clic hasta la pantalla de consentimiento de Google) solo es fiable en producción o con una cuenta de Google real de prueba; la cuenta de prueba del entorno dev tiene un `google_id` sintético sin cuenta real detrás, así que nunca puede completar un OAuth real — no sirve para validar la subida real a Drive, solo para validar la UI/lógica de "no conectado".
