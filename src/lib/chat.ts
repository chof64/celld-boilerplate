export interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  sentAt: number;
}

export interface ChatRoom {
  id: string;
  name: string;
  subtitle: string;
  symbol: string;
}

export const rooms: readonly ChatRoom[] = [
  { id: "lobby", name: "General", subtitle: "All things Celld", symbol: "#" },
  { id: "drivers", name: "Drivers", subtitle: "Notes from the road", symbol: "↗" },
  { id: "dispatch", name: "Dispatch", subtitle: "Stay in sync", symbol: "◈" },
  { id: "support", name: "Support", subtitle: "Ask the community", symbol: "?" },
];

export function roomPath(id: string, suffix = ""): string {
  return "/api/rooms/" + encodeURIComponent(id) + suffix;
}

export function roomFromLocation(pathname: string): string {
  const match = /^\/rooms\/([^/]+)\/?$/.exec(pathname);
  if (!match) return "lobby";
  try {
    const roomId = decodeURIComponent(match[1]);
    return roomId.length > 0 && roomId.length <= 128 ? roomId : "lobby";
  } catch {
    return "lobby";
  }
}

export function readMessage(input: unknown): ChatMessage | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Partial<ChatMessage>;
  return typeof value.id === "string" &&
    typeof value.userName === "string" &&
    typeof value.text === "string" &&
    typeof value.sentAt === "number" &&
    Number.isFinite(value.sentAt)
      ? {
          id: value.id,
          userName: value.userName,
          text: value.text,
          sentAt: value.sentAt,
        }
      : null;
}

export function readHistory(payload: unknown): ChatMessage[] {
  if (!payload || typeof payload !== "object" || !("messages" in payload)) {
    throw new Error("Invalid history response");
  }
  const messages = payload.messages;
  if (!Array.isArray(messages)) throw new Error("Invalid history response");
  return messages.map(readMessage).filter((message): message is ChatMessage => message !== null);
}

export function mergeMessages(
  previous: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const deduplicated = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) deduplicated.set(message.id, message);
  return [...deduplicated.values()]
    .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id))
    .slice(-100);
}
