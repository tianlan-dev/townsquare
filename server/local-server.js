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
const publicScriptsDir = path.join(publicDir, "scripts");
const staticScriptsDir = path.join(staticRoot, "scripts");
const scriptsDir = fs.existsSync(publicScriptsDir) ? publicScriptsDir : staticScriptsDir;

function appendVersion(url, filePath) {
  if (!url || !filePath || !fs.existsSync(filePath)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${fs.statSync(filePath).mtimeMs.toString(36)}`;
}

function scriptAssetUrl(value, scriptUrl, scriptFilePath) {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  try {
    const parsed = new URL(value, `http://townsquare.local${scriptUrl}`);
    if (parsed.origin === "http://townsquare.local") {
      const url = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      const assetPath = path.resolve(path.dirname(scriptFilePath), `.${parsed.pathname.replace(/^\/scripts/, "")}`);
      return appendVersion(url, assetPath);
    }
    return parsed.href;
  } catch (e) {
    return "";
  }
}

function listScripts() {
  if (!fs.existsSync(scriptsDir)) return [];
  return fs.readdirSync(scriptsDir)
    .filter(file => file.endsWith(".json"))
    .sort()
    .map(file => {
      try {
        const scriptFilePath = path.join(scriptsDir, file);
        const script = JSON.parse(fs.readFileSync(scriptFilePath, "utf8"));
        const meta = Array.isArray(script)
          ? script.find(item => item && item.id === "_meta") || {}
          : {};
        const url = `/scripts/${file}`;
        return {
          name: meta.name || file.replace(/\.json$/, ""),
          url,
          logo: scriptAssetUrl(meta.logo, url, scriptFilePath)
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
app.use("/backgrounds", express.static(path.join(publicDir, "backgrounds"), { fallthrough: true }));
app.use("/backgrounds", express.static(path.join(staticRoot, "backgrounds"), { fallthrough: true }));
app.use("/scripts", express.static(publicScriptsDir, { fallthrough: true }));
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
      clients: new Map(),
      presences: new Map(),
      leaveTimers: new Map(),
      hostLeaveTimer: null
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

function broadcastRoomAll(room, command, params, feedback = false) {
  const sockets = new Set(room.clients.values());
  if (room.host) sockets.add(room.host);
  sockets.forEach(socket => send(socket, command, params, feedback));
}

function displayName(name) {
  const value = String(name || "").trim();
  return value ? value.substr(0, 40) : "玩家";
}

function announcePresence(room, socket, action, name) {
  const playerName = displayName(name);
  socket.displayName = playerName;
  broadcastRoomAll(room, "presenceNotice", {
    action,
    name: playerName
  });
}

function registerPresence(room, socket, name) {
  const playerName = displayName(name);
  const pendingLeave = room.leaveTimers.get(socket.playerId);
  socket.hasJoinedPresence = true;
  socket.hasLeftPresence = false;
  socket.displayName = playerName;

  if (pendingLeave) {
    clearTimeout(pendingLeave);
    room.leaveTimers.delete(socket.playerId);
    room.presences.set(socket.playerId, playerName);
    return;
  }

  if (room.presences.has(socket.playerId)) {
    room.presences.set(socket.playerId, playerName);
    return;
  }

  room.presences.set(socket.playerId, playerName);
  announcePresence(room, socket, "join", playerName);
}

function updatePresence(room, socket, name) {
  if (!room.presences.has(socket.playerId)) return;
  const playerName = displayName(name);
  socket.displayName = playerName;
  room.presences.set(socket.playerId, playerName);
}

function unregisterPresence(room, socket, name) {
  const playerId = socket.playerId;
  const playerName = name
    ? displayName(name)
    : socket.displayName || room.presences.get(playerId);
  const pendingLeave = room.leaveTimers.get(playerId);
  if (pendingLeave) {
    clearTimeout(pendingLeave);
    room.leaveTimers.delete(playerId);
  }
  if (!room.presences.has(playerId)) return;
  room.presences.delete(playerId);
  socket.hasJoinedPresence = false;
  socket.hasLeftPresence = true;
  if (room.host && room.host.readyState === WebSocket.OPEN) {
    announcePresence(room, socket, "leave", playerName);
  }
}

function schedulePresenceLeave(room, socket) {
  const playerId = socket.playerId;
  const playerName = socket.displayName;
  const timer = setTimeout(() => {
    room.leaveTimers.delete(playerId);
    if (room.clients.has(playerId)) return;
    if (!room.presences.has(playerId)) return;
    room.presences.delete(playerId);
    socket.hasJoinedPresence = false;
    socket.hasLeftPresence = true;
    if (room.host && room.host.readyState === WebSocket.OPEN) {
      announcePresence(room, socket, "leave", playerName);
    }
  }, 5000);
  room.leaveTimers.set(playerId, timer);
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

function scheduleHostLeave(room, socket) {
  if (room.hostLeaveTimer) clearTimeout(room.hostLeaveTimer);
  room.hostLeaveTimer = setTimeout(() => {
    if (room.host && room.host.readyState === WebSocket.OPEN) return;
    room.hostLeaveTimer = null;
    room.host = null;
    removeRoomFromLobby(room.channel);
    closeRoomClients(room);
    room.leaveTimers.forEach(timer => clearTimeout(timer));
    room.leaveTimers.clear();
    room.presences.clear();
    if (room.clients.size === 0) rooms.delete(room.channel);
  }, 5000);
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
      const wasInactive = !currentHostOpen && !room.hostLeaveTimer;
      if (room.hostLeaveTimer) {
        clearTimeout(room.hostLeaveTimer);
        room.hostLeaveTimer = null;
      }
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
    case "presenceJoin":
      if (!socket.isHost && !socket.hasJoinedPresence) {
        registerPresence(room, socket, params && params.name);
      }
      break;
    case "presenceUpdate":
      if (!socket.isHost && socket.hasJoinedPresence) {
        updatePresence(room, socket, params && params.name);
      }
      break;
    case "presenceLeave":
      if (!socket.isHost && socket.hasJoinedPresence) {
        unregisterPresence(room, socket, params && params.name);
      }
      break;
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
  socket.hasJoinedPresence = false;
  socket.hasLeftPresence = false;
  socket.displayName = "";

  room.clients.set(playerId, socket);
  if (wantsHost && (!room.host || room.host.readyState !== WebSocket.OPEN)) {
    const wasInactive = !room.hostLeaveTimer;
    if (room.hostLeaveTimer) {
      clearTimeout(room.hostLeaveTimer);
      room.hostLeaveTimer = null;
    }
    room.host = socket;
    socket.isHost = true;
    if (wasInactive) addRoomToLobby(channel);
  }

  socket.on("message", data => handleSessionMessage(socket, data.toString()));
  socket.on("close", () => {
    const wasCurrentClient = room.clients.get(playerId) === socket;
    if (wasCurrentClient) room.clients.delete(playerId);
    if (room.host === socket) {
      room.host = null;
      scheduleHostLeave(room, socket);
    } else if (wasCurrentClient && socket.hasJoinedPresence) {
      schedulePresenceLeave(room, socket);
    }
    if (!room.host && !room.hostLeaveTimer && room.clients.size === 0) rooms.delete(channel);
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
