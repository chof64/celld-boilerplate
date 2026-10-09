# Celld + Hono + Waku

An **API-first Celld starter** with Hono for REST/WebSockets/Durable Objects and **optional static Waku** for React pages. The browser, mobile apps and integrations all use the same Hono endpoints.

Waku lives at the project root, uses `src/pages/` for file-based routing, and **pre-renders every web page at build time**. No Waku server is deployed: Hono remains the only production Worker.

## Layout

```text
src/
  api/
    index.ts                  Celld Worker and DO exports
    app.ts                    Explicit Hono route registration
    routes/
      health.ts
      room/                   Related Hono routes
    durable-objects/
    env.ts                    Worker bindings
  pages/
    _layout.tsx               Static Waku layout
    index.tsx                 Static homepage
    rooms/[roomId].tsx        Static paths for demo rooms
  components/chat-app.tsx     Interactive React client
  lib/                        Shared pure modules
  waku.server.tsx             Waku static build entry
  styles.css
scripts/                      Dev, build and deploy helpers
waku.config.ts                Waku/Vite development configuration
wrangler.jsonc                Canonical Hono Worker config
package.json
```

**Boundaries:** `src/api/` is server-only. `src/lib/` must remain environment-neutral. `src/pages/` belongs to Waku; `src/api/routes/` belongs to Hono. Waku page URLs follow the file structure; Hono URLs are declared and registered explicitly in `src/api/app.ts`.

## Development

Requires Node.js 22.15+, pnpm, and the Celld CLI.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:celld
pnpm dev
```

Run the two dev servers in separate terminals:

- **http://127.0.0.1:3000** — Waku frontend with hot reload
- **http://127.0.0.1:9876** — Celld/Hono REST and WebSocket backend

Waku's development server proxies `/api/*` and `/health` to Hono, including WebSocket upgrades.

For a backend-only derivative, remove `src/waku.server.tsx` and `src/pages/`, leaving `src/api/` in place, and prune the web scripts and frontend dependencies. No deployment flag is needed.

## Build and deploy

```sh
pnpm check
pnpm deploy -- --dry-run
pnpm deploy
```

If Waku pages exist, `pnpm deploy` runs `waku build` and adds the generated `dist/public` assets to the **same Celld application** as the Hono Worker. Without Waku pages, it deploys only Hono.

Static output includes prerendered HTML, client bundles **and Waku RSC payloads**. Celld serves these files as emitted. We deliberately **do not use SPA fallback**, and only compiled `dist/public` is published, never `src/api/` or other source code.

Static pages run server-side during the **build**, not per request. Dynamic route parameters need `staticPaths`, as demonstrated by the room pages. Browser interactions and dynamic data use normal Hono REST/WebSocket endpoints. Request-time Waku SSR, Server Actions and Waku API handlers are **not** part of this static-only deployment.

## Example

The chat has three static pages (`/`, `/rooms/drivers`, and `/rooms/dispatch`), while its room messages are live:

```sh
curl http://127.0.0.1:9876/api/rooms/lobby/messages
```

The Hono Room Durable Object handles SQLite-backed example history and WebSocket broadcasts. This is an **unauthenticated demo**, not production messaging.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for project conventions and [DEPLOY.md](./DEPLOY.md) for production fleet setup, secrets, upgrades and draining.
