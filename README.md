# Celld + Hono

An **API-first** [Celld](https://github.com/denoland/celld) starter with [Hono](https://hono.dev/), Durable Objects and an optional client-side React app. Web, mobile and other clients use the same REST and WebSocket endpoints.

Use [celld-waku](https://github.com/chof64/celld-waku) instead when you need React SSR, RSC or Server Actions. Both starters share [architecture principles](./ARCHITECTURE.md#1-shared-architecture-principles) and [deployment conventions](./SYNC.md).

## Structure

```text
src/
  api/
    index.ts                     Celld Worker entry
    app.ts                       Hono route registration
    routes/
      health.ts
      room/
        details.ts               GET /api/rooms/:roomId
        messages.ts              GET/POST /api/rooms/:roomId/messages
        socket.ts                WebSocket /api/rooms/:roomId/socket
        params.ts
    durable-objects/room.ts
  lib/chat.ts                    Shared, browser-safe types and helpers
  app.tsx                        Optional React chat example
  main.tsx                       Optional client entry
  styles.css
celld/
  env.ts                         Worker bindings and env allowlist
  scripts/                       Development and deployment helpers
index.html                       Optional web entry
vite.config.ts                   Vite and local API proxy
wrangler.jsonc                   One canonical Celld config
```

**`src/api/` is server-only; `src/lib/` is portable.** Files under `src/api/routes/` are grouped for organization, not automatic URL discovery. Each Hono handler defines its full path, and `src/api/app.ts` explicitly registers it.

## Start

Requires Node.js 22.15+, pnpm and the Celld CLI.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

With the React example present, `pnpm dev` starts Celld at **http://127.0.0.1:9876** and Vite at **http://127.0.0.1:5173**. Vite proxies `/api` and WebSocket requests to Hono.

Remove `index.html` and `src/main.tsx` for an **API-only** application. The same `pnpm dev` then starts only Celld; `pnpm check` and `pnpm deploy` skip the frontend. No deployment flag or extra `web/` package is needed.

For separate processes, use `pnpm dev:celld` and `pnpm dev:web`.

## Chat example

The minimal chat uses REST for history and sending messages, plus a Room Durable Object for WebSocket broadcasts and local SQLite history.

```sh
curl http://127.0.0.1:9876/api/rooms/lobby/messages
```

The sample is unauthenticated. Add identity, authorization, abuse controls, and authoritative storage before building production messaging on it.

## Deploy

```sh
pnpm check
pnpm deploy -- --dry-run
pnpm deploy
```

Deployment **automatically builds and includes the frontend** when its entrypoints exist. Celld serves only the compiled `dist/` assets—not raw `src/`, which contains backend code. With no frontend, only Hono and Durable Objects deploy. Removing frontend source and redeploying removes its previously published assets.

GitHub Actions uses `ENV_FILE` for allowlisted application variables; fleet/object-store credentials stay separate. See [DEPLOY.md](./DEPLOY.md) for production nodes, secrets, draining and upgrades, and [ARCHITECTURE.md](./ARCHITECTURE.md) for conventions.
