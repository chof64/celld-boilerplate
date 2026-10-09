import { spawn, type ChildProcess } from "node:child_process";

import { hasWebApplication } from "./web-config";

const scripts = hasWebApplication() ? ["dev:celld", "dev:web"] : ["dev:celld"];
const children: ChildProcess[] = [];
let shuttingDown = false;

function stopOthers(signal: NodeJS.Signals = "SIGTERM"): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}

process.once("SIGINT", () => stopOthers("SIGINT"));
process.once("SIGTERM", () => stopOthers("SIGTERM"));

await new Promise<void>((resolve) => {
  let exited = 0;
  for (const script of scripts) {
    const child = spawn("pnpm", [script], { stdio: "inherit", env: process.env });
    children.push(child);
    child.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
      stopOthers();
    });
    child.on("exit", (code, signal) => {
      if (!shuttingDown) {
        process.exitCode = code ?? (signal ? 1 : 0);
        stopOthers();
      }
      exited += 1;
      if (exited === scripts.length) resolve();
    });
  }
});
