import { Hono } from "hono";

import type { Env } from "../env";
import { roomsRoutes } from "./routes/api/rooms";
import { healthRoute } from "./routes/health/route";

export const app = new Hono<{ Bindings: Env }>()
  .route("/health", healthRoute)
  .route("/api/rooms", roomsRoutes);

export type AppType = typeof app;
