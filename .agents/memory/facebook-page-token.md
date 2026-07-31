---
name: Publicación en Facebook — token de página
description: El error #200 de Meta al publicar suele ser token de usuario de sistema, no falta de permisos.
---
Regla: los endpoints de publicación de Meta (/feed, /photos, /videos) exigen el token DE LA PÁGINA. Un token de usuario de sistema con pages_manage_posts + pages_read_engagement concedidos igual falla con el error #200 «necesita pages_read_engagement y pages_manage_posts… y quien conecta debe ser administrador» — el mensaje de Meta es engañoso: no faltan permisos, falta el token correcto.
**Why:** pasó en producción con el secreto FACEBOOK_PAGE_ACCESS_TOKEN (era de usuario de sistema); las lecturas (status, perfil) funcionaban, solo la publicación fallaba.
**How to apply:** derivar el token de página con GET /{page-id}?fields=access_token usando el configurado (si ya es de página, devuelve el mismo). El publicador lo hace solo (resolvePageToken); ante un #200 nuevo, verificar primero qué identidad responde GET /me con el token. Nota: debug_token falla con app distinta («App_id did not match»), no es concluyente.
