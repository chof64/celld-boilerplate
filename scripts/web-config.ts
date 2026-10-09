import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type ParseError } from "jsonc-parser";

export function hasWebApplication(root = "."): boolean {
  const entry = existsSync(join(root, "src/waku.server.tsx"));
  const home = existsSync(join(root, "src/pages/index.tsx"));

  if (entry !== home || (entry && !existsSync(join(root, "waku.config.ts")))) {
    throw new Error("Static Waku requires src/waku.server.tsx, src/pages/index.tsx and waku.config.ts");
  }

  return entry;
}

export function createWebConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (config.assets) {
    throw new Error("Do not expose src/; only compiled Waku dist/public is public");
  }

  return {
    ...config,
    assets: {
      directory: "./dist/public",
      html_handling: "drop-trailing-slash",
      run_worker_first: ["/api/*", "/health"],
    },
  };
}

export function readWebConfig(): Record<string, unknown> {
  const errors: ParseError[] = [];
  const config = parse(readFileSync("wrangler.jsonc", "utf8"), errors);
  if (errors.length || !config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Invalid wrangler.jsonc");
  }
  return createWebConfig(config as Record<string, unknown>);
}
