"use client";

import { useEffect, useState, type FormEvent } from "react";

import { mergeMessages, rooms, type ChatMessage } from "../lib/chat";

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
    <div className="chat-page">
      <header className="chat-topbar">
        <div className="chat-topbar-inner">
          <a className="chat-back" href="/">
            <span aria-hidden="true">←</span><span>celld-hono</span>
          </a>
          <div className={`chat-connection${status === "Live" ? " is-live" : ""}`} role="status">
            <span aria-hidden="true" />{status}
          </div>
        </div>
      </header>

      <main className="chat-main">
        <div className="chat-room-header">
          <div className="chat-room-title">
            <p className="chat-eyebrow">DEMO ROOM</p>
            <h1>#{room}</h1>
            <p className="chat-description">Messages update in real time.</p>
          </div>
          <div className="chat-controls">
            <label className="chat-field">
              <span>Room</span>
              <select
                value={room}
                onChange={(event) => {
                  const next = event.target.value;
                  window.location.assign(next === "lobby" ? "/chat" : `/rooms/${next}`);
                }}
              >
                {rooms.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
            <label className="chat-field chat-name-field">
              <span>Your name</span>
              <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
            </label>
          </div>
        </div>

        <section className="chat-messages" aria-label="Messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <span className="chat-empty-mark" aria-hidden="true">↳</span>
              <p>No messages yet</p>
              <span>Say hello to start the conversation.</span>
            </div>
          ) : messages.map((message) => (
            <article className="chat-message" key={message.id}>
              <div className="chat-message-meta">
                <strong>{message.userName}</strong>
                <time dateTime={new Date(message.sentAt).toISOString()}>
                  {new Date(message.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </time>
              </div>
              <p>{message.text}</p>
            </article>
          ))}
        </section>

        {error && <p className="chat-error" role="alert">{error}</p>}
        <form className="chat-composer" onSubmit={(event) => void send(event)}>
          <label className="visually-hidden" htmlFor="chat-message">Message</label>
          <input
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message #${room}`}
            maxLength={2000}
          />
          <button aria-label="Send message" disabled={!draft.trim() || !name.trim() || sending}>
            <span aria-hidden="true">↑</span>
          </button>
        </form>
        <p className="chat-footnote">Open demo · No authentication · Not for production messaging</p>
      </main>
    </div>
  );
}
