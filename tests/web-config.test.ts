import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

import { createWebConfig, hasWebApplication } from "../scripts/web-config";

describe("optional frontend", () => {
  it("deploys API-only without a web entry, and detects a complete one", () => {
    const root = mkdtempSync(join(tmpdir(), "celld-hono-"));
    try {
      expect(hasWebApplication(root)).toBe(false);
      writeFileSync(join(root, "index.html"), "<html></html>");
      expect(() => hasWebApplication(root)).toThrow("requires both");
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src/main.tsx"), "export {}");
      expect(hasWebApplication(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("publishes compiled assets while preserving the Worker and DO identities", () => {
    const config = parse(readFileSync("wrangler.jsonc", "utf8"));
    const withWeb = createWebConfig(config);

    expect(config.assets).toBeUndefined();
    expect(withWeb.main).toBe("./src/api/index.ts");
    expect(withWeb.name).toBe(config.name);
    expect(withWeb.durable_objects).toEqual(config.durable_objects);
    expect(withWeb.migrations).toEqual(config.migrations);
    expect(withWeb.assets).toEqual({
      directory: "./dist",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/health"],
    });
    expect(() => createWebConfig({ ...config, assets: { directory: "./src" } }))
      .toThrow("only compiled dist/");
  });
});
