import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

import { createWebConfig } from "../celld/scripts/web-config";

const wrangler = parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
);

describe("optional React SPA packaging", () => {
  it("preserves Worker identity, Durable Objects and migrations", () => {
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

  it("keeps independent web dependencies outside the backend package", () => {
    const backend = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const frontend = JSON.parse(
      readFileSync(new URL("../web/package.json", import.meta.url), "utf8"),
    );

    expect(backend.dependencies.react).toBeUndefined();
    expect(backend.dependencies.vite).toBeUndefined();
    expect(frontend.dependencies.react).toBeTruthy();
    expect(frontend.devDependencies.vite).toBeTruthy();
    expect(backend.scripts.deploy).toContain("celld/scripts/deploy.ts");
    expect(backend.scripts["deploy:web"]).toContain("celld/scripts/deploy-web.ts");
  });
});
