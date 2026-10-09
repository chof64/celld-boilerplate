import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../../env";
import { roomParams } from "./params";

const messageBody = z.object({
  userName: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1).max(2_000),
});

export const roomMessagesRoute = new Hono<{ Bindings: Env }>()
  .get(
    "/api/rooms/:roomId/messages",
    sValidator("param", roomParams),
    async (c) => {
      const { roomId } = c.req.valid("param");
      const room = c.env.ROOM.getByName(roomId);

      return c.json({
        messages: await room.listMessages(),
      });
    },
  )
  .post(
    "/api/rooms/:roomId/messages",
    sValidator("param", roomParams),
    sValidator("json", messageBody),
    async (c) => {
      const { roomId } = c.req.valid("param");
      const message = c.req.valid("json");
      const room = c.env.ROOM.getByName(roomId);

      return c.json(await room.sendMessage(message), 201);
    },
  );
