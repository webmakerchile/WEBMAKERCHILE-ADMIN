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
- **Video Manager**: CRUD for video content organized by month/week/day/number
- **Cover Generator**: AI-powered cover image generation using Gemini 3.1 Pro with reference images
- **Google Drive Browser**: Browse and manage files in connected Google Drive folder
- **AI Chat**: Chat with Gemini for content ideas and planning
- **Schedule Manager**: Schedule videos for automatic publishing to Google Drive

### Integrations
- **Gemini AI**: Image generation (covers/portadas) and chat via Replit AI Integrations proxy
- **Google Drive**: File management via Replit Connectors SDK (folder: 1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB)

### Database Tables
- `conversations` - Gemini AI chat conversations
- `messages` - Chat messages within conversations  
- `videos` - Video content entries with cover images, scheduling, and Drive integration

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
