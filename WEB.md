# Hono API and optional React under one src/

The API-first [celld-hono](https://github.com/chof64/celld-hono) starter keeps **one source tree, one package, and one Celld application**. The backend is always in `src/api/`; when a browser app is needed, it uses `src/main.tsx` and `src/app.tsx`. Pure, environment-neutral code can be shared through `src/lib/`.

Use [celld-waku](https://github.com/chof64/celld-waku) when SSR, React Server Components, or Server Actions are important; this starter intentionally keeps the browser client-side and the public Hono API shared with mobile clients.

## Source conventions

```text
src/
  api/
    index.ts                 Worker entry and Durable Object exports
    app.ts                   Explicit Hono route composition
    routes/
      health.ts
      room/
        details.ts           GET /api/rooms/:roomId
        messages.ts          GET/POST /api/rooms/:roomId/messages
        socket.ts            WebSocket /api/rooms/:roomId/socket
        params.ts            Room parameter validation
    durable-objects/room.ts  Room state and WebSocket coordinator
  lib/chat.ts                Browser-safe shared message contract
  app.tsx                    Optional React UI
  main.tsx                   Optional Vite browser entry
  styles.css                 Optional frontend styles
celld/
  env.ts                     Application binding and variable types
  scripts/                   Celld dev/deploy orchestration
index.html                   Optional frontend marker
vite.config.ts               Optional Vite dev proxy and build configuration
tsconfig.web.json            Optional browser-specific TypeScript configuration
wrangler.jsonc               One canonical Celld configuration
```

`src/api` is **server-only**. Do not import Hono handlers, Durable Objects, Worker bindings, credentials or privileged business operations into browser code.

`src/lib` is intentionally restricted to environment-neutral contracts and functions: schemas, types, data transformations and other pure operations. Modules there must not import from `src/api`, `cloudflare:workers`, Node-only packages, or browser-specific APIs. It is a safe seam for sharing logic between the backend and frontend—not a place to bypass authorization.

**Source grouping is not routing.** Every Hono route file declares its complete public URL, and `src/api/app.ts` explicitly imports and registers it. The `room/` directory is solely an organizational grouping; it doesn't add a URL prefix.

## Development

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

With a browser app, `pnpm dev` starts the local Celld backend at `http://127.0.0.1:9876` and Vite at **http://127.0.0.1:5173**. Vite provides React HMR and proxies REST and WebSocket calls under `/api` to Celld. Browser and mobile clients use the same API contract.

Without a browser app, `pnpm dev` starts only Celld. For working on one process independently:

```sh
pnpm dev:celld      # API only
pnpm dev:web        # Vite only, when browser files exist
```

There is no deployment-mode flag. A browser app is detected by the presence of root `index.html` and `src/main.tsx`. A partially removed browser app causes an explicit error rather than silently changing the deployment.

## Build and deployment

```sh
pnpm check
pnpm deploy -- --dry-run
pnpm deploy
```

When `index.html` and `src/main.tsx` are present, the commands automatically check/build the Vite frontend and include its compiled `dist/` output. Without them, only the Hono API/DO Worker is deployed. A separate `web/` package or explicit `deploy:web` command is unnecessary.

The root `wrangler.jsonc` remains API-first and points to `./src/api/index.ts`. When a frontend exists, the deployment script creates an ignored `.wrangler.web.jsonc` using the same Worker name, Durable Object migrations, and bindings but adding:

```json
{
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/health"]
  }
}
```

**Never use `./src` as the static asset directory** in this layout: it contains `src/api`, which is server source code. Only the compiled Vite output under `dist/` is published as static assets. The temporary config is ignored by Git and removed by the wrapper after deployment.

Each Celld deployment replaces the current application. Removing the browser source and redeploying removes the old SPA assets. To deploy Hono together with Waku or other Workers in one fleet, compose and publish the entire Celld application from a single pipeline.

## CI and dependency management

The production workflow runs the same `pnpm check` and `pnpm deploy` commands regardless of whether a web frontend exists. It preserves the existing `ENV_FILE` application-only secret, GitHub production Environment, pinned Celld version, dry-run, and isolated infrastructure credentials.

React/Vite dependencies now live in the **same root package** as Hono to keep a seamless `src/` developer experience. A project permanently removing the frontend can also prune those dependencies, but removing the browser entrypoints is enough to disable web build and deployment. The root pnpm lockfile now includes Hono, React and Vite; CI uses frozen installs for reproducibility.

## Chat reference checks

1. Open `http://127.0.0.1:5173` and send a message in the React chat.
2. Open a second browser window and verify Durable Object WebSocket broadcasts arrive.
3. Open `/rooms/drivers`, refresh the page, and verify Vite SPA fallback and room state.
4. Verify that `GET /api/rooms/lobby/messages` returns JSON rather than SPA HTML.
5. Disconnect and reconnect Celld; verify the frontend resynchronizes missed messages.
6. Run `pnpm deploy -- --dry-run` and verify it publishes **`./dist`**, never raw `./src`.
7. Remove both `index.html` and `src/main.tsx` in an API-only derivative and verify the same commands work without a browser build.
8. Confirm browser code does not import `src/api` or privileged Celld bindings.

The chat is an unauthenticated reference example. Add identity, authorization, abuse controls and durable authoritative storage before using this design for production Xicar messaging.
