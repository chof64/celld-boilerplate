import { DurableObject } from "cloudflare:workers";

export interface RoomSnapshot {
  topic: string | null;
  connections: number;
}

export class Room extends DurableObject {
  async snapshot(): Promise<RoomSnapshot> {
    const topic = (await this.ctx.storage.get<string>("topic")) ?? null;

    return {
      topic,
      connections: this.ctx.getWebSockets().length,
    };
  }

  async setTopic(topic: string): Promise<RoomSnapshot> {
    await this.ctx.storage.put("topic", topic);
    return this.snapshot();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  webSocketMessage(_socket: WebSocket, message: string | ArrayBuffer): void {
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(message);
    }
  }
}
