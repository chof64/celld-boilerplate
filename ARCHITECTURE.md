# Architecture

This document defines the architecture standard implemented by this boilerplate.

The goal is a small, opinionated Celld application shape with sensible defaults for development and production. It is intentionally not a framework on top of Celld.

## 1. Principles

1. **Celld remains the runtime abstraction.** Use Workers, Durable Objects, Queues, Workflows, Cron, KV, D1, R2, service bindings, and other Celld-supported surfaces directly.
2. **Hono owns the public HTTP boundary.** It handles routing, authentication/authorization context, validation, middleware, errors, and public HTTP/WebSocket URLs.
3. **Durable Objects own stateful identities.** Use them when one logical entity needs a single consistent owner, durable local state, serialized coordination, alarms, or long-lived connections.
4. **Prefer native Celld RPC internally.** If a Worker wants to tell a Durable Object to do something, method-style RPC is normally clearer than inventing an internal HTTP endpoint.
5. **Use Durable Object `fetch()` when HTTP semantics are actually useful.** WebSocket upgrades are the main example.
6. **Keep domain logic independent of transport.** Hono routes, queue consumers, workflows, and Durable Objects should be able to call shared feature code rather than embedding business logic in transport handlers.
7. **Use one canonical `wrangler.jsonc`.**
8. **Use native `celld dev` and `celld deploy`.**
9. **Keep application environment separate from fleet/infrastructure environment.**
10. **Add complexity only after a concrete requirement appears.**

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
POST /api/rides/:rideId/accept
              |
              v
            Hono
              |
              v
env.RIDE.getByName(rideId)
              |
              v
ride.acceptDriver(driverId)
```

The public interface is HTTP. The internal stateful call is Celld RPC.

This keeps the public API stable even if the internal Durable Object model evolves.

## 5. Hono RPC versus Celld RPC

The word "RPC" appears at two different layers.

### Public: Hono RPC

Hono's typed client provides RPC-style developer experience over normal HTTP/fetch.

```text
TypeScript web/mobile client
          |
          | HTTPS
          v
        Hono
```

This is appropriate for browser and JavaScript mobile clients because the transport is still standard HTTP.

### Internal: Celld RPC

A Worker or another runtime component can call a method on a Durable Object stub.

```text
Hono route
    |
    v
room.setTopic(topic)
    |
    v
Room Durable Object
```

This RPC is a runtime capability and is not the protocol exposed directly to arbitrary Internet clients.

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

This repository represents the **mixed-project** layout: Celld is one part of a repository that may also contain a frontend.

```text
project/
├── src/                         # frontend/application source, if present
├── public/
│
├── celld/
│   ├── index.ts                 # runtime composition only
│   ├── env.ts                   # explicit Worker env contract
│   │
│   ├── http/
│   │   └── app.ts               # Hono public API
│   │
│   ├── durable-objects/
│   │   └── room.ts              # example stateful entity
│   │
│   └── scripts/
│       ├── env.ts               # shared env-loading helpers
│       ├── dev.ts               # writes .dev.vars + celld dev
│       └── deploy.ts            # temporary deploy config + celld deploy
│
├── wrangler.jsonc
├── .env
├── .env.example
├── .env.prod.example
├── .dev.vars                    # generated, ignored
├── .wrangler.deploy.jsonc       # generated, ignored
├── .celld/                      # local Celld state, ignored
└── ...
```

Do not create empty architectural directories. Add `queues/`, `workflows/`, `scheduled/`, `features/`, or `migrations/` when the application actually needs them.

For a Celld-only repository, an extra `celld/` namespace is unnecessary; ordinary `src/` can be the application root.

## 9. Runtime entrypoint

`celld/index.ts` should remain boring.

Its purpose is runtime composition:

```text
celld/index.ts
  |
  +-- default.fetch -> Hono
  +-- exported Durable Object classes
  +-- queue handler, when added
  +-- scheduled handler, when added
  +-- other Celld runtime exports, when added
```

Business logic should not accumulate in the entrypoint.

## 10. Feature organization

Prefer feature-oriented organization to framework layers.

Avoid making this the default:

```text
controllers/
services/
repositories/
models/
routes/
```

As an application grows, prefer something like:

```text
celld/features/
├── bookings/
│   ├── routes.ts
│   ├── schema.ts
│   └── matching.ts
├── users/
└── payments/
```

Shared business functions should be callable by Hono, Queues, Workflows, and Durable Objects without importing an HTTP framework unless HTTP is actually part of the concern.

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

In a mixed frontend/Celld project:

```text
pnpm dev        -> frontend framework
pnpm dev:celld  -> Celld
```

`pnpm dev:celld`:

1. loads optional `.env`,
2. overlays the current process environment,
3. selects and validates the Worker environment,
4. writes `.dev.vars`,
5. runs `celld dev .`.

Celld keeps local durable state under `.celld/dev`.

Do not add a normal `dev:clean` abstraction. If a developer intentionally wants empty state, use:

```bash
celld dev . --clean
```

## 18. Frontend development proxy

When frontend and API are same-origin in production, prefer a frontend dev-server proxy:

```text
Browser
   |
   v
frontend dev server
   |
   +-- frontend
   |
   +-- /api/* ------> http://127.0.0.1:9876
```

This preserves production-like URLs and avoids development-only CORS configuration.

The exact proxy implementation is frontend-framework-specific and is outside this boilerplate.

## 19. Production deployment

The stable project command is:

```bash
pnpm deploy
```

The wrapper ultimately invokes native:

```text
celld deploy
```

It does not use `wrangler deploy`.

Wrangler describes the application. Celld owns deployment.

## 20. Production Worker variables

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

## 21. Fleet deployment model

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

## 22. Fleet bucket security

The fleet object store is a root-level administrative trust boundary.

A principal that can replace fleet deployment state is already capable of controlling the application runtime, so this standard does not add a second home-grown encryption system around Worker string bindings.

Require normal root-level controls instead:

- private bucket/container access,
- least-privilege fleet credentials,
- transport security,
- provider encryption at rest,
- credential rotation,
- auditing where available.

## 23. Persistent identities and migrations

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

## 24. Runtime version compatibility

Prefer the same Celld release for deployment tooling and fleet nodes.

Do not assume a project built with newer runtime features will work safely on older nodes.

How Celld binaries are distributed or upgraded is infrastructure-specific and outside the application standard.

## 25. Command surface

The boilerplate intentionally keeps commands small:

```text
pnpm dev:celld
pnpm typecheck
pnpm test
pnpm check
pnpm deploy
```

A mixed frontend repository additionally owns its framework-native `pnpm dev` and `pnpm build`.

Avoid baseline commands such as:

```text
dev:clean
dev:fleet
dev:all
deploy:dev
deploy:staging
deploy:beta
deploy:prod
preview
doctor
```

until a real workflow requires them.

## 26. Decision guide

Use these defaults when adding functionality.

| Need | Default |
| --- | --- |
| Public HTTP endpoint | Hono |
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

## 27. What is intentionally not standardized

This boilerplate does not select:

- frontend framework,
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

## 28. Final architecture

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

> Use Celld primitives directly. Use Hono for the public HTTP boundary. Prefer native RPC for internal stateful calls. Use Durable Object fetch/WebSockets when HTTP semantics are useful. Keep business logic independent of transport. Keep deployment native. Add complexity only when a concrete requirement appears.
