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

  it("reads a room snapshot through its resource route", async () => {
    const roomIds: string[] = [];
    const snapshot = { connections: 2, messages: [] };
    const env = {
      ROOM: {
        getByName: (roomId: string) => {
          roomIds.push(roomId);
          return { snapshot: async () => snapshot };
        },
      },
    } as unknown as Env;

    const response = await app.request("/api/rooms/lobby", undefined, env);

    expect(response.status).toBe(200);
    expect(roomIds).toEqual(["lobby"]);
    await expect(response.json()).resolves.toEqual(snapshot);
  });

  it("lists message history through its resource route", async () => {
    const messages = [
      { id: "message-1", userName: "Ada", text: "Hello", sentAt: 1 },
    ];
    const env = {
      ROOM: {
        getByName: () => ({ listMessages: async () => messages }),
      },
    } as unknown as Env;

    const response = await app.request(
      "/api/rooms/lobby/messages",
      undefined,
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ messages });
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

  it("rejects invalid room parameters before calling the Durable Object", async () => {
    const env = {
      ROOM: {
        getByName: () => {
          throw new Error("Room must not be called");
        },
      },
    } as unknown as Env;

    const response = await app.request(
      `/api/rooms/${"x".repeat(129)}`,
      undefined,
      env,
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid message bodies before calling the Durable Object", async () => {
    const env = {
      ROOM: {
        getByName: () => {
          throw new Error("Room must not be called");
        },
      },
    } as unknown as Env;

    const response = await app.request(
      "/api/rooms/lobby/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userName: "Ada", text: "" }),
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("forwards the WebSocket route to the Durable Object", async () => {
    const seen: Array<{ roomId: string; path: string; upgrade: string | null }> = [];
    const env = {
      ROOM: {
        getByName: (roomId: string) => ({
          fetch: async (request: Request) => {
            seen.push({
              roomId,
              path: new URL(request.url).pathname,
              upgrade: request.headers.get("upgrade"),
            });

            return new Response("Expected a WebSocket upgrade", {
              status: 426,
            });
          },
        }),
      },
    } as unknown as Env;

    const response = await app.request(
      "/api/rooms/lobby/socket",
      { headers: { upgrade: "websocket" } },
      env,
    );

    expect(response.status).toBe(426);
    expect(seen).toEqual([
      {
        roomId: "lobby",
        path: "/api/rooms/lobby/socket",
        upgrade: "websocket",
      },
    ]);
  });
});
