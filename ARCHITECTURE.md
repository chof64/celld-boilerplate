# Architecture

This document defines the architecture standard implemented by this boilerplate.

The goal is a small, opinionated **API-first** Celld application shape with sensible defaults for development and production. It can optionally ship a client-side SPA, but the frontend build is optional. It is intentionally not a framework on top of Celld.

## 1. Shared architecture principles

These principles are intentionally **identical in both Celld starters**. When changing a shared convention, update both repositories together; framework-specific sections below may differ.

1. **Celld is the execution and deployment runtime.** Use its supported Workers, Durable Objects, service bindings, Queues, Workflows, Cron, KV, D1, and R2 surfaces directly instead of inventing a Celld SDK.
2. **Keep framework conventions native.** Hono owns API-first HTTP routes; it can serve a static Waku frontend without running a Waku server in production. The standalone Waku starter focuses on SSR, Server Components, API routes, and Server Actions. Do not implement a competing router.
3. **Use an explicit public contract.** RESTful HTTP is the default for mobile clients, webhooks, integrations, and shared APIs. Waku Server Actions are suitable for application UI mutations, not a replacement for external API contracts.
4. **Give stateful entities a clear owner.** Durable Objects coordinate entity-local work. Prefer native Durable Object RPC for method calls when available; use `fetch()` for HTTP or WebSocket semantics. Waku can reach a separate Hono/DO Worker through a service binding.
5. **Keep business logic independent of transport.** HTTP routes, Server Actions, Queues, Workflows, and Durable Objects should delegate reusable domain operations to plain modules, rather than duplicating rules.
6. **Validate and authorize at every trust boundary.** Use Zod as the default schema implementation and Standard Schema where a framework provides a compatible integration. Treat Server Actions as public server entrypoints.
7. **Make state ownership explicit.** For Xicar, PlanetScale Postgres and application S3 remain authoritative; Celld coordination/cache state is rebuildable unless a feature deliberately establishes a different persistence contract.
8. **Use one canonical root `wrangler.jsonc`.** It declares binding identities and entrypoints but contains no production secrets. Do not add separate development, staging, or production Wrangler files by default.
9. **Separate application variables from fleet credentials.** A source-local Worker environment module declares the application allowlist; `.env` supplies local values, and process variables override it. CI supplies application values via `ENV_FILE`; Celld bucket, node, and storage credentials remain process/infrastructure settings.
10. **Keep the Celld commands native and visible.** Project scripts may prepare environment and build artifacts, but `celld dev` and `celld deploy` own execution and publication. Do not deploy to Celld with `wrangler deploy`.
11. **Standardize operations across both starters.** Use the same production GitHub Environment contract, pinned `CELLD_VERSION`, serialized deploys, dry-run before publish, and the same single-node/multi-node/upgrade runbook.
12. **Protect persistent identities.** Treat Worker names, Durable Object class and binding names, migration tags, service bindings, and storage identities as schema. Append migrations intentionally; do not casually rename live resources.
13. **Keep the baseline small.** Development and production are the only default modes. Add optional feature folders, framework libraries, state stores, extra environments, and runtime bindings only when needed.

### Sibling starters

| Repository | Primary purpose | Routing and runtime boundary |
| --- | --- | --- |
| [`chof64/celld-hono`](https://github.com/chof64/celld-hono) | API-first with optional static Waku frontend | Hono REST/WebSocket APIs, Durable Objects, pre-rendered Waku pages and React clients |
| [`chof64/celld-waku`](https://github.com/chof64/celld-waku) | Server-rendered React full-stack applications | Waku pages, RSC/SSR, client components, Server Actions and API routes |

They share **deployment, environment, security, and architectural principles**, not identical framework source code. Hono's optional web client does not change its API-first contract; API-only derivatives can remove browser entrypoints and prune frontend dependencies. They may coexist as separate Worker scripts **only when composed into one Celld application deployment**, connected by service bindings. Independently deploying each starter to the same fleet replaces its current application; it does not merge scripts.

## 2. Project layout

```text
src/
  api/
    index.ts                  Worker entry, Durable Object exports
    app.ts                    Explicit Hono route composition
    routes/
      health.ts
      room/
        details.ts
        messages.ts
        socket.ts
        params.ts
    durable-objects/room.ts
  lib/chat.ts                 Portable contracts and pure helpers
  app.tsx                     Optional browser React UI
  main.tsx                    Optional browser entry
  styles.css
scripts/                       Dev/deploy helpers
src/api/env.ts                 Worker binding types and env allowlist
index.html                    Optional browser entry
vite.config.ts                Optional client dev/build config
wrangler.jsonc                Canonical Worker config
```

There is **one root package**. Remove `index.html` and `src/main.tsx` for an API-only project; `pnpm dev`, `pnpm check`, and `pnpm deploy` will skip the browser. Frontend dependencies can also be pruned from an API-only derivative.

## 3. Source boundaries

- **`src/api/` — server only.** Hono handlers, Durable Objects, bindings, and privileged logic live here. The Celld Worker entry is `src/api/index.ts`.
- **`src/lib/` — portable shared code.** Types, validation schemas, and pure functions may be imported by both browser and Worker code. Never import secrets, `cloudflare:workers`, Node modules, or browser globals here.
- **Top-level `src/` — optional React.** A client-side SPA that calls the same REST/WebSocket endpoints as Flutter and other clients. It never imports from `src/api/`.

## 4. Hono routing convention

Use **one descriptively named file per endpoint URL**, with all its HTTP methods together. Group related files into a folder when useful, such as `routes/room/`. This is **not filesystem routing**: route handlers define full public URLs themselves, and `src/api/app.ts` imports and registers each sub-app explicitly with `.route("/", subApp)`.

```ts
// src/api/app.ts
export const app = new Hono<{ Bindings: Env }>()
  .route("/", healthRoute)
  .route("/", roomRoute)
  .route("/", roomMessagesRoute)
  .route("/", roomSocketRoute);
```

HTTP handlers validate input using Zod + Standard Schema. Use Durable Object RPC for internal methods and `fetch()` for WebSocket upgrades. The included chat is a reference example, not a production messaging service.

## 5. Development and deployment

```sh
pnpm install --frozen-lockfile
pnpm dev                  # Celld, plus Vite when browser entrypoints exist
pnpm check                # API tests + optional browser checks/build
pnpm deploy -- --dry-run
pnpm deploy
```

For separate processes, use `pnpm dev:celld` (port 9876) or `pnpm dev:web` (port 5173). Vite proxies `/api` and WebSocket connections to Celld.

The only hand-maintained Wrangler config is root `wrangler.jsonc`. For the optional frontend, deployment generates a temporary config with `assets.directory = "./dist"`, SPA fallback, and Worker-first routes for `/api/*` and `/health`. **Never publish `src/` as static assets:** it contains private `src/api/` source. Only the compiled Vite `dist/` is public.

The Worker name, Durable Object binding, class, and migration tags must stay stable across deployments. Removing the browser and redeploying removes its assets; one fleet requires one composed application publisher.

## 6. Environment and persistence

`src/api/env.ts` lists application variables that may reach the Worker. `.env` supplies local values; production GitHub Actions uses the `ENV_FILE` secret. Node/fleet/object-store credentials are **never** copied into Worker variables.

For Xicar, PlanetScale Postgres and application S3 are the long-lived authorities. The example room's Durable Object SQLite demonstrates coordination and a bounded chat history; it does not establish authoritative business-data storage.

Use [DEPLOY.md](./DEPLOY.md) for fleet topology, environment setup, node draining and upgrades. Use [SYNC.md](./SYNC.md) to keep common conventions aligned with [celld-waku](https://github.com/chof64/celld-waku), which is optimized for server-rendered React instead of API-first clients.
