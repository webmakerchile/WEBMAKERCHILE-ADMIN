# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (gpt-4.1 for text generation, gpt-4.1-mini for fast tasks, gpt-image-1 for image generation). All Gemini/Anthropic calls replaced by an OpenAI compatibility shim in `lib/integrations-gemini-ai`.
- **Authentication**: Google OAuth 2.0 (Passport.js + express-session)
- **Google Drive**: Replit Connectors SDK (@replit/connectors-sdk)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── admin-panel/        # React + Vite admin panel (Content Admin Panel)
│   └── transcriber/        # Internal audio transcription app (Groq Whisper, port 3002)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-gemini-ai/  # Gemini AI integration (client, image gen, batch)
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package
```

## Features

### Admin Panel (Content Admin Panel)
- **Mobile-first layout**: Responsive design with bottom navigation bar on mobile, slide-out hamburger menu for additional items, desktop sidebar hidden on mobile. Uses `100dvh` for proper mobile viewport height. Safe area insets for iOS notch support.
- **Publer-style redesign** (Task #3 "Rediseño Publer"): Navigation reorganized as Inicio / Publicaciones / Cuentas Sociales (+ legacy items). Shared `components/social-icons.tsx` provides brand SVGs and gradient backgrounds for the 6 networks (Facebook, Instagram, LinkedIn, X, TikTok, YouTube).
- **Inicio (`/`)**: Greeting (time-aware) + "Crear publicación" CTA, 7-day analytics summary (totals: views, engagements, followers, posts) with per-network mini stats, Ideas kanban (4 columns: por_hacer / en_progreso / en_revision / hecho with native HTML5 drag-and-drop), inspirations panel (Google News RSS feed + competitors list), and a sticky right sidebar listing the next 8 scheduled publications.
- **Publicaciones (`/schedule`)**: Weekly calendar (Mon–Sun) with day navigation (prev/next/Hoy), each day shows scheduled video cards with time, network icons, and aggregate publish status. Selecting a day reveals a detail panel with per-network status badges. Retains the original "Ejecutar Cola" button to manually process the queue. Each day cell exposes a hover "+" button (and an empty-state "Agregar" placeholder) that opens a quick-create modal (title, description, time, multi-select networks) which POSTs `/api/content/videos` then PATCHes `scheduledAt` + per-network `*Status: "pending"` and `status: "scheduled"`. Cards are draggable across day cells (HTML5 drag-and-drop): dropping a card onto another day calls PATCH `/api/content/videos/:id` with the new `scheduledAt` (preserving the original time of day) and applies an optimistic update against the `['/api/content/videos']` query cache.
- **Cuentas Sociales (`/cuentas`)**: Unified connection grid for all 6 networks. Each card fetches its `/status` endpoint and shows connected account info (avatar, handle, follower count, etc.) or a Connect CTA pointing to that network's `/auth` endpoint. Disconnect button calls `/disconnect` where supported.
- **Dashboard (legacy `/`)**: REPLACED with the Publer-style Inicio above.
- **Video Manager**: Guided step-by-step wizard for the editor to complete each video without leaving the page. Steps: Basic Info → Cover (AI generation) → TikTok & Instagram descriptions → YouTube title & description → LinkedIn & X descriptions → Review & Schedule to all 5 platforms. Each video shows progress percentage. DB includes per-platform status fields (tiktokStatus, instagramStatus, youtubeStatus, linkedinStatus, xStatus) ready for API integration. Step 1 includes Drive file picker modal to select video files directly from Google Drive (browsable with folder navigation).
- **Cover Generator**: AI-powered cover image generation using OpenAI gpt-image-1 with reference images
- **Google Drive Browser**: Browse and manage files in connected Google Drive folder
- **Estudio de Trabajo (Recording Studio)**: Full video content creation workspace (migrated from webmakerchile.com)
  - AI idea generation by category (Corto Viral, Problema/Solución, Marketing, Historia, Educativo, Behind the Scenes, Opinión, Pack del Día)
  - Video ideas queue with filtering, saving, marking as recorded, bulk operations, batch date grouping
  - AI cover image generation using OpenAI gpt-image-1 with fox mascot reference (fox-reference.png)
  - Cover images saved locally to public/uploads/covers/ (served at /uploads/covers/)
  - Teleprompter with speed control, mirror mode, fullscreen, font size adjustment, voice recognition
  - Camera recording with pause/resume, camera switching, mirror, timer, video preview/download
  - Chunked video upload with ffmpeg CFR pipeline (finalize-upload)
  - Google Drive upload with year/month/week/day folder structure (max 5 videos/day)
  - Recording stats dashboard
  - Backend routes at /api/studio/* (ideas CRUD, generate, cover gen, recording stats, upload, Drive ops)
  - Frontend: studio.tsx (recording studio page) + ai-video-ideas-tab.tsx (ideas management component)
  - Uses inline apiFetch (fetch with credentials: "include") instead of apiRequest
- **Schedule Manager**: Schedule videos for automatic publishing to Google Drive
- **Transcriptor (`/transcriptor`)**: Audio transcription page inside the admin panel. Backend POST /api/transcriber/transcribe (auth + uploadLimiter): multer upload, files >24MB shrink via ffmpeg (WAV 16k mono, Opus 32k fallback), Groq whisper-large-v3-turbo (language es) with retries/backoff. Frontend: drag&drop queue (concurrency 2, runningRef lock), copy/txt/ZIP (jszip). The standalone `artifacts/transcriber` app (port 3002, no auth) remains as an internal duplicate.
- **Generador de Comunidad**:
  - **Descripciones (Carruseles)**: Multi-slide carrusel generation with per-slide retry, ZIP download, granular regenerate controls
  - **Historias (Stories 9:16)**: Single frame ("única") or narrative series (2–5 frames). Series use role-based structure: 2=[hook,cta], 3=[hook,desarrollo,cta], 4=[hook,problema,solucion,cta], 5=[hook,contexto,problema,solucion,cta]. Each role has its own pose+visualHint and CTA style (microCTA "Sigue viendo" for intermediate frames, conversion CTA with WhatsApp for final). "Auto" mode calls OpenAI gpt-4.1 (`/community/historias/detectar-formato`) to recommend formato + cantidad based on the concept (e.g., "N tips" → N+2 frames). Frames are generated in parallel via `Promise.allSettled` so partial failures surface as per-frame retry buttons. UI shows carousel thumbnail strip with role labels, frame counter pill (N/Total) rendered top-right, ZIP download with textos.txt.

### Roles del equipo y secciones por área
Fuente única de verdad en `lib/roles` (`@workspace/roles`, paquete sin dependencias que consumen API y panel). Ocho roles: `ceo`, `editora`, `social`, `ventas`, `dev`, `marketing`, `contador`, `rrhh`. Cada `RoleDef` declara `home` (pantalla de entrada), `routes` (rutas permitidas, `"*"` = todas), `canManageTeam`, `canManagePeople`, `canReview` y `hubScopes` (colecciones del Hub que puede leer).

- **Normalización**: `normalizeRole(raw, isSuperAdmin)` mapea los roles antiguos (`reviewer` → `ceo`, `editor` → `editora`) y **fuerza `ceo` cuando `users.role === "superadmin"`** — salvaguarda para que el dueño nunca quede fuera del panel. `/api/auth/me` y `/api/team/members` devuelven siempre el rol normalizado.
- **Backend**: `PATCH /api/team/members/:id/role` acepta los 7 roles (rechaza degradar al superadmin) y exige `canManageTeam`; las decisiones de revisión usan `canReview` en vez del antiguo `teamRole === "reviewer"`.
- **Frontend**: `RouteShell` (App.tsx) redirige a `roleHome` si el rol no puede ver la ruta actual; el menú lateral, la barra inferior móvil y el FAB del Hub se filtran con `canAccessRoute`. `/equipo` asigna rol por persona y documenta qué ve cada uno.
- **`GET /api/hub/owner`**: vista de **solo lectura** del blob del Hub de la dirección (superadmin, o el CEO más antiguo), recortada a los `hubScopes` del rol que consulta — 403 si el rol no tiene ninguno. Permite que ventas/programación/contabilidad vean datos reales sin poder pisar el blob del CEO (que es de un único escritor).
- **Páginas por área**: `/reportes` (contador + CEO: KPIs de contratos, neto/IVA, facturación por mes, vencimientos, export CSV), `/ventas` (ventas + CEO: pipeline, cartera, reuniones, PDFs) y `/mis-tareas` (dev + CEO: tablero por etapa y avance de proyectos). Editora, redes y marketing no necesitan página nueva: su sección es el panel existente recortado por rol.
- **Recursos Humanos (`/rrhh`)**: tabla `employee_profiles` (una ficha por usuario: cargo, área, tipo de contrato, situación, fechas de ingreso/término, renta bruta, teléfonos, contacto de emergencia, carpeta de documentos y notas; FK a `users` con `ON DELETE cascade`, migración `0016_employee_profiles.sql`). Endpoints `GET /api/hr/people` (usuarios + ficha), `PUT /api/hr/people/:userId` (upsert validado con Zod) y `PATCH /api/hr/people/:userId/approval` (aprobar/rechazar acceso), todos detrás de `canManagePeople` verificado **contra la DB**, no contra la sesión — la ficha incluye rentas y datos personales. Reglas: no se puede revocar el acceso del superadmin ni cambiar el estado de la propia cuenta, la fecha de término no puede ser anterior al ingreso, y renta vacía se guarda como `NULL` (no 0). La página muestra KPIs (personas activas, nómina mensual, fichas incompletas, solicitudes), solicitudes de acceso pendientes, aniversarios de ingreso próximos y el detalle editable por persona.
- Tests: `src/lib/roles.test.ts` (invariantes de rutas/permisos), `src/routes/hub/owner.test.ts` (recorte por rol) y `src/routes/hr/people.test.ts` (permisos, validación y reglas de RRHH).
### Jornada laboral medida por presencia en Discord
La jornada **no depende de que alguien apriete un botón**: la abre y la cierra la presencia en los canales de voz del servidor de Discord.

- **Tabla `work_sessions`** (migración `0018_jornada_discord.sql`) + `users.discord_user_id / discord_username / discord_linked_at`. `lastSeenAt` guarda la última presencia confirmada: al cerrar se cuenta hasta ese instante y no hasta "ahora", porque entre sondeos pasa un minuto.
- **Sondeo** (`src/lib/jornada-poll.ts`, llamado desde el tick de 60 s del scheduler): consulta `GET /guilds/{guild}/voice-states/{user}` por cada cuenta vinculada. **No usa gateway** — sin conexión WebSocket permanente ni discord.js. No-op si faltan `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID`.
- **Reglas** (`src/lib/jornada.ts`, puras y testeadas): tolerancia de 3 min antes de cerrar (un corte de red no parte la jornada en pedazos); una consulta fallida **no** cierra sesiones vivas (no es lo mismo "no conectado" que "no pude preguntar"); tope de 14 h para quien deja Discord abierto; el reloj en vivo nunca corre más allá de la última presencia + tolerancia, así un sondeo caído no infla las horas.
- **API**: `GET /api/jornada/me` (lo que consume "Mi día": hoy, semana, 7 días, sesión abierta), `GET /api/jornada/team` (asistencia del equipo, solo `canManagePeople`), `GET /api/jornada/status` (salud de la integración), `POST /api/jornada/{start,stop}` (marca manual de respaldo; una sesión de Discord se cierra hasta su última presencia confirmada). Vinculación: `GET /api/discord/auth` → `/api/discord/callback` (OAuth2 `identify`), `POST /api/discord/disconnect`, y `PATCH /api/discord/link/:userId` para que RRHH vincule un ID a mano.
- **Frontend**: `components/jornada-indicator.tsx` en el layout — sidebar, header móvil y menú móvil — así el estado se ve en **todas** las páginas y no solo en "Mi día". Muestra el cronómetro en verde cuando corre, "Fuera de jornada" con enlace directo al canal (`discord://` con respaldo web) cuando no, y "Vincular Discord" si la cuenta no está enlazada. Se oculta por completo si la integración no está configurada, para no enseñar al equipo a ignorar un aviso permanente. `/rrhh` suma "Asistencia de hoy" con quién está conectado, en qué canal, horas de hoy y de la semana, más el estado de la integración.
- **Secrets**: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` (obligatorios), `DISCORD_WORK_CHANNEL_IDS` (opcional, restringe qué canales cuentan), `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_CALLBACK_URL` (opcionales, solo para vincular por OAuth). El bot necesita estar en el servidor de la agencia.
- **Límite conocido y asumido**: esto mide *presencia conectada*, no trabajo. Es el acuerdo explícito del equipo (la dirección monitorea en el canal), no una inferencia del sistema.
- Tests: `src/lib/jornada.test.ts` (16 casos: apertura automática, cortes breves, ausencia real, fallo de sondeo, tope de 14 h, conteo en vivo y formato).

### Confidencialidad: dos versiones de cada contrato
Del mismo trato salen dos documentos y cada rol recibe el que le corresponde.

- **Capacidad `canSeeMoney`** (en `@workspace/roles`): dirección, ventas y contador ven montos; programación, marketing, contenido, redes y RRHH no. Invariante cubierta por test: quien edita contratos ve montos, y quien los lee sin verlos no puede editarlos.
- **Censura en el servidor** (`src/lib/contract-view.ts`): `redactContracts()` corre dentro de `scopeBoard`, así que al rol sin permiso **nunca se le envía el dato** — no se oculta en pantalla. Quita `value`, el precio de cada módulo, `downPct`, `monthly`/`monthlyPrice`, `validityDays` y **el PDF comercial** (que lleva los precios impresos). Conserva título, cliente, estado, fechas, alcance, nombres de módulos, el brief técnico y su PDF. Marca el contrato con `moneyRedacted: true`. Un test verifica que ninguna cifra sobreviva ni siquiera en el JSON serializado.
- **Brief técnico automático** (`POST /api/hub/contracts/brief`, gpt-4.1, aiLimiter): traduce lo vendido a alcance ejecutable — objetivo, contexto, alcance por módulo con entregables y requisitos, criterios de aceptación, fuera de alcance, stack sugerido e hitos. A la IA se le manda el documento ya sin precios, y la respuesta pasa por `stripMoneyFromText()` (que borra `$1.200.000`, `2.500.000 CLP`, `UF 120`… y respeta plazos, versiones y métricas como "Lighthouse 95+").
- **Generación automática**: el wizard genera en una sola pasada la cotización comercial y el brief técnico, y sube **ambos** PDFs a Drive (`buildBriefPdf` en `ejecutivo.tsx`). Al regenerar los documentos tras el chat IA, el brief se rehace en la misma operación: las dos versiones nunca se desincronizan. Nadie tiene que acordarse de escribir requerimientos.
- **Generación manual**: el bloque "Versión técnica" del contrato trae "Generar brief técnico" (o "Rehacer brief" si ya existe) para los contratos anteriores a esta función o para rehacerlo tras un cambio. Solo lo ve quien puede escribir contratos; si el contrato no tiene documento estructurado, se arma uno desde la ficha para tener qué describir.
- **Vistas**: el contrato censurado abre una sheet distinta ("Requerimientos", solo lectura, sin chat ni PDF comercial). `/mis-tareas` incluye "Requerimientos contratados" con el brief desplegable por contrato y enlace a su PDF técnico. Los botones de guardar y eliminar se ocultan cuando `hubWrite` no incluye `contracts`.
- Tests: `src/lib/contract-view.test.ts` (9) y los casos extremo a extremo en `hub/owner.test.ts` (programación y marketing sin montos; ventas, contador y dirección con montos completos).

### Tablero compartido y tickets (todo conectado)
El Hub dejó de ser un tablero por usuario: **hay uno solo para la agencia** y cada rol trabaja sobre él con su alcance.

- **Resolución del tablero** (`src/lib/hub-board.ts`): `resolveBoard()` devuelve la fila de `hub_state` de la dirección (superadmin, o el CEO más antiguo). Si esa fila aún no existe pero hay otra con datos —el tablero original de la época "uno por usuario"— la adopta en vez de arrancar en blanco. **Todo** camino que escriba en el tablero (Hub y tickets) debe pasar por aquí, o el equipo vería tableros distintos.
- **Alcance por rol**: `hubScopes` (lectura) y `hubWrite` (escritura) por colección. `GET /api/hub` recorta la lectura; `PATCH /api/hub` ignora en el servidor cualquier cambio fuera de `hubWrite`. Ventas escribe contratos/clientes/reuniones, desarrollo escribe proyectos/tareas, marketing escribe tareas, el contador solo lee. Invariante cubierta por test: nadie escribe lo que no puede leer.
- **Fusión concurrente** (`src/lib/hub-merge.ts`): el PATCH ya no sobrescribe el blob. `mergeCollection(stored, incoming, baseVersion)` fusiona entidad por entidad — gana la marca de tiempo más reciente; lo que otra persona creó después de que el cliente cargó se conserva; lo que el cliente borró y ya existía se elimina. El cliente manda `baseVersion` (la `updatedAt` que recibió) y adopta la respuesta fusionada. El Hub además refresca cada 30 s cuando no hay cambios locales pendientes.
- **Tickets** (tablas `tickets` + `ticket_comments`, migración `0017_tickets.sql`): el canal entre áreas. Un ticket se dirige a un **área** (`direccion`, `ventas`, `desarrollo`, `contenido`, `redes`, `marketing`, `rrhh`, `finanzas`), no a una persona, y aterriza en la bandeja de quien la atiende (`ticketAreas` por rol). Endpoints: `GET/POST /api/tickets`, `PATCH /api/tickets/:id`, `GET/POST /api/tickets/:id/comments` y `POST /api/tickets/:id/to-task`. Visibilidad: lo mío, lo asignado y lo de mi área (la dirección ve todo). Cada cambio de estado, asignación o comentario dispara notificación a quien corresponde.
- **Puente tickets ↔ tareas**: `POST /api/tickets/:id/to-task` crea la tarea en el Scrumban del tablero compartido (etapa `sprint`, con `ticketId` de vuelta) y deja el ticket enlazado y en progreso. Solo pueden hacerlo los roles con `tasks` en `hubWrite`. La tarjeta de la tarea muestra "Desde el ticket #N" y el ticket muestra "en el tablero".
- **Página `/tickets`** (todos los roles) con filtros (mi área / asignados / los que pedí / todos), creación con enlace a proyecto, contrato y cliente, cambio de estado, comentarios y conversión a tarea. `components/tickets-inline.tsx` incrusta la bandeja del área en `/ventas`, `/mis-tareas`, `/rrhh` y `/reportes`, para que cada panel muestre lo que las otras áreas le pidieron.
- Tests: `src/lib/hub-merge.test.ts` (9 casos, incluido el escenario de dos personas guardando en paralelo), `src/lib/hub-board.test.ts` (6, continuidad del tablero heredado) y `src/routes/tickets/tickets.test.ts` (8, permisos por área y puente a tareas).

### Hub Ejecutivo (`/ejecutivo`)
Workspace ejecutivo autocontenido (`admin-panel/src/pages/ejecutivo.tsx` + `ejecutivo.css`) con pestañas Dashboard / Proyectos (Kanban·Lista·Scrumban) / Clientes / Reuniones / Notas / Contratos / Servicios / Drive. Todo el estado vive en un único blob JSON por usuario (`hub_state.data`, máx 2 MB) expuesto por `GET/PATCH /api/hub`, con espejo en localStorage (`wm_hub_v3`).

**Contratos**: tres formas de crear — wizard (cotización desde cero con módulos y precios → PDF con jsPDF → Drive), desde notas de reunión (`/hub/contracts/extract-from-meeting`), o subiendo un PDF existente (`/hub/contracts/extract-pdf`, texto vía pdf-parse + OpenAI).

**Documento vs ficha**: cada contrato guarda `doc` (los datos estructurados de la cotización: módulos, precios netos, alcance, forma de pago, vigencia) además de la ficha (título, cliente, valor, estado, fechas, notas). `doc` es la fuente del PDF: `buildContractPdf(doc)` lo regenera y lo sube a Drive.

**Chat IA del contrato** (`POST /api/hub/contracts/ai-chat`, gpt-4.1, aiLimiter): recibe `{ contract, doc, instruction }` y devuelve `{ contract, doc, summary }`. Cuando el contrato tiene `doc`, la IA edita el documento (agregar/quitar módulos, cambiar precios, alcance, % de abono, vigencia) y no sólo la ficha; el merge conserva los campos que la IA no devuelve y un `doc` inválido se descarta (`doc: null`) en vez de corromper el contrato. En el panel, los cambios marcan el documento como pendiente y el botón "Regenerar PDF" (o "Guardar y regenerar documento") reconstruye el PDF, lo sube a Drive y recalcula valor/vencimiento desde los módulos. Los contratos sin `doc` (PDF externo o creados a mano) ofrecen "Crear documento desde la ficha" para habilitar la regeneración. Tests: `artifacts/api-server/src/routes/hub/ai-chat.test.ts`.

### Integrations
- **OpenAI**: Text (gpt-4.1/gpt-4.1-mini) and image generation (gpt-image-1) via Replit AI Integrations proxy. Shim in `lib/integrations-gemini-ai` preserves the Gemini API shape so routes work without rewriting call sites. Anthropic calls (community route) also replaced with OpenAI.
  - Reference image for covers: `artifacts/api-server/assets/reference-cover.jpg` (fox mascot, flat vector art style)
  - All cover generations automatically use this reference image for consistent branding
- **Google Drive**: File management via Replit Connectors SDK (folder: 1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB)
- **YouTube Data API v3**: Video upload to YouTube via googleapis package
  - OAuth scopes: youtube.upload, youtube
  - User tokens (access + refresh) stored in users table
  - Routes: GET /api/youtube/channel, POST /api/youtube/upload/:videoId, POST /api/youtube/upload-from-drive/:videoId, GET /api/youtube/status/:videoId
  - Videos are uploaded as "private" by default with Shorts-optimized metadata
  - upload-from-drive downloads video from Google Drive (videoFileDriveId) and uploads to YouTube without requiring manual file selection
  - Auto-upload during schedule/check queue processing when youtubeStatus is "scheduled"
  - Dashboard shows YouTube channel connection status
- **Instagram Content Publishing API**: Reel publishing via Instagram Graph API
  - Uses static access token (INSTAGRAM_ACCESS_TOKEN) + user ID (INSTAGRAM_USER_ID)
  - Meta App ID: 1317067910325181, Instagram App ID: 1494052229003058
  - Flow: Make Drive file temporarily public → Create Reel container → Poll for processing → Publish → Remove public access
  - Routes: GET /api/instagram/status, POST /api/instagram/upload-from-drive/:videoId, GET /api/instagram/media-status/:videoId
  - Videos published as public Reels with caption from instagramDescription
  - StepReview has Instagram upload button alongside YouTube and TikTok
- **TikTok Login Kit + Content Posting API** (sandbox mode):
  - OAuth v2 flow: GET /api/tiktok/auth → TikTok authorize → GET /api/tiktok/callback
  - Token exchange via POST https://open.tiktokapis.com/v2/oauth/token/
  - Scopes: user.info.basic, video.publish
  - User tokens (access + refresh + open_id) stored in users table
  - Content Posting: POST /api/tiktok/upload/:videoId (FILE_UPLOAD chunked method), POST /api/tiktok/upload-from-drive/:videoId
  - Videos published as SELF_ONLY (private) via /v2/post/publish/video/init/
  - upload-from-drive downloads video from Google Drive (videoFileDriveId) and uploads to TikTok without requiring manual file selection
  - Routes: GET /api/tiktok/status, POST /api/tiktok/disconnect, POST /api/tiktok/publish-status/:videoId
  - Dashboard shows TikTok connection card with connect/disconnect
  - StepReview has TikTok upload button alongside YouTube upload
  - Redirect URI: https://admin.webmakerchile.com/api/tiktok/callback
- **LinkedIn (UGC posts API)**: Text + video post publishing via the LinkedIn /v2/ugcPosts endpoint
  - OAuth 2.0 (OpenID Connect) with scopes `openid profile email w_member_social w_organization_social rw_organization_admin`
  - Routes: GET /api/linkedin/auth, GET /api/linkedin/callback, GET /api/linkedin/status, GET /api/linkedin/organizations, POST /api/linkedin/select-org, POST /api/linkedin/disconnect, POST /api/linkedin/publish/:videoId
  - Tokens (access/refresh + expiresAt + personUrn/orgUrn/name/picture) stored on the users table; auto-refresh helper `getValidLinkedInToken`
  - Personal profile + company page: `/linkedin/organizations` lists company pages the user administers (requires `rw_organization_admin`); `/linkedin/select-org` stores the chosen `linkedinOrgUrn` and posts are authored as that org URN when set, falling back to the personal `personUrn` otherwise
  - Video flow: `publishLinkedInVideo` registers an asset (`/v2/assets?action=registerUpload` with `feedshare-video` recipe), PUTs the binary to the returned uploadUrl, then creates the UGC post with `shareMediaCategory: "VIDEO"` and the asset URN. Falls back to `publishLinkedInPost` (text-only) when the video has no Drive file
  - Free tier: ~100 posts/day
  - Redirect URI: https://admin.webmakerchile.com/api/linkedin/callback
- **X / Twitter (v2 tweets API)**: Text + video tweet publishing via OAuth 2.0 + PKCE confidential client
  - Scopes: `tweet.read tweet.write users.read media.write offline.access`
  - Routes: GET /api/x/auth, GET /api/x/callback, GET /api/x/status, POST /api/x/disconnect, POST /api/x/publish/:videoId
  - Tokens (access/refresh + expiresAt + xUserId/xUsername) stored on the users table; auto-refresh helper `getValidXToken`
  - Video flow: `publishXTweetWithVideo` uses the v2 chunked `media/upload` endpoint (INIT/APPEND/FINALIZE + STATUS polling) with the user's OAuth 2.0 Bearer token, then posts with `media.media_ids`. Falls back to `publishXPost` (text-only) if no Drive file
  - Free tier: 1500 posts/month, video <= 512MB / 140s. 280 char limit enforced in the wizard and at publish time (truncation safeguard)
  - Redirect URI: https://admin.webmakerchile.com/api/x/callback
- **AI description generation**: POST /api/content/videos/:id/generate-descriptions accepts `{ platforms: ["tiktok","instagram","youtube","linkedin","x"] }` (any subset) and returns a per-platform description tuned to each network (LinkedIn = professional + 2-3 hashtags; X ≤ 280 chars). Uses Gemini 2.5 Flash via `@workspace/integrations-gemini-ai`. The wizard's "LinkedIn y X" step exposes a "✨ Generar con IA" button that calls this endpoint with `["linkedin","x"]`
- **Dashboard cards**: LinkedIn and X cards include a "Desconectar" button (POST /api/{linkedin,x}/disconnect with `confirm()`). The LinkedIn card additionally has a "Páginas de empresa" toggle that lazy-loads `/linkedin/organizations` and lets the user switch the publishing identity between the personal profile and any administered org via `/linkedin/select-org` (highlighted with an emerald background on the active option). The status sub-line reads "Publicando como Página" or "Publicando como perfil personal" based on `linkedinStatus.user.orgUrn`
- **Scheduler**: Runs every 60s in `artifacts/api-server/src/scheduler.ts`. For each video reaching its `scheduledAt`, it sequentially publishes to YouTube → TikTok → Instagram → LinkedIn → X (each step skipped when no per-platform description is configured). On per-platform failure it sets `<platform>Status = "error"` and persists the error message to `<platform>Error` (LinkedIn/X) so the schedule page can show it as a tooltip. Sets the parent `status = "published"` only when every requested step succeeds.
- **Ideas API**: GET/POST/PATCH/DELETE /api/ideas — kanban-style note board scoped per user. Backed by the `ideas` table (id, userId, title, description, kanbanStatus ∈ por_hacer|en_progreso|en_revision|hecho, kanbanOrder, timestamps). Used by Inicio kanban; PATCH supports moving cards between columns and reordering.
- **Analytics aggregation**: GET /api/analytics/summary?days=7 returns `{ totals: { views, engagements, followers, posts }, networks: [{ network, connected, metrics }] }` aggregated from YouTube Analytics, Instagram Insights, Facebook Page Insights, LinkedIn org stats, X user metrics and TikTok user info. Each adapter is isolated in try/catch and reports `connected: false` if the user hasn't linked that network — never silently fails. Uses existing `getValidLinkedInToken`, `getValidXToken`, and refreshes the TikTok token internally.
- **Inspirations API**:
  - GET /api/inspirations/news — fetches headlines (RSS+Atom parser, 10-min in-memory cache) from Google News (es-CL by default, configurable via `INSPIRATIONS_NEWS_FEEDS` env). Returns `{ items: [{ title, link, pubDate, source }] }`.
  - GET/POST/DELETE /api/inspirations/competitors — competitor list per user (table `competitors`: id, userId, platform, handle, displayName, lastFetchedAt).
  - GET /api/inspirations/competitors/:id/posts — pulls recent posts for a competitor (currently YouTube via channel RSS; other platforms are placeholders).

### Authentication
- Google OAuth 2.0 login via Passport.js
- Session-based auth with express-session (30-day cookie, rolling)
- Sessions stored in PostgreSQL via connect-pg-simple (table `session`, `createTableIfMissing: true`)
- Cookie config: `secure: NODE_ENV==="production"`, `sameSite: "lax"`, `trust proxy: 1`. Optional `COOKIE_DOMAIN` env var sets an explicit cookie domain (e.g. `.webmakerlatam.com`) to prevent proxy ambiguity.
- Only whitelisted emails can access (ALLOWED_ADMIN_EMAILS env var)
- Auth routes: GET /api/auth/google, GET /api/auth/google/callback, GET /api/auth/me, POST /api/auth/logout
- Google Calendar OAuth: GET /api/auth/google-calendar, GET /api/auth/google-calendar/callback — dedicated flow for `calendar.readonly` scope, independent of YouTube. Callback URL: GOOGLE_CALENDAR_CALLBACK_URL env var (must also be registered in Google Cloud Console as an authorized redirect URI).
- All /api routes except auth and health require authentication
- Callback URL: https://admin.webmakerlatam.com/api/auth/google/callback
- **Required deployment secrets**: `SESSION_SECRET` (random string ≥32 chars) — mandatory in production, server refuses to start without it. Generate with `openssl rand -base64 32`.

### Hardening (Task #53)
- **Rate limiting** (`artifacts/api-server/src/lib/rate-limit.ts`): Three named limiters (aiLimiter, publishLimiter, uploadLimiter) keyed by user id (fallback to IPv6-safe IP via `ipKeyGenerator`). Wired in `app.ts` via path-regex `app.use(...)` cubriendo todas las rutas costosas: AI (library templates ai-fill, content/videos generate-descriptions, content/videos bulk-generate-descriptions, content/hashtag-suggestions, analytics/insights, gemini conversations/:id/messages, gemini generate-image, gemini generate-cover, studio generate-ideas/generate-descriptions/cover-generator), publish (`/api/{youtube,tiktok,instagram,linkedin,x,facebook}/{upload,publish,upload-from-drive}`) y upload (studio chunk/preview/finalize, content import-csv). 429 responses include `Retry-After` y `retryAfterSeconds`.
- **Request ID**: `artifacts/api-server/src/lib/request-id.ts` adds an early middleware that honors an inbound `X-Request-Id` (validated regex) or generates a UUID v4, exposing `req.requestId` (typed via `Express.Request` augmentation) and echoing the id back as `X-Request-Id`.
- **Error monitoring (Sentry)**:
  - Backend: `artifacts/api-server/src/lib/sentry.ts` exposes `initSentry()` called from `index.ts` before app load. Inicializa con `release = SENTRY_RELEASE || REPLIT_DEPLOYMENT_ID`. App-level Express error handler in `app.ts` captures 5xx with tags `route`, `method`, `request_id` and user id. No-op when `SENTRY_DSN` is unset (logs status).
  - Frontend: `artifacts/admin-panel/src/lib/sentry.ts` initialised in `main.tsx`, con `<Sentry.ErrorBoundary>` envolviendo `<App />`. Inicializa con `release = VITE_SENTRY_RELEASE || VITE_APP_VERSION`. Wrapper de `window.fetch` lee `X-Request-Id` de cada respuesta y lo setea como tag `request_id`; `setSentryUser` se invoca desde `AuthLoader` cuando `useQuery(["auth-me"])` resuelve, y `RouteTracker` actualiza el tag `route` en cada cambio de `useLocation`. También captura `unhandledrejection`. No-op cuando `VITE_SENTRY_DSN` no está.
  - Required secrets to enable: `SENTRY_DSN` + opcional `SENTRY_RELEASE` (backend) y `VITE_SENTRY_DSN` + opcional `VITE_SENTRY_RELEASE` (frontend, build-time).
- **Tests** (Vitest, 45/45 verde): `pnpm --filter @workspace/api-server test`. Cubre handler-level real con DB+OpenAI mockeados: `/api/library/templates/ai-fill` (400 sin redes, 400 sin name/base, 200 con campos saneados, 200 recuperando JSON envuelto, 502 sin filtrar detalle del error) y `/api/content/hashtag-suggestions` (400/200/500). Rate-limit: AI dispara 429 con Retry-After contra `/api/content/hashtag-suggestions`, `/api/analytics/insights`, `/api/gemini/generate-image` y `/api/gemini/conversations/:id/messages`; publish dispara 429 contra `/api/youtube/publish`. Scheduler: dispatcher público `retryPlatformForVideo` retorna 'Video not found' y 'Unknown platform' en sus paths defensivos. **Cobertura del limiter como invariante** (`limiter-coverage.test.ts`, ~30 casos): parsea las regex reales de `app.ts` y verifica que cada endpoint costoso conocido (AI/publish/upload) matchee al limiter correspondiente y que rutas no costosas no matcheen, así agregar un endpoint nuevo sin cubrirlo rompe el suite. Más: brand-tone helper. Config: `artifacts/api-server/vitest.config.ts`.
- **DB backups (daily, off-host)**: `scripts/backup-db.sh` corre `pg_dump --no-owner --no-acl --clean --if-exists` contra `DATABASE_URL`, comprime con `gzip -9` a `BACKUP_DIR` (default `./backups`) y sube el dump off-host. **Destino primario: Google Drive** vía el conector `google-drive` ya instalado — set `BACKUP_DRIVE_FOLDER_ID` con el ID de una carpeta de Drive donde el conector tenga permiso de edición; el uploader (`scripts/src/upload-backup-drive.ts`, vía `@replit/connectors-sdk`) hace upload resumable en chunks de 256 KiB y a continuación rota (papelera) cualquier `webmaker-*.sql.gz` en esa carpeta más viejo que `BACKUP_RETENTION_DAYS` (default 7). **Destino alternativo: S3** — set `BACKUP_S3_URI=s3://bucket/path/` + `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_DEFAULT_REGION` y la rotación queda a cargo del lifecycle del bucket. Si ninguno de los dos está seteado el script imprime `WARN: no off-host destination configured`. En producción se recomienda setear `BACKUP_REQUIRE_OFFHOST=1` en el Scheduled Deployment: con ese flag, si ningún destino off-host tuvo éxito (no configurado o upload falló), el script hace `exit 1` y la corrida del cron queda marcada como fallida en lugar de pasar como falso positivo. Rotación local siempre activa: `find ... -mtime +RETENTION_DAYS -delete`. **Restore**: descargar el `webmaker-YYYYMMDD-HHMMSS.sql.gz` más reciente y correr `gunzip -c webmaker-...sql.gz | psql "$DATABASE_URL"` (el flag `--clean --if-exists` del dump dropea y recrea las tablas antes de restaurar). Verificación post-restore: `GET /api/health` o boot del admin-panel. **Programación productiva**: Replit Scheduled Deployment con comando `./scripts/backup-db.sh`, schedule `0 3 * * *`, secrets `DATABASE_URL` + `BACKUP_DRIVE_FOLDER_ID` (ó la triada AWS). Detalles paso a paso en `.replit.scheduled-deployments.md`. Smoke-tested local-only run produce `webmaker-<ts>.sql.gz` con la base actual.
- **TypeScript hardening (clean tsc)**: `pnpm --filter @workspace/api-server exec tsc --noEmit` is now clean. Eliminated `as any` casts on TikTok/Instagram/scheduler `res.json()` via typed shapes in `src/lib/{tiktok-types,platform-types}.ts`; replaced ad-hoc `(part: any) => part.text/inlineData` reads of Gemini response parts with the typed helpers in `src/lib/gemini-parts.ts` (`firstText`, `firstInlineData`). Aligned the `@opentelemetry/api` peer in `lib/db` so a single `drizzle-orm` instance resolves across the workspace (Sentry v8 was forking the resolution and producing 557 spurious type errors). Other fixes: instagram temp-serve `string|string[]`, library `youtubeTitle` Record extension, studio multer callback returns, auth test-login return paths, community sharp Buffer types and recurse `best` typing.
- **Follow-ups still open**: Provide `SENTRY_DSN`/`VITE_SENTRY_DSN` secrets to activate monitoring (#61); broaden test coverage to per-publisher integration paths (#63). Backups (#62): código + Scheduled Deployment doc listos; el usuario debe crear la carpeta de Drive (o bucket S3), setear `BACKUP_DRIVE_FOLDER_ID` (o `BACKUP_S3_URI`+credenciales) en los secrets del Scheduled Deployment y disparar la primera corrida manual desde la pestaña Deploy para confirmar que `[backup] done` aparece en logs y el archivo aparece en Drive/S3.

### Database Tables
- `users` - Authenticated admin users (Google OAuth, email whitelist, YouTube access/refresh tokens, TikTok open_id/access/refresh tokens, LinkedIn access/refresh tokens + personUrn/name/picture, X access/refresh tokens + userId/username)
- `conversations` - Gemini AI chat conversations
- `messages` - Chat messages within conversations  
- `videos` - Video content entries with cover images, scheduling, and Drive integration
- `video_ideas` - AI-generated video ideas for the recording studio with categories, scripts, and recording status
- `ideas` - Kanban notes for the Inicio page (title, description, kanbanStatus, kanbanOrder, scoped per user)
- `competitors` - Per-user competitor list for the inspirations panel (platform, handle, displayName, lastFetchedAt)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server with routes for health, OpenAI (via Gemini shim), Google Drive, and content management.

### `artifacts/admin-panel` (`@workspace/admin-panel`)
React + Vite admin panel. Dark mode professional UI with orange accents. All UI in Spanish.

### `lib/db` (`@workspace/db`)
Drizzle ORM with PostgreSQL. Tables: conversations, messages, videos.

### `lib/integrations-gemini-ai` (`@workspace/integrations-gemini-ai`)
OpenAI compatibility shim that exposes a Gemini-shaped API (`ai.models.generateContent`, `ai.models.generateContentStream`, `ai.images`) backed by OpenAI models (gpt-4.1, gpt-4.1-mini, gpt-image-1). Also exports `generateImage` helper for image generation with optional reference image (uses `images.edit`).

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI 3.1 spec with endpoints for health, gemini, drive, and content management.

### `lib/api-zod` (`@workspace/api-zod`)
Generated Zod schemas from OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)
Generated React Query hooks from OpenAPI spec.
