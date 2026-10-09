"use client";

import { useEffect, useState, type FormEvent } from "react";

import { mergeMessages, type ChatMessage } from "../lib/chat";
import { rooms } from "../lib/rooms";

export function ChatApp({ room }: { room: string }) {
  const [name, setName] = useState("Guest");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const messagesUrl = `/api/rooms/${encodeURIComponent(room)}/messages`;

  useEffect(() => {
    let active = true;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    async function loadHistory() {
      try {
        const response = await fetch(messagesUrl);
        if (!response.ok) throw new Error("History unavailable");
        const data = (await response.json()) as { messages: ChatMessage[] };
        if (active) {
          setMessages((previous) => mergeMessages(previous, data.messages));
          setError("");
        }
      } catch {
        if (active) setError("Cannot load chat history. Check the Celld backend.");
      }
    }

    function connect() {
      const url = new URL(`/api/rooms/${encodeURIComponent(room)}/socket`, location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      setStatus("Connecting…");
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (!active) return;
        setStatus("Live");
        void loadHistory();
      };
      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data) as { type: string; message: ChatMessage };
          if (payload.type === "message" && payload.message?.id) {
            setMessages((previous) => mergeMessages(previous, [payload.message]));
          }
        } catch {
          // Ignore unrecognized events; they must not disrupt the socket.
        }
      };
      socket.onclose = () => {
        if (!active) return;
        setStatus("Reconnecting…");
        reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => socket?.close();
    }

    setMessages([]);
    void loadHistory();
    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [room, messagesUrl]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !draft.trim() || sending) return;

    setSending(true);
    setError("");
    try {
      const response = await fetch(messagesUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userName: name.trim(), text: draft.trim() }),
      });
      if (!response.ok) throw new Error("Message rejected");
      const message = (await response.json()) as ChatMessage;
      setMessages((previous) => mergeMessages(previous, [message]));
      setDraft("");
    } catch {
      setError("Message was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="chat">
      <header>
        <h1>Celld + Hono + Waku</h1>
        <p>Static Waku pages. Live Hono APIs and Durable Objects.</p>
      </header>

      <div className="controls">
        <label>
          Room
          <select
            value={room}
            onChange={(event) => {
              const next = event.target.value;
              window.location.assign(next === "lobby" ? "/" : `/rooms/${next}`);
            }}
          >
            {rooms.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>
          Name
          <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </label>
        <span role="status">{status}</span>
      </div>

      <section className="messages" aria-label="Messages" aria-live="polite">
        {messages.length === 0 && <p className="empty">No messages yet.</p>}
        {messages.map((message) => (
          <article key={message.id}>
            <strong>{message.userName}</strong>
            <time dateTime={new Date(message.sentAt).toISOString()}>
              {new Date(message.sentAt).toLocaleTimeString()}
            </time>
            <p>{message.text}</p>
          </article>
        ))}
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={(event) => void send(event)}>
        <input
          aria-label="Message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
        />
        <button disabled={!draft.trim() || !name.trim() || sending}>Send</button>
      </form>
      <footer>Unauthenticated reference chat — not production messaging.</footer>
    </main>
  );
}
