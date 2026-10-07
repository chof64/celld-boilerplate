import { describe, expect, it } from "vitest";

import type { Env } from "../celld/env";
import { app } from "../celld/http/app";

describe("HTTP API", () => {
  it("serves health through Hono", async () => {
    const env = {
      GREETING: "Hello from test",
    } as unknown as Env;

    const response = await app.request("/health", undefined, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      greeting: "Hello from test",
    });
  });
});
