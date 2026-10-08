import { Hono } from "hono";

import type { Env } from "../env";
import { healthRoute } from "./routes/health";
import { roomMessagesRoute } from "./routes/room-messages";
import { roomSocketRoute } from "./routes/room-socket";
import { roomRoute } from "./routes/rooms";

export const app = new Hono<{ Bindings: Env }>()
  .route("/", healthRoute)
  .route("/", roomRoute)
  .route("/", roomMessagesRoute)
  .route("/", roomSocketRoute);

export type AppType = typeof app;
