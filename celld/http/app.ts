import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../env";

const roomParams = z.object({
  roomId: z.string().trim().min(1).max(128),
});

const topicBody = z.object({
  topic: z.string().trim().min(1).max(256),
});

export const app = new Hono<{ Bindings: Env }>()
  .get("/health", (c) =>
    c.json({
      ok: true,
      greeting: c.env.GREETING ?? "Hello from Celld",
    }),
  )
  .get(
    "/api/rooms/:roomId",
    sValidator("param", roomParams),
    async (c) => {
      const { roomId } = c.req.valid("param");
      const room = c.env.ROOM.getByName(roomId);

      return c.json(await room.snapshot());
    },
  )
  .put(
    "/api/rooms/:roomId/topic",
    sValidator("param", roomParams),
    sValidator("json", topicBody),
    async (c) => {
      const { roomId } = c.req.valid("param");
      const { topic } = c.req.valid("json");
      const room = c.env.ROOM.getByName(roomId);

      return c.json(await room.setTopic(topic));
    },
  )
  .get(
    "/api/rooms/:roomId/socket",
    sValidator("param", roomParams),
    async (c) => {
      const { roomId } = c.req.valid("param");
      const room = c.env.ROOM.getByName(roomId);

      return room.fetch(c.req.raw);
    },
  );

export type AppType = typeof app;
