# Architecture

This document defines the architecture standard implemented by this boilerplate.

The goal is a small, opinionated **API-first** Celld application shape with sensible defaults for development and production. It can optionally ship a client-side SPA, but frontend tooling is never required for the API. It is intentionally not a framework on top of Celld.

## 1. Shared architecture principles

These principles are intentionally **identical in both Celld starters**. When changing a shared convention, update both repositories together; framework-specific sections below may differ.

1. **Celld is the execution and deployment runtime.** Use its supported Workers, Durable Objects, service bindings, Queues, Workflows, Cron, KV, D1, and R2 surfaces directly instead of inventing a Celld SDK.
2. **Keep framework conventions native.** Hono owns API-first HTTP routes; an optional browser SPA uses standard client-side tooling. Waku owns React pages, layouts, Server Components, client components, API routes, and Server Actions. Do not implement a competing router.
3. **Use an explicit public contract.** RESTful HTTP is the default for mobile clients, webhooks, integrations, and shared APIs. Waku Server Actions are suitable for application UI mutations, not a replacement for external API contracts.
4. **Give stateful entities a clear owner.** Durable Objects coordinate entity-local work. Prefer native Durable Object RPC for method calls when available; use `fetch()` for HTTP or WebSocket semantics. Waku can reach a separate Hono/DO Worker through a service binding.
5. **Keep business logic independent of transport.** HTTP routes, Server Actions, Queues, Workflows, and Durable Objects should delegate reusable domain operations to plain modules, rather than duplicating rules.
6. **Validate and authorize at every trust boundary.** Use Zod as the default schema implementation and Standard Schema where a framework provides a compatible integration. Treat Server Actions as public server entrypoints.
7. **Make state ownership explicit.** For Xicar, PlanetScale Postgres and application S3 remain authoritative; Celld coordination/cache state is rebuildable unless a feature deliberately establishes a different persistence contract.
8. **Use one canonical root `wrangler.jsonc`.** It declares binding identities and entrypoints but contains no production secrets. Do not add separate development, staging, or production Wrangler files by default.
9. **Separate application variables from fleet credentials.** `celld/env.ts` declares the application allowlist; `.env` supplies local values, and process variables override it. CI supplies application values via `ENV_FILE`; Celld bucket, node, and storage credentials remain process/infrastructure settings.
10. **Keep the Celld commands native and visible.** Project scripts may prepare environment and build artifacts, but `celld dev` and `celld deploy` own execution and publication. Do not deploy to Celld with `wrangler deploy`.
11. **Standardize operations across both starters.** Use the same production GitHub Environment contract, pinned `CELLD_VERSION`, serialized deploys, dry-run before publish, and the same single-node/multi-node/upgrade runbook.
12. **Protect persistent identities.** Treat Worker names, Durable Object class and binding names, migration tags, service bindings, and storage identities as schema. Append migrations intentionally; do not casually rename live resources.
13. **Keep the baseline small.** Development and production are the only default modes. Add optional feature folders, framework libraries, state stores, extra environments, and runtime bindings only when needed.

### Sibling starters

| Repository | Primary purpose | Routing and runtime boundary |
| --- | --- | --- |
| [`chof64/celld-hono`](https://github.com/chof64/celld-hono) | API-first, optional client-side web SPA | Hono REST/WebSocket APIs, Durable Objects, optional static React/Vite assets |
| [`chof64/celld-waku`](https://github.com/chof64/celld-waku) | Server-rendered React full-stack applications | Waku pages, RSC/SSR, client components, Server Actions and API routes |

They share **deployment, environment, security, and architectural principles**, not identical framework source code. Hono's optional web client does not change its API-first contract or introduce mandatory frontend dependencies. They may coexist as separate Worker scripts **only when composed into one Celld application deployment**, connected by service bindings. Independently deploying each starter to the same fleet replaces its current application; it does not merge scripts.

## 2. Default stack

```text
Celld
  +
Hono
  +
@hono/standard-validator
  +
Zod
```

Responsibilities:

```text
Celld
  runtime, Workers, Durable Objects, bindings, queues,
  workflows, cron, storage surfaces, deployment

Hono
  public HTTP/WebSocket API boundary

Standard Schema
  validation integration contract

Zod
  default schema implementation
```

OpenAPI is not part of the baseline. It can be added when the application has external/non-TypeScript consumers or formal API-documentation requirements.

### Reference chat application

This repository includes a chat API and Durable Object example, plus an **optional React/Vite client** in top-level `src/` files. The browser client consumes the same public endpoints that Flutter and other HTTP/WebSocket clients use.

```text
               Web / mobile client
                      |
          +-----------+-----------+
          |                       |
          | REST                  | WebSocket
          v                       v
        Hono                    Hono
          |                       |
          | native RPC            | stub.fetch()
          v                       v
                Room Durable Object
                  |            |
                  |            +-- hibernatable WebSockets
                  |
                  +-- SQLite message history
```

The concrete flows are:

```text
GET /api/rooms/:roomId/messages
  -> Hono
  -> Room.listMessages()
  -> Durable Object SQLite

POST /api/rooms/:roomId/messages
  -> Hono validation
  -> Room.sendMessage()
  -> SQLite INSERT
  -> broadcast to connected sockets

GET /api/rooms/:roomId/socket
  -> Hono public route
  -> Room.fetch(request)
  -> WebSocket upgrade owned by the Durable Object
```

This intentionally keeps realtime delivery separate from message mutation. The public write contract remains RESTful, while WebSocket is used only where a long-lived realtime transport is useful.

## 3. Public and internal boundaries

The normal request path is:

```text
Internet
   |
   v
TLS / ingress / load balancer
   |
   v
Celld public Worker listener
   |
   v
Hono
   |
   +---- stateless application work
   |
   +---- native RPC ---------> Durable Object
   |
   +---- stub.fetch() -------> Durable Object HTTP/WebSocket surface
```

Clients do not need to know:

- Durable Object IDs,
- which Celld node owns an object,
- fleet peer addresses,
- internal Celld routes,
- storage placement,
- ownership handoff behavior.

Those concerns remain inside Celld and the application bindings.

Celld also has an internal listener for fleet/operator traffic. That surface is infrastructure, not the application API, and must not be exposed as the client contract.

## 4. Hono as the front door

Public clients talk to the Worker through ordinary HTTPS or WebSocket URLs.

Hono is responsible for public concerns such as:

- routing,
- authentication,
- authorization context,
- validation,
- request IDs and trace context,
- error translation,
- response formatting,
- selecting the appropriate Durable Object.

Example:

```text
PATCH /api/rides/:rideId
              |
              | { "status": "accepted", "driverId": "..." }
              v
            Hono
              |
              v
env.RIDE.getByName(rideId)
              |
              v
ride.acceptDriver(driverId)
```

The public interface is RESTful HTTP. The internal stateful call is Celld RPC.

This keeps the public API stable even if the internal Durable Object model evolves.

## 5. RESTful public API, Celld RPC internally

The default public API is RESTful HTTP through Hono.

```text
Web / mobile / service client
            |
            | HTTPS
            v
        Hono REST API
            |
            | native Celld RPC when stateful work is needed
            v
      Durable Object
```

Public API design should prefer:

- resource-oriented URLs,
- standard HTTP methods,
- standard HTTP status codes,
- JSON request/response bodies where applicable,
- predictable validation and error responses.

Examples:

```text
GET  /api/rooms/:roomId
PUT  /api/rooms/:roomId/topic
GET  /api/users/:userId
POST /api/bookings
PATCH /api/bookings/:bookingId
```

Prefer nouns and resource state over RPC-style public procedure names. Domain actions that do not map cleanly to CRUD/resource updates may use an explicit action or subresource endpoint, but that should be the exception rather than the default.

A client does not need Hono-specific packages. Browsers, native mobile applications, third-party systems, and backend services can use any standard HTTP client.

### Optional Hono typed client

TypeScript consumers may use `hono/client` as a compile-time convenience over the same REST endpoints.

That client is optional and must not become the architectural contract or drive route design. The HTTP resources, methods, status codes, and payloads remain the public API.

### Internal Celld RPC

A Worker or another Celld runtime component can call a method on a Durable Object stub.

```text
Hono REST route
      |
      v
room.setTopic(topic)
      |
      v
Room Durable Object
```

This RPC is a runtime capability and is not exposed directly to arbitrary Internet clients.

## 6. Durable Objects

Use a Durable Object when a stateful entity benefits from one owner and coordinated execution.

Typical examples:

- chat room,
- ride session,
- driver session,
- shopping cart,
- collaborative room,
- rate limiter,
- game match,
- agent/session runtime,
- write-hot counter,
- stateful WebSocket hub.

A Durable Object can expose multiple runtime surfaces:

```text
Durable Object
├── RPC methods
├── fetch()
├── WebSockets
├── alarms
└── durable storage
```

The preferred interface depends on the operation.

### Prefer RPC for internal commands

Good:

```ts
const room = env.ROOM.getByName(roomId)
await room.setTopic(topic)
```

Avoid creating an internal HTTP endpoint only to express a method call.

### Use fetch for HTTP-shaped behavior

A Durable Object `fetch()` interface is appropriate when request/response semantics are useful, especially WebSocket upgrades or intentional resource-style interfaces.

Hono may also be used inside a Durable Object when the object's own HTTP surface is non-trivial, but that is opt-in rather than the default.

## 7. WebSockets

A WebSocket still starts at the public Worker boundary.

```text
Client
  |
  | GET /api/rooms/demo/socket
  | Upgrade: websocket
  v
Hono
  |
  | authenticate / authorize / resolve object
  v
Room Durable Object
  |
  | accepts WebSocket
  v
live stateful connection
```

The Worker/Hono route is responsible for the initial public contract. It forwards the upgrade request to the selected Durable Object with `stub.fetch(request)`.

Once the Durable Object accepts the connection, Celld carries WebSocket events to that object. Hono does not need to parse every frame.

This makes Durable Objects a natural place for chat rooms, live ride state, presence, and other stateful realtime coordination.

Clients must tolerate reconnects. Durable Object ownership can move, and a WebSocket transport cannot move with it.

## 8. Project layout

```text
project/
├── src/
│   ├── api/
│   │   ├── index.ts              # Worker and Durable Object exports
│   │   ├── app.ts                # Explicit Hono route registration
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   └── room/
│   │   │       ├── details.ts
│   │   │       ├── messages.ts
│   │   │       ├── socket.ts
│   │   │       └── params.ts
│   │   └── durable-objects/room.ts
│   ├── lib/chat.ts               # Browser-safe contracts
│   ├── main.tsx                  # Optional React entrypoint
│   ├── app.tsx                   # Optional UI
│   └── styles.css
├── celld/
│   ├── env.ts                    # Worker bindings and env allowlist
│   └── scripts/                  # Celld dev, build and deployment
├── index.html                    # Optional browser entry
├── vite.config.ts                # Optional Vite configuration
├── tsconfig.web.json
├── tests/
├── wrangler.jsonc                # Canonical config, no raw src assets
└── .wrangler.web.jsonc           # Generated for deployments with a frontend
```

The root is one package, not a nested `web/` workspace. Without browser entrypoints, the same project works as an API-only service. `src/api/` must never enter a browser bundle; `src/lib/` contains only portable schemas, types and pure transformations.

## 9. Runtime entrypoint

`src/api/index.ts` exports the Hono application as the default Worker handler and names any Durable Object classes. It should remain a small composition module. Celld's canonical `main` is `./src/api/index.ts`; no React code belongs in that entry.

## 10. Feature organization

**One descriptive file per endpoint URL**, with all methods for that URL together. Related endpoint files may be grouped under folders such as `src/api/routes/room/`; folders are for navigation only, not file-based routing.

```text
src/api/
  app.ts
  routes/
    health.ts
    room/
      details.ts        GET /api/rooms/:roomId
      messages.ts       GET/POST /api/rooms/:roomId/messages
      socket.ts         WebSocket /api/rooms/:roomId/socket
      params.ts         Shared route parameter validation
```

Each Hono module declares its **full public path**, and `src/api/app.ts` imports and mounts it explicitly via chained `.route("/", subApp)` calls. No Next.js-style filesystem discovery is involved; moving a file never changes a public URL by itself.

Server-only business modules belong in `src/api/`. Share only pure, environment-neutral contracts or transformations through `src/lib/`. Client modules may import `src/lib/` but must never import `src/api/`. No default controller/service/repository hierarchy is required.

## 11. Validation

Untrusted HTTP input crosses an explicit validation boundary:

```text
Hono
  |
  v
@hono/standard-validator
  |
  v
Zod
  |
  v
typed application input
```

Zod is the default implementation. Standard Schema is the integration contract, so a project can replace Zod later without redesigning the HTTP layer.

Validate the applicable:

- path parameters,
- query parameters,
- request bodies,
- forms,
- headers.

Do not repeatedly parse raw input deeper in the application.

## 12. Environments

The baseline has two operating modes:

```text
development
production
```

Do not add staging, beta, preview, QA, or pre-production by default.

An application does not need a mandatory `APP_ENV`; the invoked command already establishes whether the project is being developed or deployed. Add an environment-name variable only when business/runtime behavior genuinely needs it.

## 13. Application environment

The project uses:

```text
.env
.env.example
.env.prod.example
```

- `.env` is the local/private application configuration source.
- `.env.example` documents development values.
- `.env.prod.example` documents the production contract.

Resolution is:

```text
process environment
        ↓ overrides
.env
```

This means CI or production infrastructure can supply process environment variables without creating a persistent `.env` file.

## 14. Worker environment allowlist

Never copy the entire process environment into Worker bindings.

`celld/env.ts` declares the exact application variables that may reach the Worker.

That boundary prevents accidental exposure of values such as:

- CI tokens,
- GitHub credentials,
- object-store credentials,
- shell variables,
- unrelated service credentials,
- host paths.

Development and production share the same Worker environment declaration.

## 15. Application config versus fleet config

Application environment variables belong to the Worker/application contract.

Examples:

```text
DATABASE_URL
JWT_SIGNING_KEY
PAYMENT_API_KEY
LOG_LEVEL
```

Celld fleet/deployment configuration is separate.

Examples:

```text
CELLD_BUCKET
S3_ENDPOINT
AWS_REGION
AWS credentials
GCP credentials
Azure credentials
CELLD_ADDR
CELLD_ADVERTISE
```

The project does not prescribe how infrastructure supplies these values.

## 16. Wrangler

There is one canonical root `wrangler.jsonc`.

Do not maintain:

```text
wrangler.dev.jsonc
wrangler.prod.jsonc
wrangler.staging.jsonc
```

The root location is intentional. Celld resolves project-relative entrypoints, assets, and migration paths beneath the Wrangler project root, so a root config works for both frontend build output and `celld/` source.

The canonical file contains structural configuration and remains free of production secrets.

## 17. Development

`pnpm dev` automatically launches native Celld for Hono and, when a frontend exists, Vite for client-side React with HMR. `pnpm dev:celld` runs only Celld on port 9876; `pnpm dev:web` runs only Vite on port 5173. Vite proxies `/api/*` and WebSocket upgrades to Hono so browser and mobile clients share the same public interfaces.

Frontend presence is determined by root `index.html` and `src/main.tsx`. Missing one of the expected frontend files causes a clear error. Ordinary dev never clears `.celld/dev` state.

## 18. Shared source seam

`src/api/` is server-only: Hono, Worker bindings, Durable Objects, privileged operations and secrets. Root `src/` React files are client-side. `src/lib/` contains only shared portable schemas, types and pure functions; it must not import `src/api/`, `cloudflare:workers`, Node-only or browser-only APIs.

This permits safe code reuse without merging public UI logic with privileged server behavior. For RSC, SSR and Server Actions, prefer the [celld-waku](https://github.com/chof64/celld-waku) starter.

## 19. Optional compiled assets and canonical Wrangler

`wrangler.jsonc` points to `./src/api/index.ts` and contains **no** static assets by default. `pnpm deploy` detects browser entrypoints, builds the Vite frontend to `dist/` when present and derives an ignored `.wrangler.web.jsonc` retaining the same Worker/DO identity while adding SPA asset fallback and Worker-first `/api/*` routing. Without a frontend, it deploys Hono alone.

**Never expose `./src` as the static assets directory.** It contains `src/api/` server code. Only compiled Vite `./dist` assets are served. Removing frontend files and redeploying intentionally removes previously deployed SPA assets.

## 20. Production deployment

```bash
pnpm deploy
```

This one command packages the frontend when present and then executes native `celld deploy` using the same environment allowlist as API-only projects. It never calls `wrangler deploy` and never requires separate deployment flags.

## 21. Production Worker variables

Native `celld deploy` does not read `.dev.vars` into production Worker bindings.

The deploy script therefore creates a temporary root deployment configuration:

```text
process env + optional .env
          |
          v
      celld/env.ts
          |
   select + validate
          |
          v
    wrangler.jsonc
          +
      Worker vars
          |
          v
.wrangler.deploy.jsonc
          |
          v
     celld deploy
```

The canonical Wrangler file remains unchanged.

The temporary file is ignored, is written with restrictive permissions when the host supports them, is never logged, and is removed after deployment when practical.

## 22. Fleet deployment model

```text
developer / CI
      |
      v
 pnpm deploy
      |
      v
 celld deploy
      |
      v
 fleet object store
      |
      +-- deployment modules
      +-- manifest
      +-- assets
      +-- runtime bindings
      +-- container images, when used
      +-- current deployment pointer
      |
      v
 Celld fleet nodes
```

The deployment is published to the fleet store and the fleet converges on the selected deployment.

Application deployment does not require pushing code to every node individually.

Only one deployment writer should publish to a fleet at a time. Deployment serialization belongs to CI/infrastructure rather than this application boilerplate.

## 23. Fleet bucket security

The fleet object store is a root-level administrative trust boundary.

A principal that can replace fleet deployment state is already capable of controlling the application runtime, so this standard does not add a second home-grown encryption system around Worker string bindings.

Require normal root-level controls instead:

- private bucket/container access,
- least-privilege fleet credentials,
- transport security,
- provider encryption at rest,
- credential rotation,
- auditing where available.

## 24. Persistent identities and migrations

Treat these as persistent schema rather than cosmetic names:

- Worker/script name,
- Durable Object class names,
- Durable Object binding names,
- Durable Object migration tags,
- D1 identities,
- KV namespace identities,
- queue identities,
- workflow identities,
- R2 logical names.

Do not casually rename them.

Durable Object migrations should be append-only after production deployment unless Celld explicitly supports the intended transition.

## 25. Runtime version compatibility

Prefer the same Celld release for deployment tooling and fleet nodes.

Do not assume a project built with newer runtime features will work safely on older nodes.

How Celld binaries are distributed or upgraded is infrastructure-specific and outside the application standard.

## 26. Command surface

```text
pnpm dev             Celld API plus optional Vite client
pnpm dev:celld       Native Celld only
pnpm dev:web         Vite only
pnpm typecheck       API and portable lib types
pnpm typecheck:web   Browser-side TypeScript
pnpm test            API, environment and layout tests
pnpm check           Tests plus client build if present
pnpm build:web       Compile React to dist/
pnpm deploy          One Celld application, frontend auto-detected
```

The Waku sibling retains its framework-specific RSC/SSR build commands.

## 27. Decision guide

Use these defaults when adding functionality.

| Need | Default |
| --- | --- |
| Public API endpoint | RESTful HTTP through Hono; one named file per URL, flat by default with optional feature folders |
| Client-side browser UI, shared with mobile clients | Optional React/Vite SPA in `src/`; use existing Hono APIs |
| SSR / React Server Components and Server Actions | [celld-waku](https://github.com/chof64/celld-waku) |
| HTTP validation | Standard Schema + Zod |
| Internal method-style call to stateful entity | Durable Object RPC |
| Durable Object HTTP interface | `fetch()` |
| Stateful WebSocket hub | Durable Object |
| Stateless reusable logic | plain application functions |
| Background asynchronous work | Queue |
| Durable multi-step execution | Workflow |
| Scheduled work | Cron/scheduled handler |
| Read/write blob storage | R2 binding |
| Strongly owned/write-hot state | Durable Object |
| SQL-shaped local durable data | D1 or Durable Object SQLite, based on ownership model |

Do not use a Durable Object merely because one is available. Use it when the ownership/state model benefits from one.

## 28. What is intentionally not standardized

This API-first starter does not mandate:

- SSR/RSC tooling or Server Actions (the client-side React UI is optional; see Waku for SSR),
- ORM,
- PostgreSQL provider,
- authentication provider,
- secrets manager,
- CI vendor,
- cloud vendor,
- container platform,
- ingress product,
- DNS provider,
- observability vendor,
- infrastructure-as-code tool,
- repository-composition strategy.

Those are application or infrastructure decisions.

## 29. Final architecture

```text
                      PUBLIC

                Web / mobile client
                        |
                 HTTPS / WebSocket
                        |
                        v
               +------------------+
               |  Celld Worker    |
               |      Hono        |
               | auth / validate  |
               | route / errors   |
               +---------+--------+
                         |
            +------------+-------------+
            |            |             |
            | RPC        | fetch()     | bindings
            v            v             v
       Durable       Durable        KV / D1 /
       Object        Object         R2 / Queue
       methods       HTTP/WS
            |            |
            +------+-----+
                   |
                   v
          state + coordination

Other Celld execution surfaces:

Queue ----------+
Workflow -------+----> shared application / feature logic
Scheduled ------+
```

The governing rule is:

> Use Celld primitives directly. Use RESTful HTTP through Hono for the public API. Prefer native RPC for internal stateful calls. Use Durable Object fetch/WebSockets when HTTP semantics are useful. Keep business logic independent of transport. Keep deployment native. Add complexity only when a concrete requirement appears.
