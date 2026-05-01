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
- **Dashboard**: Overview of video content stats, quick actions, recent activity, YouTube/TikTok/Instagram/LinkedIn/X connection status cards
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
- **LinkedIn (UGC posts API)**: Text-only post publishing via the LinkedIn /v2/ugcPosts endpoint
  - OAuth 2.0 (OpenID Connect) with scopes `openid profile email w_member_social`
  - Routes: GET /api/linkedin/auth, GET /api/linkedin/callback, GET /api/linkedin/status, POST /api/linkedin/disconnect, POST /api/linkedin/publish/:videoId
  - Tokens (access/refresh + expiresAt + personUrn/name/picture) stored on the users table; auto-refresh helper `getValidLinkedInToken`
  - Free tier: ~100 posts/day. Image/video uploads (asset registration) skipped for MVP — text-only with the `linkedinDescription` field on videos
  - Redirect URI: https://admin.webmakerchile.com/api/linkedin/callback
- **X / Twitter (v2 tweets API)**: Text-only tweet publishing via OAuth 2.0 + PKCE confidential client
  - Scopes: `tweet.read tweet.write users.read offline.access`
  - Routes: GET /api/x/auth, GET /api/x/callback, GET /api/x/status, POST /api/x/disconnect, POST /api/x/publish/:videoId
  - Tokens (access/refresh + expiresAt + xUserId/xUsername) stored on the users table; auto-refresh helper `getValidXToken`
  - Free tier: 1500 posts/month. 280 char limit enforced in the wizard and at publish time (truncation safeguard)
  - Redirect URI: https://admin.webmakerchile.com/api/x/callback
- **Scheduler**: Runs every 60s in `artifacts/api-server/src/scheduler.ts`. For each video reaching its `scheduledAt`, it sequentially publishes to YouTube → TikTok → Instagram → LinkedIn → X (each step skipped when no per-platform description is configured). Sets `status = "published"` only when every requested step succeeds.

### Authentication
- Google OAuth 2.0 login via Passport.js
- Session-based auth with express-session (7-day cookie)
- Only whitelisted emails can access (ALLOWED_ADMIN_EMAILS env var)
- Auth routes: GET /api/auth/google, GET /api/auth/google/callback, GET /api/auth/me, POST /api/auth/logout
- All /api routes except auth and health require authentication
- Callback URL: https://admin.webmakerchile.com/api/auth/google/callback

### Database Tables
- `users` - Authenticated admin users (Google OAuth, email whitelist, YouTube access/refresh tokens, TikTok open_id/access/refresh tokens, LinkedIn access/refresh tokens + personUrn/name/picture, X access/refresh tokens + userId/username)
- `conversations` - Gemini AI chat conversations
- `messages` - Chat messages within conversations  
- `videos` - Video content entries with cover images, scheduling, and Drive integration
- `video_ideas` - AI-generated video ideas for the recording studio with categories, scripts, and recording status

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
