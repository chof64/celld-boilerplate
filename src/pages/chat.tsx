import { ChatApp } from "../components/chat-app";

export default function ChatPage() {
  return (
    <>
      <title>Chat demo · Celld + Hono</title>
      <ChatApp room="lobby" />
    </>
  );
}
