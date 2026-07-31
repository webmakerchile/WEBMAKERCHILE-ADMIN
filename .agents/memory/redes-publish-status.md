---
name: Estados de publicación por red
description: Valores reales de status por plataforma en videos y qué cuenta como éxito; trampas al filtrar por estado en UI.
---

# Estados de publicación por red (videos)

Los estados por plataforma (`[red]Status` en la tabla `videos`) NO son uniformes:

- Éxito: `published` en la mayoría, pero **YouTube y TikTok persisten `uploaded`** (TikTok pasa a published tras confirmación asíncrona; puede quedar en `uploaded` con `tiktokPublishId` presente).
- Otros valores: `scheduled`, `pending`, `error` (terminal), `retrying` (reintento automático programado), `skipped` (red omitida a propósito).

**Regla:** cualquier UI o lógica que filtre/clasifique por estado de red debe tratar `published` Y `uploaded` como éxito. Olvidar `uploaded` hace que YouTube/TikTok exitosos desaparezcan silenciosamente de paneles/filtros (bug real cazado en revisión).

**Cómo aplicar:** grep de los literales en `scheduler.ts` (PLATFORM_FIELDS y los `set(...Status: ...)`) antes de escribir un filtro nuevo; el retry manual (`/content/videos/:id/retry/:platform`) también cuenta `uploaded` como publicado al recalcular el status global del video.

Nota e2e en dev: publicar de verdad es viable solo en Facebook (creds de servidor por env + fallback a post de texto sin archivo, y el post se puede borrar vía Graph API con el token de página derivado). Instagram exige archivo en Drive + tokens Google del usuario (solo existen en prod) — no testeable de verdad en dev.
