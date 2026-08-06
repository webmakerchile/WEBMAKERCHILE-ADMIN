---
name: Endpoints de subida de archivos, fuera del codegen de OpenAPI
description: Por qué los endpoints de subida (multipart/FormData) se llaman con fetch crudo en vez de pasar por el cliente generado, y qué patrón seguir al agregar uno nuevo.
---

Los endpoints que reciben archivos (multer + `FormData`) están **deliberadamente** excluidos
del pipeline `lib/api-spec/openapi.yaml` → orval → `lib/api-client-react`. No es un olvido:
el resto de la API sí pasa por ahí.

**Por qué:** el cliente generado por orval está pensado para request/response JSON tipado; forzar
`multipart/form-data` (con progreso de subida, `FormData`, etc.) por ese generador añade fricción
sin beneficio real. La convención ya establecida (`PdfUploadField`, `Adjuntos`, y el upload nuevo
de `HubDriveView`) es: `fetch` directo con `FormData`, `credentials: "include"`, leyendo el error
tipado del backend (`{ error, code, conectar }` en el caso de Drive) a mano.

**Cómo aplicarlo:** al agregar un nuevo endpoint de subida, NO lo agregues a `openapi.yaml` ni
esperes que aparezca un hook de orval. Sigue el patrón de `fetch` + `FormData` ya usado en
`artifacts/admin-panel/src/components/adjuntos.tsx` / `pdf-upload-field` y en las rutas
`artifacts/api-server/src/routes/drive/index.ts` (multer memoryStorage, límite de tamaño en el
`multer()` compartido del router, respuesta 409 `google_no_conectado` si falta la conexión).
