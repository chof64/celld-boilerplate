import { spawnSync } from "node:child_process";

import { hasWebApplication } from "./web-config";

if (hasWebApplication()) {
  for (const args of [["typecheck:web"], ["build:web"]]) {
    const run = spawnSync("pnpm", args, { stdio: "inherit" });
    if (run.error) throw run.error;
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
}
