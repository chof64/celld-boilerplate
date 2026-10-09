import { Hono } from "hono";

import type { Env } from "../../celld/env";
import { healthRoute } from "./routes/health";
import { roomMessagesRoute } from "./routes/room/messages";
import { roomSocketRoute } from "./routes/room/socket";
import { roomRoute } from "./routes/room/details";

export const app = new Hono<{ Bindings: Env }>()
  .route("/", healthRoute)
  .route("/", roomRoute)
  .route("/", roomMessagesRoute)
  .route("/", roomSocketRoute);

export type AppType = typeof app;
