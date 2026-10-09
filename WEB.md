# Optional web client in celld-hono

`celld-hono` is an **API-first starter**. The React chat under `web/` is an optional client of the same public REST and WebSocket API used by mobile apps and other integrations.

The root Hono package does **not** depend on React or Vite. `pnpm dev`, `pnpm check`, and `pnpm deploy` remain backend-only. A client application is never required to build or deploy the API.

For a React Server Components / SSR-first application instead, use the [celld-waku](https://github.com/chof64/celld-waku) starter.

## Development

Install and start the Hono API in the first terminal:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

The Hono API listens at `http://127.0.0.1:9876`, including `GET /health`, `GET/POST /api/rooms/:roomId/messages`, and `GET /api/rooms/:roomId/socket` as a WebSocket upgrade.

In a second terminal, install the **separate optional web project** and start Vite:

```sh
pnpm --dir web install --no-frozen-lockfile
pnpm dev:web
```

Open **http://127.0.0.1:5173**. Vite forwards `/api/*` and WebSocket upgrades to the Hono backend at `http://127.0.0.1:9876`. The proxy target can be changed for local development by setting `CHAT_API_ORIGIN` in the Vite process environment. This is a server-only Vite configuration value; it is **not** an app `VITE_*` variable or a Celld binding.

The React chat supports channel navigation via normal `/rooms/:roomId` URLs, history loading via REST, sending messages via REST, and realtime WebSocket notifications. Each message is deduplicated by ID and room history is resynced after reconnection.

The web client knows only public API paths. It never imports Hono server modules or accesses Durable Object bindings.

## Deployment modes

```sh
# API-only, no React install/build required:
pnpm deploy -- --dry-run
pnpm deploy

# Opt-in: API and compiled SPA on the SAME Celld application:
pnpm --dir web install --no-frozen-lockfile
pnpm deploy:web -- --dry-run
pnpm deploy:web
```

`pnpm deploy:web` builds `web/dist`, derives an ignored `.wrangler.web.jsonc` from the canonical root `wrangler.jsonc`, then uses the **same** `celld/scripts/deploy.ts` deployment helper. The temporary config inherits the exact Worker name, Durable Object bindings, and migrations without changing them. The temporary config is removed when the deployment command completes.

The derived config adds:

```json
{
  "assets": {
    "directory": "./web/dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/health"]
  }
}
```

The `/api/*` and `/health` paths reach Hono; static frontend assets are served by Celld, and browser navigations to paths like `/rooms/drivers` fall back to `index.html`. POSTs and WebSocket upgrades still reach the Worker through Celld.

The repository still maintains **one canonical** `wrangler.jsonc`—the optional SPA configuration is an ignored build/deploy artifact, not another environment-specific file.

**Important:** Every deployment replaces the fleet's current application. Deploying later with `pnpm deploy` publishes the API-only application and **removes** the web assets. Choose the appropriate mode consistently for the target fleet. A fleet hosting other Workers must be deployed from a single composed application pipeline.

## GitHub Actions

Production deployment shares the same `ENV_FILE` application-secret contract, fleet credentials, pinned Celld version and dry-run safeguards as [celld-waku](https://github.com/chof64/celld-waku). The default is **API-only**.

To add the optional SPA to the deployed Hono application, set the `DEPLOY_WEB` variable to exactly `true` in the GitHub `production` Environment. The workflow then installs the separate web dependencies, verifies the frontend build, and uses `pnpm deploy:web` for both the dry-run and actual deploy. `DEPLOY_WEB` is a deployment selector, not a Worker secret, and must **not** be copied into `ENV_FILE`.

There is currently no committed `web/pnpm-lock.yaml`; the optional web install uses `--no-frozen-lockfile` while the root API install stays frozen. Generate and commit the web lockfile after dependency validation, then change web installs to `--frozen-lockfile`.

## Acceptance checklist

1. API-only `pnpm dev`, `pnpm check` and `pnpm deploy -- --dry-run` must work without installing the `web/` dependencies.
2. With Vite on port 5173, `GET /api/rooms/lobby/messages` returns JSON and does not return SPA HTML.
3. Open two React chat tabs; sending in one tab updates the other over WebSocket.
4. Refresh `/rooms/drivers` directly in a browser and verify the SPA loads the selected room.
5. Disconnect Hono and reconnect it; the UI should show reconnecting status and refresh missed messages.
6. Validate build output and the generated Celld config before executing `deploy:web`.
7. Verify a real Celld deployment serves compiled JS/CSS, returns API JSON and preserves WebSocket upgrades.
8. Deploy API-only again to confirm frontend assets are no longer part of the application.

This is an **unauthenticated, rate-unlimited public reference demo**. Do not expose it as production messaging without authentication, room authorization, rate limits and abuse controls. Xicar domain persistence remains PlanetScale Postgres and application S3; the chat Durable Object is a limited reference example.
