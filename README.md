# Celld + Hono

A **backend-only** starter for [Celld](https://github.com/denoland/celld) built with [Hono](https://hono.dev/). Use it for REST APIs, WebSockets, Durable Objects, Queues, Workflows and other Celld-native backend services. It deliberately does **not** ship a frontend.

## Sibling starters

| Starter | Purpose |
| --- | --- |
| **[celld-hono](https://github.com/chof64/celld-hono)** (this repository) | Backend APIs, stateful coordination, Durable Objects and service workers |
| **[celld-waku](https://github.com/chof64/celld-waku)** | Full-stack React: SSR, RSC, client components, Server Actions and API routes |

Both follow the [same shared architecture principles](./ARCHITECTURE.md#1-shared-architecture-principles), [Celld deployment runbook](./DEPLOY.md), env allowlist, `ENV_FILE` secret model and production workflow. They differ only where their framework responsibilities require it.

## Mental model

```text
Mobile / web / service client
            |
      REST / WebSocket
            v
        Hono Worker
          /     \
    Stateless    Durable Object
      logic      RPC / WebSocket
          \     /
         Celld fleet
```

Hono owns the public HTTP contract. Native Celld bindings and Durable Objects remain behind that boundary. Reusable domain functions can also be called by queues, workflows and scheduled handlers.

## Requirements

- Node.js 22+
- pnpm
- a current `celld` CLI on `PATH`

Production also needs access to the fleet object store through Celld's normal environment/credential configuration.

## API-only chat example

The starter includes a small chat backend for exercising Hono routing, Zod validation, Celld Durable Object RPC, SQLite, and WebSocket upgrades—**without bundling a UI**.

```text
GET  /api/rooms/:roomId/messages   Hono -> Room.listMessages() RPC
POST /api/rooms/:roomId/messages   Hono -> Room.sendMessage() RPC
GET  /api/rooms/:roomId/socket     Hono -> Room.fetch() WebSocket
```

### Run it

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Celld serves the API at `http://127.0.0.1:9876`:

```sh
curl http://127.0.0.1:9876/health
curl http://127.0.0.1:9876/api/rooms/lobby/messages
curl -X POST http://127.0.0.1:9876/api/rooms/lobby/messages \
  -H 'content-type: application/json' \
  -d '{"userName":"Ada","text":"Hello from Celld"}'
```

There is no homepage or SPA. For a web frontend, start with [celld-waku](https://github.com/chof64/celld-waku).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Alias for the backend Celld development runtime |
| `pnpm dev:celld` | Generate local Worker vars and run native Celld development |
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

## Hono route files (default)

The public API uses **one descriptively named TypeScript file per endpoint URL**, flat under `celld/http/routes/` by default. HTTP methods for the same URL live together. **Related route files may be grouped into subfolders** once the flat directory becomes hard to navigate. Unlike Next.js App Router, neither directories nor filenames determine URL paths.

```text
celld/http/
├── app.ts                   # Hono composition
└── routes/
    ├── health.ts            # GET /health
    ├── rooms.ts             # GET /api/rooms/:roomId
    ├── room-messages.ts     # GET/POST /api/rooms/:roomId/messages
    ├── room-socket.ts       # GET /api/rooms/:roomId/socket (WebSocket)
    └── room-params.ts       # shared path-parameter schema
```

Each endpoint file exports a small Hono sub-app that declares its **full public URL**. A parameter like `:roomId` is expressed in the Hono route path, not by creating a `[roomId]` directory. `room-messages.ts` contains both `GET` and `POST` because both methods use the same URL.

`celld/http/app.ts` imports the sub-apps and explicitly composes them with chained `.route("/", subApp)` calls. No auto-discovery or extra router is introduced; chaining preserves `AppType` inference for Hono's optional typed client.

To add `POST /api/rooms/:roomId/typing`, add `celld/http/routes/room-typing.ts` exporting a Hono sub-app with `.post("/api/rooms/:roomId/typing", ...)`, import it into `app.ts`, and add `.route("/", roomTypingRoute)`. Test the public endpoint in `tests/http.test.ts`. Keep shared HTTP validation in named schema files as needed and domain logic in reusable plain functions.

### Optional folders for related endpoints

When several related files make `routes/` unwieldy, group them by feature or resource **for source-code organization only**. For example, the flat `rooms.ts` and `room-*.ts` files could become:

```text
celld/http/
├── app.ts
└── routes/
    ├── health.ts
    └── room/
        ├── details.ts    # GET /api/rooms/:roomId (formerly rooms.ts)
        ├── messages.ts   # GET/POST /api/rooms/:roomId/messages
        ├── socket.ts     # GET /api/rooms/:roomId/socket
        └── params.ts     # shared validation
```

`app.ts` still imports and mounts **each endpoint module** directly. Only the import paths change:

```ts
import { roomRoute } from "./routes/room/details";
import { roomMessagesRoute } from "./routes/room/messages";
import { roomSocketRoute } from "./routes/room/socket";
```

Also adjust any relative schema imports (for example, `"./params"`). Keep the full public URLs declared in each route module and the chained `.route("/", ...)` composition in `app.ts` unchanged. **A `room/` folder does not create an `/room` URL prefix or auto-register routes.** Existing API URLs, Celld bindings, and tests should continue to behave the same; run `pnpm check` after the move. Do not add folders until grouping improves discoverability.

See [Hono's route grouping documentation](https://hono.dev/docs/api/routing#grouping-without-changing-base) and [typed-client route grouping](https://hono.dev/examples/grouping-routes-rpc).

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

A production deployment workflow is included at `.github/workflows/deploy.yml`. It runs on pushes to `main` and supports manual dispatch from `main`. Configure these values in the `production` GitHub Environment:

- Variables: `CELLD_VERSION`, `CELLD_BUCKET`, `AWS_REGION`, and `S3_ENDPOINT` when using S3-compatible storage (omit the endpoint for AWS S3).
- Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN`.
- Secret `ENV_FILE`: application runtime variables only.

Set `CELLD_VERSION` to the exact release tag used by the running Celld fleet, such as `v0.1.0`. The workflow requires it and installs that release. Keep it aligned when upgrading the fleet.

The `ENV_FILE` secret contains only application runtime values, for example:

```dotenv
GREETING=Hello from production
```

The workflow installs the pinned Celld release and runs `pnpm check` before materializing `ENV_FILE` as `.env`. It rejects fleet settings inside `ENV_FILE`, then passes the bucket settings and credentials directly to the dry-run and deploy processes. Deploys are serialized with workflow concurrency.

Only variables declared in `celld/env.ts` become Worker bindings. The fleet settings and credentials remain deploy-process environment variables and are not copied into the Worker.

See [DEPLOY.md](./DEPLOY.md#github-actions) for the full workflow contract and secret setup.

## Full-stack applications

Use [celld-waku](https://github.com/chof64/celld-waku) for pages, SSR, client components and Server Actions. It follows the same Celld runtime conventions, production `ENV_FILE` contract and infrastructure runbook. Waku API endpoints may access Celld bindings directly; when they need a separate stateful Durable Object implementation, communicate with this Hono Worker through an explicit service binding.

The default `wrangler.jsonc` intentionally retains its existing Worker name (`celld-boilerplate`) to avoid silently changing a deployed script or Durable Object identity merely because the repository was renamed. Choose a new Worker name **before a first deployment**, or plan an explicit migration for an existing one.

## Philosophy

This repository is intentionally not a framework on top of Celld.

It establishes a few conventions, then gets out of the way:

> Use Celld primitives directly. Use RESTful HTTP through Hono for the public API. Prefer native RPC for internal stateful calls. Keep business logic independent of transport. Keep deployment native. Add complexity only when a concrete requirement appears.
