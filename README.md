# Celld Boilerplate

An opinionated starting point for building applications on [Celld](https://github.com/denoland/celld) with [Hono](https://hono.dev/).

The project keeps the public API simple:

- **Celld** is the runtime and provides Workers, Durable Objects, Queues, Workflows, Cron, KV, D1, R2, and other bindings.
- **Hono** is the public HTTP/WebSocket gateway.
- **Durable Objects** own stateful entities and long-lived coordination.
- **RESTful HTTP through Hono** is the default public API for web, mobile, and other clients.
- **Native Celld RPC** is preferred for internal method-style calls to Durable Objects.
- **Hono's typed client** is optional convenience for TypeScript consumers; it does not define the public API contract.
- **Zod + Standard Schema** validate untrusted HTTP input.
- **Native `celld dev` and `celld deploy`** remain visible rather than being hidden behind a custom framework.

For the complete design and the reasoning behind it, read [ARCHITECTURE.md](./ARCHITECTURE.md). For production node setup, application deployment, scaling, and Celld runtime upgrades, read [DEPLOY.md](./DEPLOY.md).

## Mental model

```text
Web / mobile client
        |
        | HTTPS / WebSocket
        v
Public Celld Worker
        |
        v
      Hono
   /           \
REST         WebSocket upgrade
  |               |
  | native RPC    |
  v               v
      Durable Objects
      state + coordination
```

Clients talk to the public Worker. The Worker authenticates, validates, and routes requests. Durable Objects remain an application-internal capability reached through Celld bindings.

For normal stateful operations, Hono translates the public HTTP request into a native Durable Object RPC call. For a WebSocket, Hono handles the initial public route and forwards the upgrade to the selected Durable Object; Celld then carries the socket to the object.

## Requirements

- Node.js 22+
- pnpm
- a current `celld` CLI on `PATH`

Production also needs access to the fleet object store through Celld's normal environment/credential configuration.

## Chat demo

The repository includes a small single-page chat application inspired by `chof64/chat-app`. It is intentionally simple so the runtime architecture stays visible.

The demo uses:

```text
Browser
  |
  +-- GET /api/rooms/:roomId/messages
  |      REST -> Hono -> Room.listMessages() RPC -> Durable Object SQLite
  |
  +-- POST /api/rooms/:roomId/messages
  |      REST -> Hono -> Room.sendMessage() RPC -> SQLite + broadcast
  |
  +-- GET /api/rooms/:roomId/socket
         WebSocket -> Hono -> Room.fetch() -> Durable Object
```

The WebSocket is only for realtime delivery. Message creation and history remain ordinary REST endpoints.

### Run it

```bash
pnpm install
cp .env.example .env
```

Start Celld, which serves both the SPA and API from one local origin:

```bash
pnpm dev:celld
```

Open `http://localhost:9876`.

You can also exercise the REST API directly:

```bash
curl http://127.0.0.1:9876/api/rooms/lobby/messages
```

```bash
curl -X POST http://127.0.0.1:9876/api/rooms/lobby/messages \
  -H 'content-type: application/json' \
  -d '{"userName":"Ada","text":"Hello from Celld"}'
```

In production, Celld serves the same files from `src/` as static assets and sends `/api/*` and `/health` to the Worker first. The SPA and API can therefore live on one origin without production CORS configuration.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:celld` | Generate local Worker vars and run Celld with the SPA and API |
| `pnpm typecheck` | Type-check the boilerplate |
| `pnpm test` | Run tests |
| `pnpm check` | Run type-checking and tests |
| `pnpm deploy` | Prepare runtime vars and run native `celld deploy` |

To intentionally reset local Celld state, use Celld directly:

```bash
celld dev . --clean
```

## Public API: REST first

The default client contract is an ordinary RESTful HTTP API:

```text
GET  /api/rooms/:roomId
GET  /api/rooms/:roomId/messages
POST /api/rooms/:roomId/messages
```

Web, native mobile, third-party clients, scripts, and services can call these endpoints with any standard HTTP client. A client does not need Hono-specific packages.

For TypeScript projects, Hono's typed client may be used as an optional convenience over those same REST routes:

```ts
import { hc } from "hono/client";
import type { AppType } from "./celld/http/app";

const api = hc<AppType>("https://api.example.com");

const response = await api.api.rooms[":roomId"].$get({
  param: { roomId: "demo" },
});
```

The REST endpoint remains the contract. The Hono client only adds compile-time convenience for TypeScript consumers and should not drive the API design.

Inside the Worker, Hono routes may then use native Celld bindings/RPC to reach stateful Durable Objects.

## Environment variables

Application runtime variables belong in `.env`. The committed templates are:

- `.env.example` for development
- `.env.prod.example` for the production contract

The process environment overrides `.env`.

Only variables declared in `celld/env.ts` are exposed to the Worker. This prevents unrelated host, CI, or fleet credentials from accidentally becoming Worker variables.

Celld infrastructure variables such as `CELLD_BUCKET`, `S3_ENDPOINT`, cloud credentials, node addresses, and fleet tuning do **not** belong in the application env templates. They are supplied by the deployment/runtime environment directly to Celld.

## Production

```bash
pnpm deploy
```

The deployment wrapper:

1. resolves the application environment,
2. validates the Worker environment contract,
3. creates a temporary root `.wrangler.deploy.jsonc`,
4. injects only allowed Worker variables,
5. invokes native `celld deploy --config .wrangler.deploy.jsonc`,
6. removes the temporary file when finished.

Fleet configuration and object-store credentials are inherited by the Celld process. The project does not assume a CI system, secrets manager, cloud, or hosting platform.

You can pass native Celld deploy flags through the wrapper:

```bash
pnpm deploy -- --dry-run
```

### GitHub Actions

A production deployment workflow is included at `.github/workflows/deploy.yml`. It runs on pushes to `main` and supports manual dispatch.

Add one GitHub Actions secret named `ENV_FILE` containing the complete deploy-time environment file:

```dotenv
CELLD_VERSION=v0.0.1
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
AWS_REGION=auto
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

GREETING=Hello from production
```

The workflow materializes that secret as `.env`, installs Celld, runs `pnpm check`, performs a deployment dry run, and then deploys once to the fleet. Deploys are serialized with workflow concurrency.

Only variables declared in `celld/env.ts` become Worker bindings. Fleet credentials remain deploy-process environment variables and are not copied into the Worker.

See [DEPLOY.md](./DEPLOY.md#github-actions) for the full workflow contract and secret setup.

## Using this in a frontend repository

This boilerplate keeps Celld code under `celld/` and the example frontend under `src/`.

The included SPA uses browser-native modules so the same files can be served directly by Celld in production. A real project can replace `src/` with any frontend framework and point the root Wrangler asset directory at that framework's build output.

In a mixed project with a framework-based frontend:

```text
pnpm dev          -> frontend framework
pnpm dev:celld    -> Celld
```

The included browser-native SPA needs no separate frontend dev server. Celld serves it from `src/` in local development and production. A framework-based frontend can use its own dev server with a proxy for API and WebSocket paths, while its production build can be served by Celld from the configured asset directory.

## Philosophy

This repository is intentionally not a framework on top of Celld.

It establishes a few conventions, then gets out of the way:

> Use Celld primitives directly. Use RESTful HTTP through Hono for the public API. Prefer native RPC for internal stateful calls. Keep business logic independent of transport. Keep deployment native. Add complexity only when a concrete requirement appears.
