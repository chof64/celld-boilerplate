import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import {
  mergeMessages,
  readHistory,
  readMessage,
  roomFromLocation,
  roomPath,
  rooms,
  type ChatMessage,
} from "./chat";

type Connection = "connecting" | "live" | "reconnecting" | "offline";

const STORAGE_NAME = "celld-hono-chat-name";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function useDisplayName(): [string, (name: string) => void] {
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_NAME) ?? "";
    } catch {
      return "";
    }
  });

  const updateName = (value: string) => {
    setName(value);
    try {
      window.localStorage.setItem(STORAGE_NAME, value);
    } catch {
      // Private browsing may disable storage; the chat still works without it.
    }
  };

  return [name, updateName];
}

export function ChatApp() {
  const [roomId, setRoomId] = useState(() => roomFromLocation(window.location.pathname));
  const [displayName, updateDisplayName] = useDisplayName();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connection, setConnection] = useState<Connection>("connecting");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const activeRoom = rooms.find((room) => room.id === roomId) ?? {
    id: roomId,
    name: roomId,
    subtitle: "Community room",
    symbol: "#",
  };

  useEffect(() => {
    const onNavigate = () => {
      setRoomId(roomFromLocation(window.location.pathname));
      setMessages([]);
      setError("");
    };

    window.addEventListener("popstate", onNavigate);
    return () => window.removeEventListener("popstate", onNavigate);
  }, []);

  useEffect(() => {
    document.title = activeRoom.name + " · Celld Chat";
  }, [activeRoom.name]);

  useEffect(() => {
    let active = true;
    let retries = 0;
    let socket: WebSocket | undefined;
    let timer: number | undefined;

    const loadHistory = async () => {
      try {
        const response = await fetch(roomPath(roomId, "/messages"), {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Chat backend returned " + response.status);
        const history = readHistory(await response.json());
        if (active) {
          setMessages((previous) => mergeMessages(previous, history));
          setError("");
        }
      } catch {
        if (active) setError("Chat history is unavailable. Start the Hono backend and retry.");
      }
    };

    const connect = () => {
      if (!active) return;
      setConnection(retries > 0 ? "reconnecting" : "connecting");

      const endpoint = new URL(roomPath(roomId, "/socket"), window.location.href);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";

      socket = new WebSocket(endpoint);
      socket.onopen = () => {
        if (!active) return;
        retries = 0;
        setConnection("live");
        void loadHistory();
      };
      socket.onmessage = (event: MessageEvent) => {
        if (!active || typeof event.data !== "string") return;
        try {
          const value: unknown = JSON.parse(event.data);
          if (
            value &&
            typeof value === "object" &&
            "type" in value &&
            value.type === "message" &&
            "message" in value
          ) {
            const message = readMessage(value.message);
            if (message) setMessages((previous) => mergeMessages(previous, [message]));
          }
        } catch {
          // Unknown socket events must not interrupt delivery of valid messages.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (!active) return;
        retries += 1;
        setConnection("reconnecting");
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** Math.min(retries, 4), 16000));
      };
    };

    setConnection("connecting");
    void loadHistory();
    connect();

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      socket?.close();
    };
  }, [roomId]);

  useEffect(() => {
    if (stickToBottom.current && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const selectRoom = (event: MouseEvent<HTMLAnchorElement>, nextId: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (nextId === roomId) return;
    const path = nextId === "lobby" ? "/" : "/rooms/" + encodeURIComponent(nextId);
    window.history.pushState({}, "", path);
    stickToBottom.current = true;
    setRoomId(nextId);
    setMessages([]);
    setError("");
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;

    const userName = displayName.trim();
    const text = draft.trim();
    if (userName.length < 1 || userName.length > 40 || text.length < 1 || text.length > 2000) {
      setError("Enter a display name (max 40 characters) and a message (max 2,000 characters).");
      return;
    }

    setSending(true);
    setError("");
    try {
      const response = await fetch(roomPath(roomId, "/messages"), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ userName, text }),
      });
      if (!response.ok) throw new Error("The message could not be sent (" + response.status + ").");

      const saved = readMessage(await response.json());
      if (!saved) throw new Error("Unexpected response from the chat backend.");
      stickToBottom.current = true;
      setMessages((previous) => mergeMessages(previous, [saved]));
      setDraft("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="workspace-heading">
          <div className="workspace-mark" aria-hidden="true">c</div>
          <div>
            <strong>celld<span className="brand-dot">.</span>chat</strong>
            <small>Hono + React</small>
          </div>
        </div>

        <div className="sidebar-label">
          <span>CHANNELS</span>
          <span className="sidebar-count">{rooms.length}</span>
        </div>

        <nav className="channels" aria-label="Chat channels">
          {rooms.map((room) => (
            <a
              key={room.id}
              href={room.id === "lobby" ? "/" : "/rooms/" + encodeURIComponent(room.id)}
              className={"channel" + (room.id === roomId ? " channel-active" : "")}
              aria-current={room.id === roomId ? "page" : undefined}
              onClick={(event) => selectRoom(event, room.id)}
            >
              <span className="channel-icon" aria-hidden="true">{room.symbol}</span>
              <span className="channel-info">
                <strong>{room.name}</strong>
                <small>{room.subtitle}</small>
              </span>
            </a>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-sparkle" aria-hidden="true">✦</span>
          <strong>One API. Every client.</strong>
          <p>This React SPA uses the same REST and WebSocket endpoints as any mobile app.</p>
        </div>
        <div className="sidebar-footnote"><span className="footnote-dot" /> Celld + Hono reference</div>
      </aside>

      <main className="conversation" aria-label={activeRoom.name + " chat"}>
        <header className="conversation-header">
          <div className="conversation-title">
            <div className="conversation-room-icon" aria-hidden="true">{activeRoom.symbol}</div>
            <div>
              <h1>{activeRoom.name}</h1>
              <p>{activeRoom.subtitle}</p>
            </div>
          </div>
          <div className="header-actions">
            <span className={"connection connection-" + connection} role="status">
              <span className="connection-indicator" />
              {connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : connection === "reconnecting" ? "Reconnecting" : "Offline"}
            </span>
          </div>
        </header>

        <section
          className="message-feed"
          ref={feedRef}
          role="log"
          aria-label="Messages"
          aria-live="polite"
          aria-relevant="additions"
          onScroll={() => {
            const feed = feedRef.current;
            if (feed) stickToBottom.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100;
          }}
        >
          <div className="channel-welcome">
            <div className="welcome-icon" aria-hidden="true">{activeRoom.symbol}</div>
            <h2>Welcome to {activeRoom.name}</h2>
            <p>This is the start of the conversation. Messages are coordinated by a Celld Durable Object.</p>
          </div>
          <div className="conversation-divider"><span>CONVERSATION</span></div>
          {messages.length === 0 && <p className="empty-message">No messages yet. Say hello to get started.</p>}
          <div className="messages">
            {messages.map((message) => (
              <article className="message" key={message.id}>
                <div className="message-avatar" aria-hidden="true">{message.userName.slice(0, 2).toUpperCase()}</div>
                <div className="message-body">
                  <div className="message-meta">
                    <strong>{message.userName}</strong>
                    {displayName.trim().toLowerCase() === message.userName.toLowerCase() && <em>you</em>}
                    <time dateTime={new Date(message.sentAt).toISOString()}>{formatTime(message.sentAt)}</time>
                  </div>
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="composer-area" aria-label="Write a message">
          {error && <p role="alert" className="chat-error">{error}</p>}
          <form className="composer" onSubmit={(event) => void send(event)}>
            <div className="identity-row">
              <label htmlFor="chat-name">Posting as</label>
              <input
                id="chat-name"
                autoComplete="nickname"
                placeholder="Your display name"
                maxLength={40}
                required
                value={displayName}
                onChange={(event) => updateDisplayName(event.target.value)}
              />
              <span className="public-demo-label">Public demo</span>
            </div>
            <div className="write-row">
              <label className="sr-only" htmlFor="chat-text">Message</label>
              <textarea
                id="chat-text"
                rows={2}
                maxLength={2000}
                required
                placeholder={"Message #" + roomId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKeyDown}
                disabled={sending}
              />
              <button disabled={sending || !draft.trim() || !displayName.trim()} type="submit">
                {sending ? "Sending…" : "Send"} <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
          <p className="composer-hint">Enter to send · Shift + Enter for a new line</p>
        </section>
      </main>
    </div>
  );
}
