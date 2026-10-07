import { existsSync, readFileSync } from "node:fs";
import { parse as parseDotEnv } from "dotenv";

import { workerEnvironment } from "../env";

export type EnvironmentSource = Record<string, string | undefined>;

export function loadApplicationEnvironment(
  envFile = ".env",
  processEnvironment: EnvironmentSource = process.env,
): EnvironmentSource {
  const fileEnvironment = existsSync(envFile)
    ? parseDotEnv(readFileSync(envFile))
    : {};

  return {
    ...fileEnvironment,
    ...processEnvironment,
  };
}

export function selectWorkerEnvironment(
  source: EnvironmentSource,
): Record<string, string> {
  const selected: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of workerEnvironment.required) {
    const value = source[name];

    if (value === undefined || value === "") {
      missing.push(name);
      continue;
    }

    selected[name] = value;
  }

  for (const name of workerEnvironment.optional) {
    const value = source[name];

    if (value !== undefined && value !== "") {
      selected[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required Worker environment variables: ${missing.join(", ")}`,
    );
  }

  return selected;
}

export function serializeDevVars(environment: Record<string, string>): string {
  const entries = Object.entries(environment).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return entries
    .map(([name, value]) => {
      if (/[\r\n]/u.test(value)) {
        throw new Error(
          `Worker environment variable ${name} contains a newline and cannot be represented in .dev.vars`,
        );
      }

      return `${name}="${value}"`;
    })
    .join("\n")
    .concat(entries.length > 0 ? "\n" : "");
}
