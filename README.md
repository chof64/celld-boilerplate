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

For the complete design and the reasoning behind it, read [ARCHITECTURE.md](./ARCHITECTURE.md).

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

## Start

```bash
pnpm install
cp .env.example .env
pnpm dev:celld
```

Celld serves the Worker at `http://127.0.0.1:9876` by default.

Try the health endpoint:

```bash
curl http://127.0.0.1:9876/health
```

Read a room:

```bash
curl http://127.0.0.1:9876/api/rooms/demo
```

Set its durable topic:

```bash
curl -X PUT http://127.0.0.1:9876/api/rooms/demo/topic \
  -H 'content-type: application/json' \
  -d '{"topic":"Hello from Celld"}'
```

The example Room Durable Object also exposes a WebSocket at:

```text
ws://127.0.0.1:9876/api/rooms/demo/socket
```

The endpoint exists to demonstrate the intended boundary: Hono receives the public upgrade, resolves `Room("demo")`, then forwards the upgrade to the Durable Object.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:celld` | Generate local Worker vars and run `celld dev .` |
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
PUT  /api/rooms/:roomId/topic
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

## Using this in a frontend repository

This boilerplate keeps Celld code under `celld/` so it can be added to a mixed frontend/backend repository without taking over `src/`.

In a mixed project:

```text
pnpm dev          -> frontend framework
pnpm dev:celld    -> Celld
```

When the frontend and API are same-origin in production, configure the frontend dev server to proxy API/WebSocket paths to local Celld rather than adding development-only CORS behavior.

## Philosophy

This repository is intentionally not a framework on top of Celld.

It establishes a few conventions, then gets out of the way:

> Use Celld primitives directly. Use RESTful HTTP through Hono for the public API. Prefer native RPC for internal stateful calls. Keep business logic independent of transport. Keep deployment native. Add complexity only when a concrete requirement appears.
