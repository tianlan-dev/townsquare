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
const ROOM_TTL_MS = 60 * 60 * 1000;
const ROOM_CLEANUP_MS = 60 * 1000;

function roomFor(channel) {
  if (!rooms.has(channel)) {
    rooms.set(channel, {
      channel,
      hostPlayerId: null,
      hostName: "",
      hasPassword: false,
      host: null,
      clients: new Map(),
      members: new Map(),
      createdAt: Date.now(),
      lastHostHeartbeat: Date.now()
    });
  }
  return rooms.get(channel);
}

function isRoomExpired(room) {
  return !!room && Date.now() - room.lastHostHeartbeat > ROOM_TTL_MS;
}

function send(socket, command, params, feedback = false) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify([command, params, feedback]));
  }
}

function broadcastRoom(room, sender, command, params, feedback = false) {
  if (!room) return;
  const sockets = new Set(room.clients.values());
  if (room.host) sockets.add(room.host);
  sockets.forEach(socket => {
    if (socket !== sender) send(socket, command, params, feedback);
  });
}

function broadcastRoomAll(room, command, params, feedback = false) {
  if (!room) return;
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
  const payload = {
    action,
    name: playerName
  };
  if (action === "leave") {
    broadcastRoom(room, socket, "presenceNotice", payload);
  } else {
    broadcastRoomAll(room, "presenceNotice", payload);
  }
}

function registerPresence(room, socket, name) {
  const playerName = displayName(name);
  socket.hasJoinedPresence = true;
  socket.hasLeftPresence = false;
  socket.displayName = playerName;

  if (room.members.has(socket.playerId)) {
    room.members.set(socket.playerId, playerName);
    return;
  }

  room.members.set(socket.playerId, playerName);
  announcePresence(room, socket, "join", playerName);
}

function updatePresence(room, socket, name) {
  if (!room.members.has(socket.playerId)) return;
  const playerName = displayName(name);
  socket.displayName = playerName;
  room.members.set(socket.playerId, playerName);
}

function unregisterPresence(room, socket, name) {
  const playerId = socket.playerId;
  const playerName = name
    ? displayName(name)
    : socket.displayName || room.members.get(playerId);
  if (!room.members.has(playerId)) return;
  room.members.delete(playerId);
  socket.hasJoinedPresence = false;
  socket.hasLeftPresence = true;
  announcePresence(room, socket, "leave", playerName);
}

function activeRooms() {
  return Array.from(rooms.values())
    .filter(room => room.hostPlayerId && !isRoomExpired(room))
    .map(room => room.channel);
}

function isHostOnline(room) {
  return !!(room.host && room.host.readyState === WebSocket.OPEN);
}

function activeRoomDetails() {
  return Array.from(rooms.values())
    .filter(room => room.hostPlayerId && !isRoomExpired(room))
    .map(room => {
      const hostOnline = isHostOnline(room);
      return {
        id: room.channel,
        hostName: room.hostName || "说书人",
        hostOnline,
        playerCount: hostOnline ? room.host.roomPlayerCount || null : null,
        hasPassword: !!room.hasPassword,
        createdAt: room.createdAt,
        lastHostHeartbeat: room.lastHostHeartbeat
      };
    });
}

function requestHostRoomInfo() {
  rooms.forEach(room => {
    if (isHostOnline(room)) send(room.host, "roomInfoRequest");
  });
}

function updateHostRoomInfo(room, params = {}) {
  if (!room || typeof params !== "object" || params === null) return;
  if (params.name !== undefined) room.hostName = displayName(params.name);
  const playerCount = Number(params.playerCount);
  if (Number.isInteger(playerCount) && playerCount > 0) {
    room.host.roomPlayerCount = playerCount;
  }
  room.hasPassword = !!params.hasPassword;
}

function sendLobbyRooms(socket, refreshHosts = false) {
  if (refreshHosts) {
    requestHostRoomInfo();
    setTimeout(() => sendLobbyRooms(socket), 150);
    return;
  }
  send(socket, "setRooms", activeRooms());
  send(socket, "setRoomDetails", activeRoomDetails());
}

function broadcastLobby(command, params) {
  lobbies.forEach(socket => send(socket, command, params));
}

function addRoomToLobby(channel) {
  broadcastLobby("addRoom", channel);
  broadcastLobby("setRoomDetails", activeRoomDetails());
}

function removeRoomFromLobby(channel) {
  broadcastLobby("removeRoom", channel);
  broadcastLobby("setRoomDetails", activeRoomDetails());
}

function closeRoomClients(room, reason = "房间已被说书人解散。") {
  const hostSocket = room.host;
  if (hostSocket && hostSocket.readyState === WebSocket.OPEN) {
    send(hostSocket, "roomClosed", { reason });
    setTimeout(() => {
      if (hostSocket.readyState === WebSocket.OPEN) {
        hostSocket.close(1000, "Room closed");
      }
    }, 50);
  }

  room.clients.forEach(socket => {
    send(socket, "roomClosed", { reason });
    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Room closed");
      }
    }, 50);
  });
}

function closeRoom(room, reason = "房间已被说书人解散。") {
  const channel = room.channel;
  closeRoomClients(room, reason);
  room.members.clear();
  room.host = null;
  rooms.delete(channel);
  removeRoomFromLobby(channel);
}

function cleanupExpiredRooms() {
  Array.from(rooms.values()).forEach(room => {
    if (isRoomExpired(room)) {
      closeRoom(room, "房间已过期。");
    }
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
  if (!room) return;
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
    if (!room) {
      send(socket, "allowHost", false);
      return;
    }
    const currentHostOpen = room.host && room.host.readyState === WebSocket.OPEN;
    const sameHostIdentity = room.hostPlayerId === socket.playerId;
    const allowed =
      !isRoomExpired(room) &&
      (!room.hostPlayerId || sameHostIdentity);
    if (allowed) {
      const wasNewRoom = !room.hostPlayerId;
      if (currentHostOpen && room.host !== socket && sameHostIdentity) {
        room.host.close(1000);
      }
      room.hostPlayerId = socket.playerId;
      const [, requestParams] = Array.isArray(requests.checkAllowHost)
        ? requests.checkAllowHost
        : [];
      room.host = socket;
      socket.isHost = true;
      updateHostRoomInfo(room, requestParams);
      room.lastHostHeartbeat = Date.now();
      if (wasNewRoom) addRoomToLobby(room.channel);
      else broadcastLobby("setRoomDetails", activeRoomDetails());
    }
    send(socket, "allowHost", allowed);
  }

  if (requests.checkAllowJoin) {
    const roomExists = !!room && !!room.hostPlayerId && !isRoomExpired(room);
    const hostOnline = roomExists && isHostOnline(room);
    send(socket, "allowJoin", {
      allowed: hostOnline,
      reason: roomExists ? (hostOnline ? "" : "hostOffline") : "missing",
      hasPassword: roomExists ? !!room.hasPassword : false
    });
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
    case "request":
      handleRequest(room, socket, params);
      break;
    case "presenceJoin":
      if (room && !socket.isHost && !socket.hasJoinedPresence) {
        registerPresence(room, socket, params && params.name);
      }
      break;
    case "presenceUpdate":
      if (room && !socket.isHost && socket.hasJoinedPresence) {
        updatePresence(room, socket, params && params.name);
      }
      break;
    case "presenceLeave":
      if (room && !socket.isHost && socket.hasJoinedPresence) {
        unregisterPresence(room, socket, params && params.name);
      }
      break;
    case "closeRoom":
      if (room && socket.isHost) {
        closeRoom(room);
      }
      break;
    case "hostHeartbeat":
      if (room && socket.isHost) {
        updateHostRoomInfo(room, params);
        room.lastHostHeartbeat = Date.now();
        broadcastLobby("setRoomDetails", activeRoomDetails());
      }
      break;
    case "direct":
      routeDirect(room, socket, params, feedback);
      break;
    case "uploadFile":
      if (room) handleUpload(socket, params);
      break;
    default:
      if (room) broadcastRoom(room, socket, command, params, feedback);
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

  const existingRoom = rooms.get(channel);
  if (existingRoom && isRoomExpired(existingRoom)) {
    closeRoom(existingRoom, "房间已过期。");
  }
  const room = wantsHost ? roomFor(channel) : rooms.get(channel);
  socket.type = "session";
  socket.channel = channel;
  socket.playerId = playerId;
  socket.room = room;
  socket.isHost = false;
  socket.hasJoinedPresence = false;
  socket.hasLeftPresence = false;
  socket.displayName = "";

  if (!wantsHost && room) {
    room.clients.set(playerId, socket);
  }

  socket.on("message", data => handleSessionMessage(socket, data.toString()));
  socket.on("close", () => {
    if (!room) return;
    const wasCurrentClient = room.clients.get(playerId) === socket;
    if (wasCurrentClient) room.clients.delete(playerId);
    if (room.host === socket) {
      room.host = null;
      broadcastLobby("setRoomDetails", activeRoomDetails());
    }
  });
}

function attachLobby(socket) {
  socket.type = "lobby";
  lobbies.add(socket);
  sendLobbyRooms(socket);
  socket.on("message", data => {
    let command;
    try {
      [command] = JSON.parse(data.toString());
    } catch (e) {
      return;
    }
    if (command === "refreshRooms") sendLobbyRooms(socket);
    if (command === "refreshRoomsLive") sendLobbyRooms(socket, true);
  });
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

setInterval(cleanupExpiredRooms, ROOM_CLEANUP_MS);

server.listen(port, host, () => {
  console.log(`Townsquare local server listening on http://${host}:${port}`);
  console.log(`Serving ${staticRoot}`);
});
