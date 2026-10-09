import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";

import type { Env } from "../../../../celld/env";
import { roomParams } from "./params";

export const roomSocketRoute = new Hono<{ Bindings: Env }>().get(
  "/api/rooms/:roomId/socket",
  sValidator("param", roomParams),
  async (c) => {
    const { roomId } = c.req.valid("param");
    const room = c.env.ROOM.getByName(roomId);

    return room.fetch(c.req.raw);
  },
);
