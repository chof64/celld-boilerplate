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

  it("uses REST externally and Durable Object RPC internally", async () => {
    const received: Array<{ userName: string; text: string }> = [];
    const env = {
      ROOM: {
        getByName: () => ({
          sendMessage: async (message: { userName: string; text: string }) => {
            received.push(message);

            return {
              id: "message-1",
              ...message,
              sentAt: 1,
            };
          },
        }),
      },
    } as unknown as Env;

    const response = await app.request(
      "/api/rooms/lobby/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userName: "Ada",
          text: "Hello",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    expect(received).toEqual([
      {
        userName: "Ada",
        text: "Hello",
      },
    ]);
    await expect(response.json()).resolves.toEqual({
      id: "message-1",
      userName: "Ada",
      text: "Hello",
      sentAt: 1,
    });
  });
});
