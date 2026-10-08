import { Hono } from "hono";

import type { Env } from "../../../../env";
import { roomRoute } from "./[roomId]/route";
import { roomMessagesRoute } from "./[roomId]/messages/route";
import { roomSocketRoute } from "./[roomId]/socket/route";

export const roomsRoutes = new Hono<{ Bindings: Env }>()
  .route("/:roomId", roomRoute)
  .route("/:roomId/messages", roomMessagesRoute)
  .route("/:roomId/socket", roomSocketRoute);
