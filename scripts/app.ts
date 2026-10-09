import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";

import { hasWebApplication, readWebConfig } from "./web-config";

function run(command: string, args: string[], env = process.env): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function dev(web: boolean): Promise<number> {
  const scripts = web ? ["dev:celld", "dev:web"] : ["dev:celld"];
  const children: ChildProcess[] = scripts.map((script) =>
    spawn("pnpm", [script], { stdio: "inherit" }),
  );
  let stopping = false;
  let exitCode = 0;

  const stop = () => {
    stopping = true;
    for (const child of children) {
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
    }
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await Promise.all(children.map((child) => new Promise<void>((resolve) => {
    child.once("error", (error) => {
      console.error(error);
      exitCode = 1;
      stop();
      resolve();
    });
    child.once("close", (code) => {
      if (!stopping) {
        exitCode = code ?? 1;
        stop();
      }
      resolve();
    });
  })));

  return exitCode;
}

async function main(): Promise<number> {
  const mode = process.argv[2];
  const web = hasWebApplication();

  if (mode === "dev") return dev(web);

  if (mode === "check") {
    if (!web) return 0;
    const checked = await run("pnpm", ["typecheck:web"]);
    return checked || run("pnpm", ["build:web"]);
  }

  if (mode === "deploy") {
    if (web) {
      const built = await run("pnpm", ["build:web"]);
      if (built) return built;
      if (!existsSync("dist/public/index.html")) {
        throw new Error("Waku did not generate dist/public/index.html");
      }
      writeFileSync(".wrangler.web.jsonc", JSON.stringify(readWebConfig(), null, 2) + "\n", {
        mode: 0o600,
      });
    }

    const args = process.argv.slice(3);
    if (args[0] === "--") args.shift();

    try {
      return await run(
        "tsx",
        ["scripts/deploy.ts", ...args],
        web ? { ...process.env, CELLD_APPLICATION_CONFIG: ".wrangler.web.jsonc" } : process.env,
      );
    } finally {
      if (web) rmSync(".wrangler.web.jsonc", { force: true });
    }
  }

  throw new Error("Expected dev, check, or deploy");
}

process.exitCode = await main();
