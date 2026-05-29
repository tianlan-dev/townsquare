const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const express = require("express");
const WebSocket = require("ws");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "local-data");
const avatarDir = path.join(dataDir, "avatars");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

fs.mkdirSync(avatarDir, { recursive: true });

const app = express();
const staticRoot = fs.existsSync(path.join(distDir, "index.html")) ? distDir : publicDir;
const scriptsDir = path.join(staticRoot, "scripts");

function listScripts() {
  if (!fs.existsSync(scriptsDir)) return [];
  return fs.readdirSync(scriptsDir)
    .filter(file => file.endsWith(".json"))
    .sort()
    .map(file => {
      try {
        const script = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), "utf8"));
        const meta = Array.isArray(script)
          ? script.find(item => item && item.id === "_meta") || {}
          : {};
        return {
          name: meta.name || file.replace(/\.json$/, ""),
          url: `/scripts/${file}`,
          logo: meta.logo || ""
        };
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/scripts/index.json", (req, res) => {
  res.json(listScripts());
});

app.use("/avatars", express.static(avatarDir, { fallthrough: true }));
app.use("/avatars", express.static(path.join(staticRoot, "avatars"), { fallthrough: true }));
app.use(express.static(staticRoot));
app.get("*", (req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const rooms = new Map();
const lobbies = new Set();

function roomFor(channel) {
  if (!rooms.has(channel)) {
    rooms.set(channel, {
      channel,
      host: null,
      clients: new Map()
    });
  }
  return rooms.get(channel);
}

function send(socket, command, params, feedback = false) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify([command, params, feedback]));
  }
}

function broadcastRoom(room, sender, command, params, feedback = false) {
  const sockets = new Set(room.clients.values());
  if (room.host) sockets.add(room.host);
  sockets.forEach(socket => {
    if (socket !== sender) send(socket, command, params, feedback);
  });
}

function activeRooms() {
  return Array.from(rooms.values())
    .filter(room => room.host && room.host.readyState === WebSocket.OPEN)
    .map(room => room.channel);
}

function broadcastLobby(command, params) {
  lobbies.forEach(socket => send(socket, command, params));
}

function addRoomToLobby(channel) {
  broadcastLobby("addRoom", channel);
}

function removeRoomFromLobby(channel) {
  broadcastLobby("removeRoom", channel);
}

function closeRoomClients(room) {
  room.clients.forEach(socket => {
    send(socket, "roomClosed");
    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Room closed");
      }
    }, 50);
  });
}

function safePlayerId(playerId) {
  return String(playerId || "")
    .toLocaleLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .substr(0, 64);
}

function handleUpload(socket, params) {
  const upload = params && params.uploadAvatar;
  if (!Array.isArray(upload)) return;
  const [playerId, dataUrl] = upload;
  const safeId = safePlayerId(playerId);
  if (!safeId || typeof dataUrl !== "string") return;

  const match = dataUrl.match(/^data:image\/(webp|png|jpeg);base64,(.+)$/);
  if (!match) return;

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 5 * 1024 * 1024) return;

  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const filename = `${safeId}.${ext}`;
  fs.writeFileSync(path.join(avatarDir, filename), buffer);
  send(socket, "avatarReceived", filename);
}

function routeDirect(room, sender, messages, feedback = false) {
  if (!messages || typeof messages !== "object") return;
  Object.entries(messages).forEach(([target, payload]) => {
    if (!Array.isArray(payload)) return;
    const socket = target === "host" ? room.host : room.clients.get(target);
    if (socket && socket.readyState === WebSocket.OPEN) {
      send(socket, payload[0], payload[1], feedback);
    }
  });
}

function handleRequest(room, socket, requests) {
  if (!requests || typeof requests !== "object") return;

  if (requests.checkAllowHost) {
    const currentHostOpen = room.host && room.host.readyState === WebSocket.OPEN;
    const allowed = !currentHostOpen || room.host === socket;
    if (allowed) {
      const wasInactive = !currentHostOpen;
      room.host = socket;
      socket.isHost = true;
      if (wasInactive) addRoomToLobby(room.channel);
    }
    send(socket, "allowHost", allowed);
  }

  if (requests.checkAllowJoin) {
    const allowed = !!(room.host && room.host.readyState === WebSocket.OPEN);
    send(socket, "allowJoin", allowed);
  }
}

function handleSessionMessage(socket, raw) {
  const room = socket.room;
  let command;
  let params;
  let feedback;

  try {
    [command, params, feedback] = JSON.parse(raw);
  } catch (e) {
    return;
  }

  switch (command) {
    case "direct":
      routeDirect(room, socket, params, feedback);
      break;
    case "request":
      handleRequest(room, socket, params);
      break;
    case "uploadFile":
      handleUpload(socket, params);
      break;
    default:
      broadcastRoom(room, socket, command, params, feedback);
      break;
  }

  if (feedback) send(socket, "feedback", feedback);
}

function attachSession(socket, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const channel = (parts[1] || "").toLocaleLowerCase().replace(/[^0-9a-z]/g, "").substr(0, 10);
  const playerId = parts[2] || crypto.randomBytes(8).toString("hex");
  const wantsHost = parts[3] === "host";
  if (!channel) {
    socket.close(1008, "Invalid room");
    return;
  }

  const room = roomFor(channel);
  socket.type = "session";
  socket.channel = channel;
  socket.playerId = playerId;
  socket.room = room;
  socket.isHost = false;

  room.clients.set(playerId, socket);
  if (wantsHost && (!room.host || room.host.readyState !== WebSocket.OPEN)) {
    room.host = socket;
    socket.isHost = true;
    addRoomToLobby(channel);
  }

  socket.on("message", data => handleSessionMessage(socket, data.toString()));
  socket.on("close", () => {
    if (room.clients.get(playerId) === socket) room.clients.delete(playerId);
    if (room.host === socket) {
      room.host = null;
      removeRoomFromLobby(channel);
      closeRoomClients(room);
    }
    if (!room.host && room.clients.size === 0) rooms.delete(channel);
  });
}

function attachLobby(socket) {
  socket.type = "lobby";
  lobbies.add(socket);
  send(socket, "setRooms", activeRooms());
  socket.on("close", () => lobbies.delete(socket));
}

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (!pathname.startsWith("/ws/") && !pathname.startsWith("/lobby/")) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    if (pathname.startsWith("/ws/")) {
      attachSession(ws, pathname);
    } else {
      attachLobby(ws);
    }
  });
});

server.listen(port, host, () => {
  console.log(`Townsquare local server listening on http://${host}:${port}`);
  console.log(`Serving ${staticRoot}`);
});
