import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

import { createWebConfig, hasWebApplication } from "../celld/scripts/web-config";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

const wrangler = parse(read("wrangler.jsonc"));

describe("colocated Hono/React source layout", () => {
  it("detects a root Vite frontend with src/main.tsx", () => {
    expect(hasWebApplication()).toBe(true);
  });

  it("accepts an API-only src/api project without browser files", () => {
    const root = mkdtempSync(join(tmpdir(), "celld-hono-api-"));
    try {
      mkdirSync(join(root, "src", "api"), { recursive: true });
      writeFileSync(join(root, "src", "api", "index.ts"), "export {};");
      expect(hasWebApplication(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails an incomplete frontend instead of silently omitting it", () => {
    const root = mkdtempSync(join(tmpdir(), "celld-hono-incomplete-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "index.html"), "<html></html>");
      expect(() => hasWebApplication(root)).toThrow("Incomplete web application");
      writeFileSync(join(root, "src", "main.tsx"), "export {};");
      expect(() => hasWebApplication(root)).toThrow("vite.config.ts");
      writeFileSync(join(root, "vite.config.ts"), "export default {};");
      expect(hasWebApplication(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retains one Worker identity and its Durable Object migrations", () => {
    const deployed = createWebConfig(wrangler);
    expect(deployed.name).toBe(wrangler.name);
    expect(deployed.main).toBe("./src/api/index.ts");
    expect(deployed.durable_objects).toEqual(wrangler.durable_objects);
    expect(deployed.migrations).toEqual(wrangler.migrations);
    expect(wrangler.assets).toBeUndefined();
  });

  it("serves only compiled browser assets, never raw src/api source", () => {
    expect(createWebConfig(wrangler).assets).toEqual({
      directory: "./dist",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/health"],
    });
    expect(createWebConfig({ ...wrangler, assets: { directory: "./src" } }))
      .toThrow("must not expose src/");
    expect(read("src/api/app.ts")).toContain('.route("/", roomMessagesRoute)');
    expect(read("src/api/routes/room/messages.ts")).toContain("/api/rooms/:roomId/messages");
  });

  it("uses one root package and builds the optional SPA without a deploy flag", () => {
    const pkg = JSON.parse(read("package.json"));
    const deploy = read("celld/scripts/deploy-app.ts");
    const check = read("celld/scripts/check-app.ts");
    const workflow = read(".github/workflows/deploy.yml");

    expect(pkg.scripts.dev).toContain("celld/scripts/dev-app.ts");
    expect(pkg.scripts.deploy).toContain("celld/scripts/deploy-app.ts");
    expect(pkg.scripts["deploy:web"]).toBeUndefined();
    expect(pkg.scripts["build:web"]).toBe("vite build");
    expect(deploy).toContain("hasWebApplication()");
    expect(deploy).toContain('["build:web"]');
    expect(check).toContain("hasWebApplication()");
    expect(workflow).not.toContain("DEPLOY_WEB");
    expect(workflow).not.toContain("pnpm --dir web");
    expect(workflow).toContain("pnpm deploy -- --dry-run");
  });
});
