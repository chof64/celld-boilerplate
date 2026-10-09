# Optional web client in celld-hono

`celld-hono` is an **API-first starter**. Its optional `web/` React/Vite chat is an ordinary client of the **same REST/WebSocket API** used by mobile apps and external consumers. For SSR/RSC and Server Actions, use [celld-waku](https://github.com/chof64/celld-waku).

The deployment convention is deliberately simple: **`pnpm deploy` automatically includes `web/` when it exists, otherwise deploys the backend alone.** No `DEPLOY_WEB` variable, dedicated web deploy command, or manually maintained alternative Wrangler file is needed.

## Development

Install and start Hono in the first terminal:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

The API runs at `http://127.0.0.1:9876`, including room REST endpoints and `/api/rooms/:roomId/socket` for WebSockets.

If this project contains a `web/` directory, install its independent dependencies once and start Vite in another terminal:

```sh
pnpm --dir web install --no-frozen-lockfile
pnpm dev:web
```

Open **http://127.0.0.1:5173**. Vite proxies `/api/*` and WebSocket upgrades to Hono. To change the development backend origin, set `CHAT_API_ORIGIN` in the Vite process environment; it is not a browser-exposed environment variable or a Celld Worker binding.

The optional client provides room navigation, history loaded through REST, posting through REST, realtime WebSocket events, reconnection and message deduplication. The browser does not import Hono server code or Durable Object bindings.

`pnpm dev` intentionally starts the API alone. `pnpm dev:web` is a convenience for working on the browser client; neither is a deployment-mode switch.

## One deployment command

```sh
pnpm deploy -- --dry-run
pnpm deploy
```

The deploy command checks whether **`web/` exists**:

| Repository layout | Deployment result |
| --- | --- |
| No `web/` directory | Hono API and Durable Objects only |
| `web/` with `web/package.json` | Build `web/dist` and deploy Hono plus SPA assets |
| `web/` exists but is incomplete | Stop with an error rather than silently omit frontend code |

When the frontend exists, `pnpm deploy` builds it using the separate `web/` dependencies, derives the ignored `.wrangler.web.jsonc` from the canonical root `wrangler.jsonc`, and invokes the same native Celld deployment helper as API-only mode. Install the web dependencies before local deployment; GitHub Actions installs them automatically when the directory exists.

The generated asset configuration is:

```json
{
  "assets": {
    "directory": "./web/dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/health"]
  }
}
```

Thus Celld serves the compiled frontend and its SPA route fallback (for example `/rooms/drivers`), while `/api/*` and `/health` reach Hono. The generated config retains the **same Worker name, Durable Object bindings and migrations**. It is removed after deploy; the original root `wrangler.jsonc` is never modified.

**Removing `web/` and deploying again removes the previously published SPA assets**, because a Celld application deployment replaces the fleet's current application. Keep that behavior in mind when restructuring repositories or composing multiple Workers into one application.

## GitHub Actions

The production workflow always calls **`pnpm deploy -- --dry-run`**, then **`pnpm deploy`**. It automatically installs and verifies the separate web dependencies when `web/` exists, and skips that work otherwise.

There is **no deployment selector** in GitHub Environment variables or in `ENV_FILE`. The latter remains the application-only `KEY=value` secret, separate from the Celld fleet and object-store credentials. Worker bindings remain explicitly allowlisted in `celld/env.ts`.

The optional frontend package doesn't yet have a committed `web/pnpm-lock.yaml`. For now its dependency installation uses `--no-frozen-lockfile`, while the root Hono dependency installation remains frozen. After generating and committing a web lockfile, switch its installs to `--frozen-lockfile`.

## Acceptance checklist

1. With no `web/` directory, `pnpm deploy -- --dry-run` deploys only the Hono Worker and does not need React dependencies.
2. With a valid `web/` directory, the same command builds and includes its assets. A malformed `web/` directory causes an explicit error.
3. Refresh a nested SPA path like `/rooms/drivers` and confirm its JavaScript/CSS loads.
4. Confirm `GET /api/rooms/lobby/messages` returns JSON, never SPA fallback HTML.
5. Open two chat windows; sending in one should update the other via WebSockets without duplicates.
6. Restart Hono and confirm reconnection retrieves missed messages.
7. Remove `web/` and deploy again only when intentionally retiring the SPA; confirm Celld does not retain the old assets.

The chat is an **unauthenticated demonstration**, without room authorization, abuse controls or rate limits. Do not use it as a production messaging feature as-is. Xicar's persistent domain data remains authoritative in PlanetScale Postgres and application S3.
