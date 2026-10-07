import { describe, expect, it } from "vitest";

import {
  selectWorkerEnvironment,
  serializeDevVars,
} from "../celld/scripts/env";

describe("Worker environment", () => {
  it("exposes only declared Worker variables", () => {
    expect(
      selectWorkerEnvironment({
        GREETING: "Hello",
        CELLD_BUCKET: "s3://root-level-fleet-data",
        CI_JOB_TOKEN: "do-not-expose",
      }),
    ).toEqual({
      GREETING: "Hello",
    });
  });

  it("serializes selected values for Celld .dev.vars", () => {
    expect(
      serializeDevVars({
        GREETING: "Hello Celld",
      }),
    ).toBe('GREETING="Hello Celld"\n');
  });
});
