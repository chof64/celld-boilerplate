import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

import { createWebConfig, hasWebApplication } from "../celld/scripts/web-config";

const wrangler = parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
);

describe("automatic Hono application deployment", () => {
  it("detects a web project when web/package.json exists", () => {
    expect(hasWebApplication()).toBe(true);
  });

  it("runs API-only when the optional web directory is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "celld-hono-api-"));
    try {
      expect(hasWebApplication(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses incomplete web directories instead of silently dropping the SPA", () => {
    const root = mkdtempSync(join(tmpdir(), "celld-hono-incomplete-"));
    try {
      mkdirSync(join(root, "web"));
      expect(() => hasWebApplication(root)).toThrow("missing web/package.json");
      writeFileSync(join(root, "web", "package.json"), "{}");
      expect(hasWebApplication(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves Worker identity, Durable Objects and migrations when a web app exists", () => {
    const deployed = createWebConfig(wrangler);
    expect(deployed.name).toBe(wrangler.name);
    expect(deployed.main).toBe("./celld/index.ts");
    expect(deployed.durable_objects).toEqual(wrangler.durable_objects);
    expect(deployed.migrations).toEqual(wrangler.migrations);
    expect(wrangler.assets).toBeUndefined();
  });

  it("serves built assets and sends HTTP API routes to Hono first", () => {
    expect(createWebConfig(wrangler).assets).toEqual({
      directory: "./web/dist",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/health"],
    });
  });

  it("rejects accidental SPA configuration in the canonical API-only Wrangler", () => {
    expect(() => createWebConfig({ ...wrangler, assets: { directory: "./web/dist" } }))
      .toThrow("must stay API-only");
  });

  it("keeps frontend dependencies optional and deployment selection automatic", () => {
    const backend = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const frontend = hasWebApplication()
      ? JSON.parse(readFileSync(new URL("../web/package.json", import.meta.url), "utf8"))
      : null;
    const deploy = readFileSync(
      new URL("../celld/scripts/deploy-app.ts", import.meta.url),
      "utf8",
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/deploy.yml", import.meta.url),
      "utf8",
    );

    expect(backend.dependencies.react).toBeUndefined();
    expect(backend.dependencies.vite).toBeUndefined();
    if (frontend) {
      expect(frontend.dependencies.react).toBeTruthy();
      expect(frontend.devDependencies.vite).toBeTruthy();
    }
    expect(backend.scripts.deploy).toContain("celld/scripts/deploy-app.ts");
    expect(backend.scripts["deploy:web"]).toBeUndefined();
    expect(deploy).toContain("hasWebApplication()");
    expect(deploy).toContain("celld/scripts/deploy.ts");
    expect(workflow).not.toContain("DEPLOY_WEB");
    expect(workflow).toContain("if [[ -d web ]]");
    expect(workflow).toContain("pnpm deploy -- --dry-run");
  });
});
