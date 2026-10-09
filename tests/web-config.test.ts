import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

import { createWebConfig, hasWebApplication } from "../scripts/web-config";

describe("optional static Waku frontend", () => {
  it("detects Waku pages and remains API-only without them", () => {
    const root = mkdtempSync(join(tmpdir(), "celld-hono-"));
    try {
      expect(hasWebApplication(root)).toBe(false);
      mkdirSync(join(root, "src/pages"), { recursive: true });
      writeFileSync(join(root, "src/pages/index.tsx"), "export default () => null;");
      expect(() => hasWebApplication(root)).toThrow("Static Waku requires");
      writeFileSync(join(root, "src/waku.server.tsx"), "export {};");
      expect(() => hasWebApplication(root)).toThrow("waku.config.ts");
      writeFileSync(join(root, "waku.config.ts"), "export default {};");
      expect(hasWebApplication(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves the Hono Worker and serves generated Waku assets without SPA fallback", () => {
    const config = parse(readFileSync("wrangler.jsonc", "utf8"));
    const combined = createWebConfig(config);

    expect(config.assets).toBeUndefined();
    expect(combined.main).toBe("./src/api/index.ts");
    expect(combined.name).toBe(config.name);
    expect(combined.durable_objects).toEqual(config.durable_objects);
    expect(combined.migrations).toEqual(config.migrations);
    expect(combined.assets).toEqual({
      directory: "./dist/public",
      html_handling: "drop-trailing-slash",
      run_worker_first: ["/api/*", "/health"],
    });
    expect(() => createWebConfig({ ...config, assets: { directory: "./src" } }))
      .toThrow("only compiled Waku dist/public");
  });
});
