# Celld Starter Sync Contract

This document has **identical contents** in [celld-hono](https://github.com/chof64/celld-hono) and [celld-waku](https://github.com/chof64/celld-waku). The sibling starters are independent framework applications, but share one set of runtime and operational decisions.

## Shared defaults — keep in sync

| Surface | Shared rule | Intentional differences |
| --- | --- | --- |
| `ARCHITECTURE.md` | The 13 numbered **Shared architecture principles** and sibling table must match word-for-word | Hono HTTP/DO implementation vs Waku React/SSR/RSC design |
| `DEPLOY.md` | Node topology, fleet security, upgrades, drain, CI, environment settings, and deployment instructions must match | App-specific test/checklist appendix |
| `.github/workflows/deploy.yml` | Same triggers, production Environment, `ENV_FILE`, Celld version, credentials, dry-run, serialized deploy | Package installation may differ until Waku's pnpm lockfile exists |
| `celld/scripts/env.ts` | Same `.env` overlay, allowlist, and `.dev.vars` serialization | None; keep source identical |
| `celld/scripts/dev.ts` | Same native `celld dev .` launcher | Waku prepares/builds its frontend before invoking it |
| `celld/scripts/deploy.ts` | Same temporary `.wrangler.deploy.jsonc` and native `celld deploy` wrapper | Waku prepares its client/server build first |
| `celld/env.ts` | Same `workerEnvironment.required/optional` contract | Binding types differ (`ROOM` for Hono, `ASSETS` for Waku) |
| `.env.example`, `.env.prod.example` | Same application variable shape and examples | Add app-specific keys intentionally |
| `wrangler.jsonc` | One root configuration, stable binding names, no secrets | Hono exports DOs; Waku declares static assets and generated Worker entry |
| Project scripts | `pnpm dev`, `pnpm dev:celld`, `pnpm check`, `pnpm deploy` | Waku also has `pnpm build`, `pnpm build:celld` and `pnpm env:local` |
| State ownership | Explicit domain persistence, standard HTTP for public APIs, prefer Celld-native bindings | Waku Server Actions are for the web app's UI, not external APIs |

## Maintenance procedure

When changing a shared convention:

1. Review the counterpart repository's implementation before editing.
2. Apply equivalent changes in **both repositories**, without forcing Waku to mimic Hono routing or Hono to ship a frontend.
3. Keep the shared `ARCHITECTURE.md` principles and the fleet runbook prefix identical. Keep `celld/scripts/env.ts`, `dev.ts` and `deploy.ts` identical whenever possible.
4. Update the workflows, docs and tests together; note unavoidable differences in both PR descriptions.
5. Run `pnpm check` in each repository, then build and test on an actual Celld runtime for runtime-related changes.
6. Never rename persistent Worker/binding identities casually when syncing repository names.

**Important:** GitHub Actions concurrency is scoped to each repository, not shared across them. Deploys targeting the same Celld fleet must be coordinated by the composition repository or another fleet-wide deployment lock.

The Waku/Celld RSC packaging bridge is still experimental. Matching conventions **do not** imply Waku production compatibility has been demonstrated.
