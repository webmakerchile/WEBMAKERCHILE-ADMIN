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
- **AI**: Gemini AI via Replit AI Integrations (gemini-2.5-flash for chat, gemini-2.5-flash-image for image generation)
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
- **Dashboard**: Overview of video content stats, quick actions, recent activity
- **Video Manager**: Guided step-by-step wizard for the editor to complete each video without leaving the page. Steps: Basic Info → Cover (AI generation) → TikTok & Instagram descriptions → YouTube title & description → Review & Schedule to all 3 platforms. Each video shows progress percentage. DB includes per-platform status fields (tiktokStatus, instagramStatus, youtubeStatus) ready for API integration.
- **Cover Generator**: AI-powered cover image generation using Gemini with reference images
- **Google Drive Browser**: Browse and manage files in connected Google Drive folder
- **Estudio de Trabajo (Recording Studio)**: Full video content creation workspace
  - AI idea generation by category (Corto Viral, Problema/Solución, Marketing, Historia, Educativo, Behind the Scenes, Opinión, Pack del Día)
  - Video ideas queue with filtering, marking as recorded, bulk operations
  - Auto-creates video in Gestor de Videos when marking ideas as recorded, with automatic AI cover generation using reference image
  - Teleprompter with speed control, mirror mode, fullscreen, font size adjustment
  - Camera recording with pause/resume, camera switching, mirror, timer, video preview/download
  - Recording stats dashboard
- **Schedule Manager**: Schedule videos for automatic publishing to Google Drive

### Integrations
- **Gemini AI**: Image generation (covers/portadas) with reference image support via Replit AI Integrations proxy
  - Reference image for covers: `artifacts/api-server/assets/reference-cover.jpg` (fox mascot, flat vector art style)
  - All cover generations automatically use this reference image for consistent branding
- **Google Drive**: File management via Replit Connectors SDK (folder: 1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB)
- **YouTube Data API v3**: Video upload to YouTube via googleapis package
  - OAuth scopes: youtube.upload, youtube
  - User tokens (access + refresh) stored in users table
  - Routes: GET /api/youtube/channel, POST /api/youtube/upload/:videoId, GET /api/youtube/status/:videoId
  - Videos are uploaded as "private" by default with Shorts-optimized metadata
  - Auto-upload during schedule/check queue processing when youtubeStatus is "scheduled"
  - Dashboard shows YouTube channel connection status
- **TikTok Login Kit + Content Posting API** (sandbox mode):
  - OAuth v2 flow: GET /api/tiktok/auth → TikTok authorize → GET /api/tiktok/callback
  - Token exchange via POST https://open.tiktokapis.com/v2/oauth/token/
  - Scopes: user.info.basic, video.publish
  - User tokens (access + refresh + open_id) stored in users table
  - Content Posting: POST /api/tiktok/upload/:videoId (FILE_UPLOAD chunked method)
  - Videos published as SELF_ONLY (private) via /v2/post/publish/video/init/
  - Routes: GET /api/tiktok/status, POST /api/tiktok/disconnect, POST /api/tiktok/publish-status/:videoId
  - Dashboard shows TikTok connection card with connect/disconnect
  - StepReview has TikTok upload button alongside YouTube upload
  - Redirect URI: https://admin.webmakerchile.com/api/tiktok/callback

### Authentication
- Google OAuth 2.0 login via Passport.js
- Session-based auth with express-session (7-day cookie)
- Only whitelisted emails can access (ALLOWED_ADMIN_EMAILS env var)
- Auth routes: GET /api/auth/google, GET /api/auth/google/callback, GET /api/auth/me, POST /api/auth/logout
- All /api routes except auth and health require authentication
- Callback URL: https://admin.webmakerchile.com/api/auth/google/callback

### Database Tables
- `users` - Authenticated admin users (Google OAuth, email whitelist, YouTube access/refresh tokens, TikTok open_id/access/refresh tokens)
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
Express 5 API server with routes for health, Gemini AI, Google Drive, and content management.

### `artifacts/admin-panel` (`@workspace/admin-panel`)
React + Vite admin panel. Dark mode professional UI with orange accents. All UI in Spanish.

### `lib/db` (`@workspace/db`)
Drizzle ORM with PostgreSQL. Tables: conversations, messages, videos.

### `lib/integrations-gemini-ai` (`@workspace/integrations-gemini-ai`)
Gemini AI integration with client, image generation, and batch processing utilities.

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI 3.1 spec with endpoints for health, gemini, drive, and content management.

### `lib/api-zod` (`@workspace/api-zod`)
Generated Zod schemas from OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)
Generated React Query hooks from OpenAPI spec.
