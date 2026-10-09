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

## 2. Source layout

```text
src/
  api/
    index.ts                Celld Worker entry and Durable Object exports
    app.ts                  Explicit Hono route registration
    env.ts                  Allowed Worker environment and bindings
    routes/
      health.ts
      room/                 Related REST and WebSocket routes
    durable-objects/
  pages/
    _layout.tsx             Waku static layout
    index.tsx               Build-time rendered home
    rooms/[roomId].tsx      Build-time paths for known demo rooms
  components/chat-app.tsx   Hydrated React client
  lib/                      Environment-neutral shared code
  waku.server.tsx           Waku static adapter
  styles.css
scripts/                    Celld env, dev, build and deployment helpers
waku.config.ts              Waku/Vite dev configuration
wrangler.jsonc              Hono Worker configuration
```

`src/api/` is **server-only**. `src/lib/` contains pure schemas/types and cross-platform operations; it must not import secrets, Worker bindings, Node-only or browser-only dependencies.

## 3. Routes and rendering

Hono routes use one descriptive file per endpoint URL, optionally grouped into folders. They define their full URL and are **explicitly mounted** in `src/api/app.ts`. The source filesystem doesn't change their public paths.

Waku pages are different: `src/pages/` **is** the file router. Pages and layouts render **statically by default**. A dynamic segment such as `rooms/[roomId].tsx` declares `staticPaths` to emit each known URL during `waku build`. The chat client is a `"use client"` component; it gets live data through Hono REST and WebSocket endpoints.

Waku server actions, dynamic API routes and per-request rendering are intentionally **not** supported in this static deployment. Request-time backend work belongs to Hono; we do not build or deploy a second Waku Worker.

## 4. Build and deployment

```sh
pnpm dev                # Hono + Waku dev when the frontend exists
pnpm dev:celld          # Hono only
pnpm dev:web            # Waku only
pnpm check              # API tests, Waku typecheck and static build
pnpm deploy             # Hono with optional static Waku files
```

The canonical `wrangler.jsonc` keeps `main: "./src/api/index.ts"` and the original Durable Object class/binding/migration identities. The deployment script detects the Waku entry and builds `dist/public`, then derives a temporary asset config containing:

```json
{
  "assets": {
    "directory": "./dist/public",
    "html_handling": "drop-trailing-slash",
    "run_worker_first": ["/api/*", "/health"]
  }
}
```

Celld serves prerendered HTML, JavaScript, CSS and **Waku RSC payloads** from that directory. Do not enable SPA fallback or publish raw `src/`: static pages need their real generated paths, and `src/api/` contains server code. Hono handles REST, WebSockets and every other nonstatic request.

Removing `src/waku.server.tsx` and `src/pages/` turns the starter into an API-only application. No mode flag, second Wrangler config, or second production Worker is required. Every Celld deploy replaces the application; removing the web source also removes its published assets.

## 5. Environment and persistence

`src/api/env.ts` defines the string variables allowed into the Worker; `scripts/env.ts` loads local `.env`. Production GitHub Actions uses the `ENV_FILE` secret, separate from Celld fleet/object-store credentials.

For Xicar, PlanetScale Postgres and application S3 remain authoritative. Durable Objects handle entity-local coordination and rebuildable state unless a feature deliberately establishes another persistence contract.

See [DEPLOY.md](./DEPLOY.md) for single-node/multi-node operation, upgrades and draining. The sibling [celld-waku](https://github.com/chof64/celld-waku) starter remains available for exploring dynamic SSR/RSC and Server Actions, but is not required for static Waku + Hono.
