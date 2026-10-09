export interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  sentAt: number;
}

export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);

  return [...messages.values()]
    .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id))
    .slice(-100);
}
