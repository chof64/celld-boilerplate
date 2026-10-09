import type { PageProps } from "waku/router";

import { ChatApp } from "../../components/chat-app";
import { rooms } from "../../lib/rooms";

export default function RoomPage({ roomId }: PageProps<"/rooms/[roomId]">) {
  return (
    <>
      <title>{roomId} · Celld Chat</title>
      <ChatApp room={roomId} />
    </>
  );
}

export const getConfig = async () => ({
  render: "static" as const,
  staticPaths: rooms.filter((room) => room !== "lobby"),
});
