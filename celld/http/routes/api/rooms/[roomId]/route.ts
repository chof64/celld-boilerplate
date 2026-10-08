import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";

import type { Env } from "../../../../../env";
import { roomParams } from "./params";

export const roomRoute = new Hono<{ Bindings: Env }>().get(
  "/",
  sValidator("param", roomParams),
  async (c) => {
    const { roomId } = c.req.valid("param");
    const room = c.env.ROOM.getByName(roomId);

    return c.json(await room.snapshot());
  },
);
