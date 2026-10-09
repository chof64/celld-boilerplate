import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";

export const webConfigPath = ".wrangler.web.jsonc";
export const webDistPath = "web/dist";

export function hasWebApplication(root = "."): boolean {
  const web = join(root, "web");
  if (!existsSync(web)) return false;

  if (!statSync(web).isDirectory() || !existsSync(join(web, "package.json"))) {
    throw new Error("web/ exists but is not a valid frontend project (missing web/package.json)");
  }

  return true;
}

export function createWebConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Expected a Wrangler configuration object");
  }

  const root = config as Record<string, unknown>;
  if (root.assets !== undefined) {
    throw new Error("The canonical wrangler.jsonc must stay API-only; SPA assets are generated when web/ exists");
  }
  if (typeof root.name !== "string" || typeof root.main !== "string") {
    throw new Error("Expected a Worker name and entrypoint");
  }

  return {
    ...root,
    assets: {
      directory: "./web/dist",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/health"],
    },
  };
}

export function readWebConfig(): Record<string, unknown> {
  const errors: ParseError[] = [];
  const root = parse(readFileSync("wrangler.jsonc", "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length > 0) {
    throw new Error("Invalid wrangler.jsonc: " +
      errors.map((error) => printParseErrorCode(error.error)).join(", "));
  }
  return createWebConfig(root);
}

export function verifyWebBuild(): void {
  if (!existsSync(webDistPath + "/index.html")) {
    throw new Error("Missing web/dist/index.html; run pnpm build:web first");
  }
}
