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
│   └── admin-panel/        # React + Vite admin panel (Content Admin Panel)
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
- **Generador de Comunidad**:
  - **Descripciones (Carruseles)**: Multi-slide carrusel generation with per-slide retry, ZIP download, granular regenerate controls
  - **Historias (Stories 9:16)**: Single frame ("única") or narrative series (2–5 frames). Series use role-based structure: 2=[hook,cta], 3=[hook,desarrollo,cta], 4=[hook,problema,solucion,cta], 5=[hook,contexto,problema,solucion,cta]. Each role has its own pose+visualHint and CTA style (microCTA "Sigue viendo" for intermediate frames, conversion CTA with WhatsApp for final). "Auto" mode calls OpenAI gpt-4.1 (`/community/historias/detectar-formato`) to recommend formato + cantidad based on the concept (e.g., "N tips" → N+2 frames). Frames are generated in parallel via `Promise.allSettled` so partial failures surface as per-frame retry buttons. UI shows carousel thumbnail strip with role labels, frame counter pill (N/Total) rendered top-right, ZIP download with textos.txt.

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
- Session-based auth with express-session (7-day cookie)
- Only whitelisted emails can access (ALLOWED_ADMIN_EMAILS env var)
- Auth routes: GET /api/auth/google, GET /api/auth/google/callback, GET /api/auth/me, POST /api/auth/logout
- All /api routes except auth and health require authentication
- Callback URL: https://admin.webmakerchile.com/api/auth/google/callback

### Hardening (Task #53)
- **Rate limiting** (`artifacts/api-server/src/lib/rate-limit.ts`): Three named limiters (aiLimiter, publishLimiter, uploadLimiter) keyed by user id (fallback to IPv6-safe IP via `ipKeyGenerator`). Wired in `app.ts` via path-regex `app.use(...)` to AI endpoints (templates ai-fill, generate-descriptions, hashtag-suggestions, analytics insights), publish endpoints (`/api/{youtube,tiktok,instagram,linkedin,x,facebook}/{upload,publish,upload-from-drive}`) and uploads (studio chunk/preview/finalize, content import-csv). 429 responses include `Retry-After` and `retryAfterSeconds`.
- **Request ID**: `artifacts/api-server/src/lib/request-id.ts` adds an early middleware that honors an inbound `X-Request-Id` (validated regex) or generates a UUID v4, exposing `req.requestId` (typed via `Express.Request` augmentation) and echoing the id back as `X-Request-Id`.
- **Error monitoring (Sentry)**:
  - Backend: `artifacts/api-server/src/lib/sentry.ts` exposes `initSentry()` called from `index.ts` before app load. App-level Express error handler in `app.ts` captures 5xx with tags `route`, `method`, `request_id` and user id. No-op when `SENTRY_DSN` is unset (logs status).
  - Frontend: `artifacts/admin-panel/src/lib/sentry.ts` initialised in `main.tsx`, con `<Sentry.ErrorBoundary>` envolviendo `<App />`. Wrapper de `window.fetch` lee `X-Request-Id` de cada respuesta y lo setea como tag `request_id`; `setSentryUser` se invoca desde `AuthLoader` cuando `useQuery(["auth-me"])` resuelve, y `RouteTracker` actualiza el tag `route` en cada cambio de `useLocation`. También captura `unhandledrejection`. No-op cuando `VITE_SENTRY_DSN` no está.
  - Required secrets to enable: `SENTRY_DSN` (backend) and `VITE_SENTRY_DSN` (frontend, build-time).
- **Tests** (Vitest, 10/10 verde): `pnpm --filter @workspace/api-server test`. Cubre rate-limit AI y publish (429 + Retry-After contra rutas reales), brand-tone helper, scheduler json-parsing/error paths con `fetch` mockeado, y un test handler-level real del router de library (`POST /api/content/hashtag-suggestions`) con DB y Gemini mockeados que valida 400 sin cuerpo, 200 con sugerencias saneadas + fallback de network, y 500 cuando el AI falla. Config: `artifacts/api-server/vitest.config.ts`.
- **DB backups**: `scripts/backup-db.sh` runs `pg_dump` against `DATABASE_URL`, gzips to `BACKUP_DIR` (default `./backups`), prunes files older than `BACKUP_RETENTION_DAYS` (default 7), and — when `BACKUP_S3_URI` is set and the `aws` CLI is available — uploads the dump off-host via `aws s3 cp`. Restore: `gunzip -c backups/webmaker-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"`. Programación productiva: configurar un Replit Scheduled Deployment con el comando `./scripts/backup-db.sh` y schedule `0 3 * * *` (instrucciones detalladas en `.replit.scheduled-deployments.md`).
- **TypeScript hardening (clean tsc)**: `pnpm --filter @workspace/api-server exec tsc --noEmit` is now clean. Eliminated `as any` casts on TikTok/Instagram/scheduler `res.json()` via typed shapes in `src/lib/{tiktok-types,platform-types}.ts`; replaced ad-hoc `(part: any) => part.text/inlineData` reads of Gemini response parts with the typed helpers in `src/lib/gemini-parts.ts` (`firstText`, `firstInlineData`). Aligned the `@opentelemetry/api` peer in `lib/db` so a single `drizzle-orm` instance resolves across the workspace (Sentry v8 was forking the resolution and producing 557 spurious type errors). Other fixes: instagram temp-serve `string|string[]`, library `youtubeTitle` Record extension, studio multer callback returns, auth test-login return paths, community sharp Buffer types and recurse `best` typing.
- **Follow-ups still open**: Provide `SENTRY_DSN`/`VITE_SENTRY_DSN` secrets to activate monitoring (#61); add a managed cron + production storage destination for the backup script (#62); broaden test coverage to per-publisher integration paths (#63).

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
