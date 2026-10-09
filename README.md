# Celld + Hono

An **API-first, optionally full-stack** starter for [Celld](https://github.com/denoland/celld) and [Hono](https://hono.dev/). Hono exposes stable REST and WebSocket APIs for browser, Flutter/mobile and other consumers. When browser code is present under `src/`, the same repository also builds and deploys a client-side React/Vite application—without a separate `web/` package or deployment switch.

Choose [celld-waku](https://github.com/chof64/celld-waku) instead when **React SSR, React Server Components and Server Actions** are central to the application. Both starters maintain the same [architecture principles](./ARCHITECTURE.md#1-shared-architecture-principles), [deployment runbook](./DEPLOY.md), [synchronization contract](./SYNC.md), environment handling and Celld operations.

## Layout

```text
src/
  api/
    index.ts                   Celld Worker + Durable Object exports
    app.ts                     Hono route registration
    routes/
      health.ts
      room/
        details.ts             GET /api/rooms/:roomId
        messages.ts            GET/POST /api/rooms/:roomId/messages
        socket.ts              WebSocket /api/rooms/:roomId/socket
        params.ts
    durable-objects/room.ts
  lib/
    chat.ts                    Pure message types and browser-safe helpers
  app.tsx                      Optional React client
  main.tsx                     Optional browser entrypoint
  styles.css
celld/
  env.ts                       Worker bindings and variable allowlist
  scripts/                     Celld dev, build and deploy helpers
index.html                     Optional frontend entry
vite.config.ts                 Optional React/Vite dev configuration
tsconfig.web.json              Optional frontend TypeScript configuration
package.json                   Single package
wrangler.jsonc                 Canonical Worker configuration
```

The **seam** is deliberate: `src/api/` is server-only, `src/lib/` is safe to import from both server and browser code, and root `src/` files render the optional frontend. Shared modules must not import secrets, Worker bindings, privileged logic or browser-only globals.

`src/api/routes/` is organized by files and optional related-resource folders. This is **not** Next.js filesystem routing: URL paths are declared inside Hono handlers and the handlers are explicitly registered in `src/api/app.ts`. Folder names never implicitly change HTTP routes.

## Development

Requires Node.js 22.15+, pnpm, and a Celld CLI available on `PATH`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

With the reference React chat present, `pnpm dev` starts **Celld on http://127.0.0.1:9876** and **Vite on http://127.0.0.1:5173**. Vite proxies `/api/*`, `/health` and WebSocket upgrades to Hono. The browser never needs its own duplicate domain API.

Without a browser entrypoint, the same `pnpm dev` starts only Celld. For individual processes, use `pnpm dev:celld` or `pnpm dev:web`.

### Chat example

The example demonstrates a Room Durable Object with SQLite-backed history, native RPC and WebSocket broadcasts. The optional React chat loads and sends messages through the **same REST API** used by mobile clients:

```text
GET  /health
GET  /api/rooms/:roomId
GET  /api/rooms/:roomId/messages
POST /api/rooms/:roomId/messages
GET  /api/rooms/:roomId/socket      WebSocket upgrade
```

To try the API independently:

```sh
curl http://127.0.0.1:9876/api/rooms/lobby/messages
```

For TypeScript consumers, Hono's typed client is optional:

```ts
import { hc } from "hono/client";
import type { AppType } from "./src/api/app";

const api = hc<AppType>("https://api.example.com");
const response = await api.api.rooms[":roomId"].$get({
  param: { roomId: "lobby" },
});
```

The public REST paths—not the typed client—remain the interoperable contract.

## Commands

| Command | Behavior |
| --- | --- |
| `pnpm dev` | Celld API, plus Vite automatically when the frontend exists |
| `pnpm dev:celld` | Start only the Hono/Celld backend |
| `pnpm dev:web` | Start only Vite (requires a frontend) |
| `pnpm typecheck` / `pnpm test` | Check backend and shared contracts |
| `pnpm check` | Backend tests; typecheck and build the frontend if present |
| `pnpm build:web` | Compile frontend to `dist/` |
| `pnpm deploy` | Deploy Hono, automatically including compiled frontend when present |

To intentionally clear local Celld state, invoke `celld dev . --clean` directly.

## Deployment

```sh
pnpm deploy -- --dry-run
pnpm deploy
```

A browser app is detected by root `index.html` and `src/main.tsx`. When these files exist, the deploy script builds Vite and publishes **only compiled `dist/` assets** with SPA fallback and Hono-first routing under `/api/*`. If no browser entrypoint exists, it deploys only the Worker/DO code. An incomplete frontend fails explicitly.

**Never use `src/` as the static asset directory:** it contains the private server implementation under `src/api/`. The canonical `wrangler.jsonc` has no `assets` field. When a browser app exists, the wrapper derives an ignored temporary asset configuration while preserving Worker name, DO binding and migration identities.

Each deploy replaces the current Celld application. Removing the frontend and redeploying intentionally removes previously published SPA assets. A fleet hosting Hono and Waku together must use **one composed deployment pipeline**, not two independent publishers.

The included GitHub Actions workflow keeps `ENV_FILE` for app-only `KEY=value` secrets, and requires Celld bucket and infrastructure credentials separately in the production GitHub Environment. It uses the same `pnpm check` and `pnpm deploy` commands regardless of frontend presence. React/Vite dependencies are now part of the root package; the single root lockfile covers Hono and the optional React/Vite app.

Read [WEB.md](./WEB.md) for the detailed source rules, local and production checks, and [DEPLOY.md](./DEPLOY.md) for single-node/multi-node fleet operations, upgrades and secrets.

## Philosophy

Keep the public Hono API stable across browser and mobile clients, use Celld-native bindings for stateful work, share only browser-safe code through `src/lib/`, and avoid adding custom routing or deployment abstraction layers. The frontend is optional; API compatibility is not.
