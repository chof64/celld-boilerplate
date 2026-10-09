import { Hono } from "hono";

import type { Env } from "../../../celld/env";

export const healthRoute = new Hono<{ Bindings: Env }>().get("/health", (c) =>
  c.json({
    ok: true,
    greeting: c.env.GREETING ?? "Hello from Celld",
  }),
);
