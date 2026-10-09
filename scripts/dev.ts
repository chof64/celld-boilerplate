import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

import {
  loadApplicationEnvironment,
  selectWorkerEnvironment,
  serializeDevVars,
} from "./env";

const environment = selectWorkerEnvironment(loadApplicationEnvironment());

writeFileSync(".dev.vars", serializeDevVars(environment), {
  encoding: "utf8",
  mode: 0o600,
});

const child = spawn(
  "celld",
  ["dev", ".", "--watch-ignore", "src/pages.gen.ts"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
