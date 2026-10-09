import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

import {
  hasWebApplication,
  readWebConfig,
  verifyWebBuild,
  webConfigPath,
} from "./web-config";

async function run(command: string, args: string[], env = process.env): Promise<number> {
  const child = spawn(command, args, { env, stdio: "inherit" });
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited on signal ${signal}`));
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();

const withWeb = hasWebApplication();

if (withWeb) {
  const buildStatus = await run("pnpm", ["--dir", "web", "build"]);
  if (buildStatus !== 0) process.exit(buildStatus);

  verifyWebBuild();
  writeFileSync(webConfigPath, JSON.stringify(readWebConfig(), null, 2) + "\n", {
    mode: 0o600,
  });
}

try {
  process.exitCode = await run(
    "tsx",
    ["celld/scripts/deploy.ts", ...args],
    withWeb
      ? { ...process.env, CELLD_APPLICATION_CONFIG: webConfigPath }
      : process.env,
  );
} finally {
  if (withWeb) rmSync(webConfigPath, { force: true });
}
