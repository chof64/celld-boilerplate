import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";

import {
  loadApplicationEnvironment,
  selectWorkerEnvironment,
} from "./env";

const deployConfigPath = ".wrangler.deploy.jsonc";
const web =
  existsSync("src/waku.server.tsx") && existsSync("src/pages/index.tsx");

function runStep(command: string, args: string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function readWranglerConfig(): Record<string, unknown> {
  const errors: ParseError[] = [];
  const config = parse(readFileSync("wrangler.jsonc", "utf8"), errors, {
    allowTrailingComma: true,
  }) as unknown;

  if (errors.length > 0) {
    const summary = errors
      .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join(", ");

    throw new Error(`Could not parse wrangler.jsonc: ${summary}`);
  }

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("wrangler.jsonc must contain a JSON object");
  }

  return config as Record<string, unknown>;
}

function createDeployConfig(
  workerEnvironment: Record<string, string>,
): Record<string, unknown> {
  const config = readWranglerConfig();
  const configuredVars =
    config.vars && typeof config.vars === "object" && !Array.isArray(config.vars)
      ? (config.vars as Record<string, unknown>)
      : {};

  if (!web) {
    return {
      ...config,
      vars: {
        ...configuredVars,
        ...workerEnvironment,
      },
    };
  }

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
    vars: {
      ...configuredVars,
      ...workerEnvironment,
    },
  };
}

async function run(): Promise<number> {
  if (web) {
    const built = await runStep("pnpm", ["build:web"]);
    if (built) return built;
    if (!existsSync("dist/public/index.html")) {
      throw new Error("Waku did not generate dist/public/index.html");
    }
  }

  const deploymentEnvironment = loadApplicationEnvironment();
  const workerEnvironment = selectWorkerEnvironment(deploymentEnvironment);
  const deployConfig = createDeployConfig(workerEnvironment);

  writeFileSync(deployConfigPath, JSON.stringify(deployConfig, null, 2).concat("\n"), {
    encoding: "utf8",
    mode: 0o600,
  });

  const child = spawn(
    "celld",
    ["deploy", "--config", deployConfigPath, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: deploymentEnvironment,
    },
  );

  return await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`celld deploy terminated by signal ${signal}`));
        return;
      }

      resolve(code ?? 1);
    });
  });
}

try {
  process.exitCode = await run();
} finally {
  rmSync(deployConfigPath, { force: true });
}
