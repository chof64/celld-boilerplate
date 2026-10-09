# Celld Starter Sync Contract

This document has **identical contents** in [celld-hono](https://github.com/chof64/celld-hono) and [celld-waku](https://github.com/chof64/celld-waku). The sibling starters are independent framework applications, but share one set of runtime and operational decisions.

## Shared defaults — keep in sync

| Surface | Shared rule | Intentional differences |
| --- | --- | --- |
| `ARCHITECTURE.md` | The 13 numbered **Shared architecture principles** and sibling table must match word-for-word | Hono HTTP/DO implementation vs Waku React/SSR/RSC design |
| `DEPLOY.md` | Node topology, fleet security, upgrades, drain, CI, environment settings, and deployment instructions must match | App-specific test/checklist appendix |
| `.github/workflows/deploy.yml` | Same triggers, production Environment, `ENV_FILE`, Celld version, credentials, dry-run, serialized deploy | Hono automatically installs/builds a frontend when `web/` exists; Waku builds React by default and currently has a lockfile exception |
| `celld/scripts/env.ts` | Same `.env` overlay, allowlist, and `.dev.vars` serialization | None; keep source identical |
| `celld/scripts/dev.ts` | Same native `celld dev` launcher with an optional config path | Waku prepares/builds its frontend and passes generated `.wrangler.celld.jsonc` |
| `celld/scripts/deploy.ts` | Same temporary `.wrangler.deploy.jsonc` and native `celld deploy` wrapper with optional source config | Waku prepares a generated `.wrangler.celld.jsonc` from the canonical file |
| `celld/env.ts` | Same `workerEnvironment.required/optional` contract | Binding types differ (`ROOM` for Hono, `ASSETS` for Waku) |
| `.env.example`, `.env.prod.example` | Same application variable shape and examples | Add app-specific keys intentionally |
| `wrangler.jsonc` | One root configuration, stable binding names, no secrets | Hono exports DOs and derives an ignored `.wrangler.web.jsonc` automatically when `web/` exists; Waku uses its source Worker entry for Vite and derives a Celld bundle config |
| Project scripts | `pnpm dev`, `pnpm dev:celld`, `pnpm check`, `pnpm deploy` | Hono optionally has `pnpm dev:web` and `pnpm build:web`; **the single `pnpm deploy` auto-detects `web/`**. Waku has `pnpm build`, `pnpm build:celld` and `pnpm env:local` |
| Optional browser frontend | A browser client consumes the same stable public HTTP/WebSocket APIs as mobile and other clients | Hono's `web/` is an isolated client-only React/Vite project; Waku's SSR/RSC frontend is framework-native and not optional |
| State ownership | Explicit domain persistence, standard HTTP for public APIs, prefer Celld-native bindings | Waku Server Actions are for the web app's UI, not external APIs |

## Maintenance procedure

When changing a shared convention:

1. Review the counterpart repository's implementation before editing.
2. Apply equivalent changes in **both repositories**, without forcing Waku to mimic Hono routing or Hono to require a frontend.
3. Keep the shared `ARCHITECTURE.md` principles and the fleet runbook prefix identical. Keep `celld/scripts/env.ts`, `dev.ts` and `deploy.ts` identical whenever possible.
4. Update the workflows, docs and tests together; note unavoidable differences in both PR descriptions.
5. Run `pnpm check` in each repository, then build and test on an actual Celld runtime for runtime-related changes.
6. Never rename persistent Worker/binding identities casually when syncing repository names.

**Important:** GitHub Actions concurrency is scoped to each repository, not shared across them. One Celld fleet runs one composed application. Standalone starter deployments need separate fleets/buckets; a shared Xicar fleet must receive **one combined application deployment** from the composition repository, not independent Hono and Waku publishes. Deploys targeting the same fleet also need a fleet-wide deployment lock.

Waku's generated `.wrangler.celld.jsonc` is a disposable artifact, **not** a second hand-maintained environment configuration. Hono's `.wrangler.web.jsonc` is also a disposable artifact, not another hand-maintained environment config. Its root dependencies remain API-only even when `web/` is present; the repository layout alone determines SPA inclusion. The Waku/Celld RSC packaging bridge is still experimental. Matching conventions **do not** imply Waku production compatibility has been demonstrated.
