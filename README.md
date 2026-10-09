# Celld + Hono

An **API-first** [Celld](https://github.com/denoland/celld) starter built with [Hono](https://hono.dev/). Build REST APIs, WebSockets, Durable Objects, Queues and Workflows for browser, mobile and service clients. Optionally bundle a **client-side React/Vite SPA** with the **same** Celld application—without making frontend tooling mandatory.

## Sibling starters

| Starter | Purpose |
| --- | --- |
| **[celld-hono](https://github.com/chof64/celld-hono)** (this repository) | API-first, optional client-side web SPA; ideal for shared web/mobile APIs |
| **[celld-waku](https://github.com/chof64/celld-waku)** | React full-stack with SSR, RSC, Server Actions and web API routes |

Both share the [same 13 architecture principles](./ARCHITECTURE.md#1-shared-architecture-principles), [Celld deployment runbook](./DEPLOY.md), application env allowlist, `ENV_FILE` secret model and native Celld workflow. [SYNC.md](./SYNC.md) describes their shared contract.

## Mental model

```text
Optional React SPA     Flutter/mobile       External services
        |                   |                       |
        +-------------------+-----------------------+
                            |
                     REST / WebSocket
                            v
                        Hono Worker
                         /       \
                 Stateless      Durable Object
                  API work      RPC / WebSocket
                         \       /
                          Celld fleet
```

A frontend uses the **same stable HTTP and realtime endpoints** as mobile clients. Celld can serve the compiled SPA when requested; the default project deploy remains API-only. For server-rendered React pages and Server Actions, choose [celld-waku](https://github.com/chof64/celld-waku).

**Fleet note:** Each standalone deployment replaces one whole Celld application. To co-host Hono and Waku Workers, publish a composed application from one deployment pipeline—not two independent repository workflows.

## Requirements

- Node.js 22+
- pnpm
- a current `celld` CLI on `PATH`

Production also needs access to the fleet object store through Celld's normal environment/credential configuration.

## Chat reference application

The API-first Hono chat demonstrates Durable Object RPC, room-local SQLite, REST messages, and hibernatable WebSockets. An **optional React/Vite chat client** under `web/` uses exactly those public endpoints. It is a client, not a second server or separate domain model.

```text
GET  /api/rooms/:roomId           Room snapshot
GET  /api/rooms/:roomId/messages  Last 100 messages
POST /api/rooms/:roomId/messages  Validate, persist and broadcast
GET  /api/rooms/:roomId/socket    WebSocket notifications
```

### API-only development (default)

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

API listens at `http://127.0.0.1:9876`. For example:

```sh
curl http://127.0.0.1:9876/health
curl http://127.0.0.1:9876/api/rooms/lobby/messages
```

### Optional client-side React chat

In a **second terminal**, install the independent web project and launch Vite:

```sh
pnpm --dir web install --no-frozen-lockfile
pnpm dev:web
```

Open **http://127.0.0.1:5173**. Vite proxies the same REST URLs and WebSocket upgrades to Hono. The root API does not need React or Vite installed.

Read [WEB.md](./WEB.md) for setup and automatic SPA deployment when `web/` exists.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm dev:celld` | Native API-only Celld development |
| `pnpm typecheck` / `pnpm test` / `pnpm check` | Backend checks; no frontend install needed |
| `pnpm deploy` | Deploy Hono, automatically building/including `web/` if present |
| `pnpm dev:web` | Optional React/Vite development on port 5173 |
| `pnpm build:web` / `pnpm check:web` | Optional React SPA verification and build |

To intentionally reset local Celld state, run `celld dev . --clean` directly.

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
pnpm deploy -- --dry-run
pnpm deploy
```

This is the **only deployment command**, regardless of whether the optional web client exists. If `web/` is present, deployment builds and includes the SPA automatically; if it is absent, deployment contains Hono APIs and Durable Objects only. For local deployment with `web/`, install that project's dependencies once. Removing `web/` and deploying again intentionally removes its previously published assets.

The deployment wrapper:

1. detects `web/`; if present, builds it and adds generated SPA asset configuration,
2. resolves the application environment and validates the Worker variable allowlist,
3. creates an ignored temporary `.wrangler.deploy.jsonc` with only permitted bindings,
4. invokes native `celld deploy --config .wrangler.deploy.jsonc`,
5. removes the generated configurations when finished.

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

The workflow installs the pinned Celld release, runs `pnpm check`, and **automatically installs/checks `web/` when it exists** before materializing `ENV_FILE` as `.env`. It rejects fleet settings inside `ENV_FILE`, then passes the bucket settings and credentials directly to the dry-run and deploy processes. Deploys are serialized with workflow concurrency within this repository. It always uses `pnpm deploy` for dry-run and publish.

Only variables declared in `celld/env.ts` become Worker bindings. There is no frontend deployment toggle: repository structure determines whether SPA assets are bundled. Fleet settings and credentials remain deploy-process environment variables and are not copied into the Worker.

See [DEPLOY.md](./DEPLOY.md#github-actions) for the full workflow contract and secret setup.

## Choose Hono or Waku

Use **Hono** when the public API is the core of the application and browser, mobile and service clients share REST/WebSocket contracts. Add a client-side SPA only when needed; no SSR or Server Actions are required.

Use **[celld-waku](https://github.com/chof64/celld-waku)** when React Server Components, SSR, server-rendered routes, and Server Actions are the primary developer experience. Waku also supports public HTTP APIs; it is not web-only.

Hono's existing Worker script name (`celld-boilerplate`) intentionally remains unchanged to protect deployed script and Durable Object identities after the repository rename. Set a new name only **before** a first deployment, or perform an intentional migration.

## Philosophy

This repository is intentionally not a framework on top of Celld.

It establishes a few conventions, then gets out of the way:

> Use Celld primitives directly. Use RESTful HTTP through Hono for the public API. Prefer native RPC for internal stateful calls. Keep business logic independent of transport. Keep deployment native. Add complexity only when a concrete requirement appears.
