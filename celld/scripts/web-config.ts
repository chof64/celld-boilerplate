import { existsSync, readFileSync } from "node:fs";
import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";

export const webConfigPath = ".wrangler.web.jsonc";
export const webDistPath = "web/dist";

export function createWebConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Expected a Wrangler configuration object");
  }

  const root = config as Record<string, unknown>;
  if (root.assets !== undefined) {
    throw new Error("The canonical wrangler.jsonc must stay API-only; configure SPA assets through deploy:web");
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
