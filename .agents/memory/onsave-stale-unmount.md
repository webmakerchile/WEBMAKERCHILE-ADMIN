---
name: Continuaciones async que pisan el estado al desmontar
description: Por qué un stateRef sincronizado "en cada render" no basta cuando el componente se desmonta antes del próximo render, y el patrón de fusión correcto en este panel (ejecutivo.tsx).
---

# Continuaciones async que pisan el estado al desmontar

En `ejecutivo.tsx`, `onSave` (== el `setState` de más alto nivel, guarda local + programa el PATCH al servidor) originalmente solo aceptaba un valor `HubState` completo. Cualquier código async (fetch, mkdir de Drive, etc.) que necesitara fusionar sobre "el estado actual" lo leía de un `state`/`stateRef` capturado por closure en el componente que disparó la llamada.

**El bug:** un `useRef` sincronizado con `ref.current = state` en el cuerpo del componente SOLO se actualiza en cada re-render de ESE componente. Si el componente se desmonta antes de que la operación async resuelva — por ejemplo, un modal de "crear proyecto" que se cierra solo (`onClose()`) en el mismo tick que `onSave()` lo crea — nunca vuelve a renderizar, así que el ref queda congelado en el estado ANTERIOR a la creación. Cuando la continuación async resuelve y hace `onSave({...stateRef.current, ...cambio})`, ese `onSave` sobreescribe el estado real con una foto vieja que ni siquiera incluye la entidad recién creada: parece que "se borró sola".

**Por qué el síntoma engaña:** el toast de éxito/error de la operación async SÍ aparece (esa parte del closure no depende del estado), así que todo parece haber funcionado hasta que se mira el tablero y está vacío. Fácil de confundir con un fallo de guardado en el servidor (409, red, etc.) — pero el guardado al servidor recibe exactamente lo que el cliente le mandó; el dato ya se perdió del lado del cliente antes de salir.

**La corrección aplicada:** `onSave` ahora acepta también una función `(prev) => next`, resuelta DENTRO del `setStateRaw(prev => ...)` de React (no contra ningún ref de componente). `prev` ahí es siempre el estado real más reciente sin importar qué se desmontó. Cualquier continuación async que fusione sobre el estado debe usar esta forma función, nunca un `state`/`stateRef` capturado.

**Cuidado con StrictMode:** el updater de `setStateRaw` puede correr dos veces en dev (double-invoke de Strict Mode). Los efectos secundarios (programar el PATCH al servidor) deben quedar detrás de un `clearTimeout`/guard idempotente — en este código ya existe (cancela el timer anterior antes de poner uno nuevo), así que el doble-invoke no duplica el guardado real. Si se agrega un efecto secundario nuevo dentro de ese updater, debe ser igual de cancelable/idempotente.

**Cómo detectarlo en vivo:** el síntoma es "la acción parece haber funcionado (toast ok) pero la entidad desaparece de la pantalla o el tablero queda vacío" — no un error de red visible. Sospechar esto (no un 409/permiso) cuando el fallo aparece justo después de crear algo desde un modal/sheet que se cierra solo.
