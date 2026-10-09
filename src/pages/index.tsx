import { ChatApp } from "../components/chat-app";

export default function HomePage() {
  return (
    <>
      <title>General · Celld Chat</title>
      <ChatApp room="lobby" />
    </>
  );
}

export const getConfig = async () => ({ render: "static" as const });
