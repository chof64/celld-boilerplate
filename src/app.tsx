import { useEffect, useState, type FormEvent } from "react";
import { mergeMessages, type ChatMessage } from "./lib/chat";

const rooms = ["lobby", "drivers", "dispatch"] as const;
const messagesUrl = (room: string) => `/api/rooms/${room}/messages`;

function initialRoom(): string {
  const match = window.location.pathname.match(/^\/rooms\/([a-z]+)\/?$/);
  return match && rooms.some((room) => room === match[1]) ? match[1] : "lobby";
}

export function ChatApp() {
  const [room, setRoom] = useState(initialRoom);
  const [name, setName] = useState("Guest");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const onBack = () => setRoom(initialRoom());
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  useEffect(() => {
    let active = true;
    let socket: WebSocket;
    let retry: number | undefined;

    async function loadHistory() {
      try {
        const response = await fetch(messagesUrl(room));
        if (!response.ok) throw new Error("Could not load messages");
        const data = (await response.json()) as { messages: ChatMessage[] };
        if (active) setMessages((current) => mergeMessages(current, data.messages));
      } catch {
        if (active) setError("Chat is unavailable. Check that Celld is running.");
      }
    }

    function connect() {
      const url = new URL(`/api/rooms/${room}/socket`, location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      setStatus("Connecting…");

      socket.onopen = () => {
        setStatus("Live");
        void loadHistory();
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type: string; message: ChatMessage };
          if (data.type === "message" && data.message?.id) {
            setMessages((current) => mergeMessages(current, [data.message]));
          }
        } catch {
          setError("Could not read a realtime message.");
        }
      };
      socket.onclose = () => {
        if (!active) return;
        setStatus("Reconnecting…");
        retry = window.setTimeout(connect, 1500);
      };
      socket.onerror = () => socket.close();
    }

    setMessages([]);
    setError("");
    void loadHistory();
    connect();

    return () => {
      active = false;
      window.clearTimeout(retry);
      socket.close();
    };
  }, [room]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !draft.trim() || sending) return;

    setSending(true);
    setError("");
    try {
      const response = await fetch(messagesUrl(room), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userName: name.trim(), text: draft.trim() }),
      });
      if (!response.ok) throw new Error("Could not send message");
      const message = (await response.json()) as ChatMessage;
      setMessages((current) => mergeMessages(current, [message]));
      setDraft("");
    } catch {
      setError("Message was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  function changeRoom(next: string) {
    setRoom(next);
    history.pushState(null, "", next === "lobby" ? "/" : `/rooms/${next}`);
  }

  return (
    <main className="chat">
      <header>
        <h1>Celld + Hono Chat</h1>
        <p>REST for messages, Durable Objects for realtime updates.</p>
      </header>

      <div className="controls">
        <label>
          Room
          <select value={room} disabled={sending} onChange={(event) => changeRoom(event.target.value)}>
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

      {error && <p role="alert" className="error">{error}</p>}
      <form onSubmit={(event) => void send(event)}>
        <input
          aria-label="Message"
          placeholder="Write a message…"
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button disabled={sending || !name.trim() || !draft.trim()}>Send</button>
      </form>
      <footer>Reference example only — no authentication or access control.</footer>
    </main>
  );
}
