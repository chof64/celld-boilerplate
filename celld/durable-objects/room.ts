import { DurableObject } from "cloudflare:workers";

export interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  sentAt: number;
}

export interface RoomSnapshot {
  connections: number;
  messages: ChatMessage[];
}

type MessageRow = {
  id: string;
  user_name: string;
  text: string;
  sent_at: number;
};

export class Room extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL,
        text TEXT NOT NULL,
        sent_at INTEGER NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS messages_sent_at ON messages(sent_at, id)",
    );
  }

  async snapshot(): Promise<RoomSnapshot> {
    return {
      connections: this.ctx.getWebSockets().length,
      messages: await this.listMessages(),
    };
  }

  async listMessages(limit = 100): Promise<ChatMessage[]> {
    const rows = this.ctx.storage.sql
      .exec<MessageRow>(
        `
          SELECT id, user_name, text, sent_at
          FROM messages
          ORDER BY sent_at DESC, id DESC
          LIMIT ?
        `,
        limit,
      )
      .toArray()
      .reverse();

    return rows.map((row) => ({
      id: row.id,
      userName: row.user_name,
      text: row.text,
      sentAt: row.sent_at,
    }));
  }

  async sendMessage(input: {
    userName: string;
    text: string;
  }): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      userName: input.userName,
      text: input.text,
      sentAt: Date.now(),
    };

    this.ctx.storage.sql.exec(
      `
        INSERT INTO messages(id, user_name, text, sent_at)
        VALUES (?, ?, ?, ?)
      `,
      message.id,
      message.userName,
      message.text,
      message.sentAt,
    );

    const event = JSON.stringify({
      type: "message",
      message,
    });

    for (const socket of this.ctx.getWebSockets()) {
      socket.send(event);
    }

    return message;
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
}
