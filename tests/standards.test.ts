import { existsSync, readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

import { workerEnvironment } from "../celld/env";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("shared Celld starter standards", () => {
  it("includes the same numbered architecture contract in both starters", () => {
    const architecture = read("ARCHITECTURE.md");
    const from = architecture.indexOf("## 1. Shared architecture principles");
    const to = architecture.indexOf("## 2. ", from);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const shared = architecture.slice(from, to);
    expect(shared.match(/^\\d+\\. \\*\\*/gm)).toHaveLength(13);
    expect(shared).toContain("chof64/celld-hono");
    expect(shared).toContain("chof64/celld-waku");
    expect(shared).toContain("ENV_FILE");
  });

  it("keeps one canonical root Wrangler config and an explicit env allowlist", () => {
    const wrangler = parse(read("wrangler.jsonc")) as Record<string, unknown>;
    expect(wrangler.name).toBeTruthy();
    expect(wrangler.main).toBeTruthy();
    expect(existsSync(new URL("../wrangler.prod.jsonc", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../wrangler.dev.jsonc", import.meta.url))).toBe(false);
    expect(workerEnvironment.optional).toContain("GREETING");
  });

  it("publishes through native Celld with app secrets isolated from fleet secrets", () => {
    const workflow = read(".github/workflows/deploy.yml");
    expect(workflow).toContain("secrets.ENV_FILE");
    expect(workflow).toContain("vars.CELLD_VERSION");
    expect(workflow).toContain("pnpm deploy -- --dry-run");
    expect(workflow).toContain("pnpm deploy");
    expect(workflow).toContain("CELLD_BUCKET");
    const deploy = read("celld/scripts/deploy.ts");
    expect(deploy).toContain('["deploy", "--config", deployConfigPath');
    expect(deploy).toContain(".wrangler.deploy.jsonc");
    expect(read("DEPLOY.md")).toContain("GitHub's concurrency groups do not coordinate across repositories");
  });
});
