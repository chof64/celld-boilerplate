const userNameInput = document.querySelector("#user-name");
const roomIdInput = document.querySelector("#room-id");
const joinRoomButton = document.querySelector("#join-room");
const roomLabel = document.querySelector("#room-label");
const messagesElement = document.querySelector("#messages");
const messageForm = document.querySelector("#message-form");
const messageTextInput = document.querySelector("#message-text");
const errorElement = document.querySelector("#error-message");
const connectionDot = document.querySelector("#connection-dot");
const connectionLabel = document.querySelector("#connection-label");

const messages = new Map();

let roomId = readInitialRoom();
let socket;
let reconnectTimer;

userNameInput.value = localStorage.getItem("celld-chat-name") ?? "";
roomIdInput.value = roomId;
roomLabel.textContent = roomId;

function readInitialRoom() {
  const room = window.location.hash.slice(1).trim();
  return room || "lobby";
}

function roomUrl(path = "") {
  return `/api/rooms/${encodeURIComponent(roomId)}${path}`;
}

function socketUrl() {
  const url = new URL(roomUrl("/socket"), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function setConnection(state, label) {
  connectionDot.dataset.state = state;
  connectionLabel.textContent = label;
}

function setError(message = "") {
  errorElement.textContent = message;
}

function upsertMessage(message) {
  messages.set(message.id, message);
  renderMessages();
}

function renderMessages() {
  messagesElement.replaceChildren();

  const sorted = [...messages.values()].sort(
    (left, right) => left.sentAt - right.sentAt || left.id.localeCompare(right.id),
  );

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No messages yet. Say hello.";
    messagesElement.append(empty);
    return;
  }

  for (const message of sorted) {
    const item = document.createElement("article");
    item.className = "message";

    const header = document.createElement("div");
    header.className = "message-header";

    const author = document.createElement("span");
    author.className = "message-author";
    author.textContent = message.userName;

    const time = document.createElement("time");
    time.className = "message-time";
    time.dateTime = new Date(message.sentAt).toISOString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(message.sentAt);

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;

    header.append(author, time);
    item.append(header, text);
    messagesElement.append(item);
  }

  messagesElement.scrollTop = messagesElement.scrollHeight;
}

async function loadMessages() {
  const response = await fetch(roomUrl("/messages"));

  if (!response.ok) {
    throw new Error(`Could not load messages (${response.status})`);
  }

  const payload = await response.json();

  for (const message of payload.messages) {
    messages.set(message.id, message);
  }

  renderMessages();
}

function connectSocket() {
  clearTimeout(reconnectTimer);
  socket?.close();

  setConnection("connecting", "Connecting");

  const currentRoom = roomId;
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => {
    if (currentRoom !== roomId) {
      socket.close();
      return;
    }

    setConnection("connected", "Live");
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);

      if (payload.type === "message") {
        upsertMessage(payload.message);
      }
    } catch {
      setError("Received an unreadable realtime event.");
    }
  });

  socket.addEventListener("close", () => {
    if (currentRoom !== roomId) {
      return;
    }

    setConnection("disconnected", "Reconnecting");
    reconnectTimer = window.setTimeout(connectSocket, 1_500);
  });

  socket.addEventListener("error", () => {
    setConnection("disconnected", "Connection error");
  });
}

async function switchRoom(nextRoom) {
  const normalized = nextRoom.trim();

  if (!normalized) {
    setError("Enter a room name.");
    return;
  }

  roomId = normalized;
  roomIdInput.value = roomId;
  roomLabel.textContent = roomId;
  window.location.hash = encodeURIComponent(roomId);
  messages.clear();
  renderMessages();
  setError("");

  connectSocket();

  try {
    await loadMessages();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Could not load messages.");
  }
}

joinRoomButton.addEventListener("click", () => {
  void switchRoom(roomIdInput.value);
});

roomIdInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void switchRoom(roomIdInput.value);
  }
});

userNameInput.addEventListener("input", () => {
  localStorage.setItem("celld-chat-name", userNameInput.value);
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userName = userNameInput.value.trim();
  const text = messageTextInput.value.trim();

  if (!userName) {
    setError("Enter your name before sending a message.");
    userNameInput.focus();
    return;
  }

  if (!text) {
    return;
  }

  setError("");
  messageTextInput.disabled = true;

  try {
    const response = await fetch(roomUrl("/messages"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ userName, text }),
    });

    if (!response.ok) {
      throw new Error(`Could not send message (${response.status})`);
    }

    upsertMessage(await response.json());
    messageTextInput.value = "";
  } catch (error) {
    setError(error instanceof Error ? error.message : "Could not send message.");
  } finally {
    messageTextInput.disabled = false;
    messageTextInput.focus();
  }
});

window.addEventListener("hashchange", () => {
  const nextRoom = decodeURIComponent(window.location.hash.slice(1));

  if (nextRoom && nextRoom !== roomId) {
    void switchRoom(nextRoom);
  }
});

renderMessages();
connectSocket();
void loadMessages().catch((error) => {
  setError(error instanceof Error ? error.message : "Could not load messages.");
});
