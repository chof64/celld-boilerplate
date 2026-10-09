import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type ParseError } from "jsonc-parser";

export function hasWebApplication(root = "."): boolean {
  const index = existsSync(join(root, "index.html"));
  const entry = existsSync(join(root, "src/main.tsx"));

  if (index !== entry) {
    throw new Error("A web app requires both index.html and src/main.tsx");
  }

  return index;
}

export function createWebConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (config.assets) {
    throw new Error("Do not serve src/ as static assets; only compiled dist/ is public");
  }

  return {
    ...config,
    assets: {
      directory: "./dist",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/health"],
    },
  };
}

export function readWebConfig() {
  const errors: ParseError[] = [];
  const config = parse(readFileSync("wrangler.jsonc", "utf8"), errors);
  if (errors.length || !config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Invalid wrangler.jsonc");
  }
  return createWebConfig(config as Record<string, unknown>);
}
