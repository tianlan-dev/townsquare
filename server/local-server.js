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
const logsDir = path.join(dataDir, "logs");
const playerAccessLogPath = path.join(logsDir, "player-access.log");
const roomAccessLogPath = path.join(logsDir, "room-access.log");
if (!process.env.PORT) {
  throw new Error("PORT environment variable is required.");
}

const port = Number(process.env.PORT);
const host = process.env.HOST || "0.0.0.0";

fs.mkdirSync(avatarDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
fs.closeSync(fs.openSync(playerAccessLogPath, "a"));
fs.closeSync(fs.openSync(roomAccessLogPath, "a"));

function removeAvatarFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) fs.unlinkSync(filePath);
  } catch (e) {
    // Ignore missing or locked files; avatar cleanup is best-effort.
  }
}

function clearAvatarDirectory() {
  try {
    fs.readdirSync(avatarDir).forEach((file) => {
      removeAvatarFile(path.join(avatarDir, file));
    });
  } catch (e) {
    // Ignore cleanup failures so the game server can still start.
  }
}

function clearPlayerAvatar(playerId) {
  const safeId = safePlayerId(playerId);
  if (!safeId) return;
  ["webp", "png", "jpg", "jpeg"].forEach((ext) => {
    removeAvatarFile(path.join(avatarDir, `${safeId}.${ext}`));
  });
}

function msUntilNextAvatarCleanup(now = new Date()) {
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleAvatarCleanup() {
  setTimeout(() => {
    clearAvatarDirectory();
    scheduleAvatarCleanup();
  }, msUntilNextAvatarCleanup());
}

clearAvatarDirectory();
scheduleAvatarCleanup();

const app = express();
const staticRoot = fs.existsSync(path.join(distDir, "index.html"))
  ? distDir
  : publicDir;
const publicScriptsDir = path.join(publicDir, "scripts");
const staticScriptsDir = path.join(staticRoot, "scripts");
const scriptsDir = fs.existsSync(publicScriptsDir)
  ? publicScriptsDir
  : staticScriptsDir;

function sendServiceUnavailable(res) {
  res.status(503).set("Retry-After", "5").type("html").send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>城镇广场正在准备中</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #080a0d;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        max-width: 28rem;
        padding: 1.5rem;
        text-align: center;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>城镇广场正在准备中</h1>
      <p>应用正在启动或更新，请稍后刷新页面。</p>
    </main>
  </body>
</html>`);
}

function sendIndex(req, res, next) {
  const indexPath = path.join(staticRoot, "index.html");
  fs.access(indexPath, fs.constants.R_OK, (err) => {
    if (err) {
      sendServiceUnavailable(res);
      return;
    }
    res.sendFile(indexPath, (sendErr) => {
      if (!sendErr) return;
      if (sendErr.code === "ENOENT" || sendErr.code === "EISDIR") {
        sendServiceUnavailable(res);
        return;
      }
      next(sendErr);
    });
  });
}

function scriptAssetUrl(value, scriptUrl) {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  try {
    const parsed = new URL(value, `http://townsquare.local${scriptUrl}`);
    if (parsed.origin === "http://townsquare.local") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.href;
  } catch (e) {
    return "";
  }
}

function listScripts() {
  if (!fs.existsSync(scriptsDir)) return [];
  return fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      try {
        const scriptFilePath = path.join(scriptsDir, file);
        const script = JSON.parse(fs.readFileSync(scriptFilePath, "utf8"));
        const meta = Array.isArray(script)
          ? script.find((item) => item && item.id === "_meta") || {}
          : {};
        if (!Array.isArray(script) || !meta.id) return null;
        const url = `/scripts/${file}`;
        return {
          name: meta.name || file.replace(/\.json$/, ""),
          url,
          logo: scriptAssetUrl(meta.logo, url),
          version: meta.version || "",
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

app.get("/scripts", (req, res) => {
  res.json(listScripts());
});

app.use("/avatars", express.static(avatarDir, { fallthrough: true }));
app.use(
  "/avatars",
  express.static(path.join(staticRoot, "avatars"), { fallthrough: true }),
);
app.use(
  "/backgrounds",
  express.static(path.join(staticRoot, "backgrounds"), { fallthrough: true }),
);
app.use(
  "/backgrounds",
  express.static(path.join(publicDir, "backgrounds"), { fallthrough: true }),
);
app.use("/scripts", express.static(publicScriptsDir, { fallthrough: true }));
app.use(express.static(staticRoot));
app.get("*", sendIndex);
app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  sendServiceUnavailable(res);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const players = new Map();
const rooms = new Map();
const lobbies = new Set();
const usedRoomCodes = new Map();
const ROOM_CODE_MAX = 999999;
const USED_ROOM_CODE_TTL_MS =
  Number(process.env.USED_ROOM_CODE_TTL_MS) || 24 * 60 * 60 * 1000;
const PLAYER_HEARTBEAT_TTL_MS =
  Number(process.env.PLAYER_HEARTBEAT_TTL_MS) || 2 * 60 * 60 * 1000;
const PLAYER_CLEANUP_MS =
  Number(process.env.PLAYER_CLEANUP_MS) || 5 * 60 * 1000;

function now() {
  return Date.now();
}

function displayName(name) {
  const value = String(name || "").trim();
  return value ? value.substr(0, 40) : "玩家";
}

function displayGender(gender) {
  return String(gender || "").trim().substr(0, 40);
}

function safePlayerId(playerId) {
  return String(playerId || "")
    .toLocaleLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .substr(0, 64);
}

function headerValue(headers, name) {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function forwardedIp(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function requestIp(req, fallbackSocket) {
  return (
    forwardedIp(headerValue(req.headers, "cf-connecting-ip")) ||
    forwardedIp(headerValue(req.headers, "x-forwarded-for")) ||
    String(
      (req.socket && req.socket.remoteAddress) ||
        (fallbackSocket && fallbackSocket.remoteAddress) ||
        "",
    )
  );
}

function appendJsonLine(filePath, record) {
  fs.appendFile(filePath, `${JSON.stringify(record)}\n`, (err) => {
    if (err) console.error(`Failed to write ${path.basename(filePath)}:`, err);
  });
}

function logPlayerAccess(socket, event, player, profile = {}) {
  if (!player || !player.playerId) return;
  appendJsonLine(playerAccessLogPath, {
    timestamp: new Date().toISOString(),
    playerId: player.playerId,
    ip: socket && socket.clientIp ? socket.clientIp : "",
    name: player.name || displayName(profile.name),
    gender: player.gender || displayGender(profile.gender),
    event,
  });
}

function logRoomAccess(event, room, playerId) {
  if (!room || !room.channel) return;
  appendJsonLine(roomAccessLogPath, {
    timestamp: new Date().toISOString(),
    roomId: room.channel,
    event,
    playerId: String(playerId || ""),
    creatorPlayerId: room.storytellerId || room.hostPlayerId || "",
  });
}

function randomPlayerId() {
  let playerId = "";
  while (!playerId || players.has(playerId)) {
    playerId = crypto.randomBytes(12).toString("hex");
  }
  return playerId;
}

function safeRoomCode(roomCode) {
  const value = Number(roomCode);
  if (!Number.isInteger(value) || value < 1 || value > ROOM_CODE_MAX) return "";
  return String(value);
}

function pruneUsedRoomCodes() {
  const timestamp = now();
  usedRoomCodes.forEach((record, roomCode) => {
    if (record.expiresAt <= timestamp && !rooms.has(roomCode)) {
      usedRoomCodes.delete(roomCode);
    }
  });
}

function markRoomCodeUsed(roomCode) {
  usedRoomCodes.set(roomCode, {
    roomCode,
    firstUsedAt: usedRoomCodes.get(roomCode)?.firstUsedAt || now(),
    cleanedAt: null,
    expiresAt: now() + USED_ROOM_CODE_TTL_MS,
  });
}

function markRoomCodeCleaned(roomCode) {
  const record = usedRoomCodes.get(roomCode) || {
    roomCode,
    firstUsedAt: now(),
  };
  usedRoomCodes.set(roomCode, {
    ...record,
    cleanedAt: now(),
    expiresAt: now() + USED_ROOM_CODE_TTL_MS,
  });
}

function generateRoomCode() {
  pruneUsedRoomCodes();
  for (let attempt = 0; attempt < 5000; attempt++) {
    const roomCode = String(crypto.randomInt(1, ROOM_CODE_MAX + 1));
    if (!rooms.has(roomCode) && !usedRoomCodes.has(roomCode)) return roomCode;
  }
  throw new Error("Unable to allocate a room code");
}

function createPlayer(profile = {}, candidatePlayerId = "") {
  const playerId = safePlayerId(candidatePlayerId) || randomPlayerId();
  const player = {
    playerId,
    name: displayName(profile.name),
    gender: displayGender(profile.gender),
    lastHeartbeat: now(),
    currentRoomId: "",
    roomRole: "none",
    seat: null,
    createdRoomId: "",
    sockets: new Set(),
  };
  players.set(playerId, player);
  return player;
}

function existingPlayer(playerId) {
  return players.get(safePlayerId(playerId));
}

function ensurePlayer(playerId, profile = {}) {
  const player = existingPlayer(playerId);
  if (!player) return null;
  if (profile.name) player.name = displayName(profile.name);
  if (profile.gender) player.gender = displayGender(profile.gender);
  player.lastHeartbeat = now();
  return player;
}

function createRoomRecord(roomCode, storyteller, params = {}) {
  const playerCount = Number(params.playerCount);
  const room = {
    channel: roomCode,
    roomCode,
    hostPlayerId: storyteller.playerId,
    storytellerId: storyteller.playerId,
    hostName: storyteller.name || "说书人",
    hasPassword: !!params.password,
    password: String(params.password || ""),
    host: null,
    clients: new Map(),
    members: new Map([[storyteller.playerId, storyteller.name || "说书人"]]),
    pendingSeatVacates: new Map(),
    createdAt: now(),
    lastHostHeartbeat: now(),
    isStorytelling: false,
    playerCount:
      Number.isInteger(playerCount) && playerCount > 0 ? playerCount : null,
  };
  rooms.set(roomCode, room);
  markRoomCodeUsed(roomCode);
  storyteller.currentRoomId = roomCode;
  storyteller.roomRole = "storyteller";
  storyteller.createdRoomId = roomCode;
  storyteller.seat = null;
  return room;
}

function isRoomExpired(room) {
  if (!room) return true;
  const storyteller = players.get(room.storytellerId);
  return (
    !storyteller ||
    now() - storyteller.lastHeartbeat > PLAYER_HEARTBEAT_TTL_MS
  );
}

function send(socket, command, params, feedback = false) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify([command, params, feedback]));
  }
}

const HOST_ROOM_COMMANDS = new Set([
  "bluff",
  "bootlegger",
  "clearVoteHistory",
  "edition",
  "fabled",
  "firstNight",
  "grimoire",
  "gs",
  "isNight",
  "isReview",
  "isVoteHistoryAllowed",
  "isVoteInProgress",
  "lock",
  "marked",
  "move",
  "murderScene",
  "nomination",
  "nominationMarks",
  "otherNight",
  "phaseIndex",
  "ping",
  "player",
  "pronouns",
  "remove",
  "reviewDetails",
  "reviewDetailsFingerprint",
  "secretVote",
  "setTimer",
  "startTimer",
  "states",
  "stopTimer",
  "storytellerName",
  "swap",
  "teamsNames",
  "useOldOrder",
  "useOldRole",
  "vote",
  "votes",
  "votingSpeed",
]);

const PLAYER_ROOM_COMMANDS = new Set(["ping", "pronouns", "vote"]);

const HOST_DIRECT_COMMANDS = new Set([
  "bluff",
  "clearPlayerInfo",
  "edition",
  "firstNight",
  "grimoire",
  "gs",
  "isRole",
  "joinResult",
  "leaveSeat",
  "otherNight",
  "passwordResult",
  "player",
  "reviewDetails",
  "reviewDetailsFingerprint",
  "stId",
  "states",
  "syncPlayersStatus",
  "teamsNames",
  "useDefaultAvatar",
  "vote",
]);

const PLAYER_DIRECT_TO_HOST_COMMANDS = new Set([
  "bye",
  "claim",
  "getGamestate",
  "getStId",
  "joinCheck",
  "passwordCheck",
  "requestReviewDetails",
  "usingRole",
  "vote",
]);

function isAllowedRoomCommand(socket, command) {
  if (!isSocketRoomMember(socket)) return false;
  return socket.isHost
    ? HOST_ROOM_COMMANDS.has(command)
    : PLAYER_ROOM_COMMANDS.has(command);
}

function isAllowedDirectCommand(sender, target, command) {
  if (!isSocketRoomMember(sender)) return false;
  if (sender.isHost) {
    return target !== "host" && HOST_DIRECT_COMMANDS.has(command);
  }
  return target === "host" && PLAYER_DIRECT_TO_HOST_COMMANDS.has(command);
}

function broadcastRoom(room, sender, command, params, feedback = false) {
  if (!room) return;
  const sockets = new Set(room.clients.values());
  if (room.host) sockets.add(room.host);
  sockets.forEach((socket) => {
    if (socket !== sender) send(socket, command, params, feedback);
  });
}

function broadcastRoomAll(room, command, params, feedback = false) {
  if (!room) return;
  const sockets = new Set(room.clients.values());
  if (room.host) sockets.add(room.host);
  sockets.forEach((socket) => send(socket, command, params, feedback));
}

function announcePresence(room, socket, action, name) {
  const playerName = displayName(name);
  socket.displayName = playerName;
  const payload = {
    action,
    name: playerName,
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
  const player = players.get(playerId);
  if (player && player.currentRoomId === room.channel) {
    player.currentRoomId = "";
    player.roomRole = "none";
    player.seat = null;
  }
  if (isHostOnline(room)) {
    send(room.host, "claim", [-1, playerId, playerName, ""]);
    send(room.host, "bye", playerId);
  } else {
    room.pendingSeatVacates.set(playerId, playerName);
  }
  socket.hasJoinedPresence = false;
  socket.hasLeftPresence = true;
  announcePresence(room, socket, "leave", playerName);
}

function flushPendingSeatVacates(room) {
  if (!isHostOnline(room)) return;
  room.pendingSeatVacates.forEach((playerName, playerId) => {
    send(room.host, "claim", [-1, playerId, playerName, ""]);
    send(room.host, "bye", playerId);
  });
  room.pendingSeatVacates.clear();
}

function activeRooms() {
  return Array.from(rooms.values())
    .filter((room) => room.hostPlayerId && !isRoomExpired(room))
    .map((room) => room.channel);
}

function isHostOnline(room) {
  return !!(room.host && room.host.readyState === WebSocket.OPEN);
}

function activeRoomDetails() {
  return Array.from(rooms.values())
    .filter((room) => room.hostPlayerId && !isRoomExpired(room))
    .map((room) => {
      const hostOnline = isHostOnline(room);
      const storyteller = players.get(room.storytellerId);
      return {
        id: room.channel,
        hostName: room.hostName || "说书人",
        hostOnline,
        playerCount: room.playerCount || null,
        isStorytelling: !!room.isStorytelling,
        hasPassword: !!room.hasPassword,
        createdAt: room.createdAt,
        lastHostHeartbeat: storyteller
          ? storyteller.lastHeartbeat
          : room.lastHostHeartbeat,
      };
    });
}

function requestHostRoomInfo() {
  rooms.forEach((room) => {
    if (isHostOnline(room)) send(room.host, "roomInfoRequest");
  });
}

function updateHostRoomInfo(room, params = {}) {
  if (!room || typeof params !== "object" || params === null) return;
  if (params.name !== undefined) room.hostName = displayName(params.name);
  const playerCount = Number(params.playerCount);
  if (Number.isInteger(playerCount) && playerCount > 0) {
    room.playerCount = playerCount;
  }
  if (params.isStorytelling !== undefined) {
    room.isStorytelling = !!params.isStorytelling;
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
  lobbies.forEach((socket) => send(socket, command, params));
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

  room.clients.forEach((socket) => {
    send(socket, "roomClosed", { reason });
    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Room closed");
      }
    }, 50);
  });
}

function closeRoomAndUnbindMembers(room, reason = "房间已被说书人解散。") {
  const channel = room.channel;
  room.members.forEach((playerName, playerId) => {
    const player = players.get(playerId);
    if (!player) return;
    player.currentRoomId = "";
    player.roomRole = "none";
    player.seat = null;
    if (player.createdRoomId === channel) player.createdRoomId = "";
  });
  closeRoomClients(room, reason);
  room.members.clear();
  room.host = null;
  rooms.delete(channel);
  markRoomCodeCleaned(channel);
  removeRoomFromLobby(channel);
}

function closeRoom(room, reason = "房间已被说书人解散。") {
  closeRoomAndUnbindMembers(room, reason);
}

function vacatePlayerSeat(room, player, reasonName = player.name) {
  if (!room || !player) return;
  if (isHostOnline(room)) {
    send(room.host, "claim", [-1, player.playerId, reasonName, ""]);
    send(room.host, "bye", player.playerId);
  } else {
    room.pendingSeatVacates.set(player.playerId, reasonName);
  }
  player.seat = null;
}

function removePlayerFromCurrentRoom(player, reason = "玩家已离开房间") {
  if (!player || !player.currentRoomId) return;
  const room = rooms.get(player.currentRoomId);
  if (!room) {
    player.currentRoomId = "";
    player.roomRole = "none";
    player.seat = null;
    player.createdRoomId = "";
    return;
  }
  if (room.storytellerId === player.playerId) {
    closeRoomAndUnbindMembers(room, reason);
    return;
  }
  const playerName = player.name || room.members.get(player.playerId) || "玩家";
  if (player.seat !== null) vacatePlayerSeat(room, player, playerName);
  room.members.delete(player.playerId);
  room.clients.delete(player.playerId);
  announcePresence(room, { playerId: player.playerId }, "leave", playerName);
  player.currentRoomId = "";
  player.roomRole = "none";
  player.seat = null;
}

function cleanupPlayer(playerId, reason = "玩家已因长时间无响应被移出房间。") {
  const player = players.get(playerId);
  if (!player) return;
  removePlayerFromCurrentRoom(player, reason);
  player.sockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      send(socket, "playerInvalid", { reason });
      socket.close(1000, reason);
    }
  });
  players.delete(playerId);
  clearPlayerAvatar(playerId);
}

function cleanupExpiredPlayers() {
  const timestamp = now();
  Array.from(players.values()).forEach((player) => {
    if (timestamp - player.lastHeartbeat > PLAYER_HEARTBEAT_TTL_MS) {
      cleanupPlayer(player.playerId);
    }
  });
  pruneUsedRoomCodes();
}

function handleUpload(socket, params) {
  const avatarDelete = params && params.deleteAvatar;
  if (Array.isArray(avatarDelete)) {
    if (!socket.isHost && safePlayerId(avatarDelete[0]) !== socket.playerId) {
      return;
    }
    clearPlayerAvatar(avatarDelete[0]);
    return;
  }

  const upload = params && params.uploadAvatar;
  if (!Array.isArray(upload)) return;
  const [playerId, dataUrl] = upload;
  const safeId = safePlayerId(playerId);
  if (!safeId || typeof dataUrl !== "string") return;
  if (safeId !== socket.playerId) return;

  const match = dataUrl.match(/^data:image\/(webp|png|jpeg);base64,(.+)$/);
  if (!match) return;

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 5 * 1024 * 1024) return;

  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const filename = `${safeId}.${ext}`;
  fs.writeFileSync(path.join(avatarDir, filename), buffer);
  send(socket, "avatarReceived", `${filename}?v=${Date.now()}`);
}

function routeDirect(room, sender, messages, feedback = false) {
  if (!room) return;
  if (!messages || typeof messages !== "object") return;
  Object.entries(messages).forEach(([target, payload]) => {
    if (!Array.isArray(payload)) return;
    const command = payload[0];
    if (!isAllowedDirectCommand(sender, target, command)) return;
    const socket = target === "host" ? room.host : room.clients.get(target);
    if (socket && socket.readyState === WebSocket.OPEN) {
      send(socket, command, payload[1], feedback);
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
    const currentHostOpen =
      room.host && room.host.readyState === WebSocket.OPEN;
    const sameHostIdentity = room.hostPlayerId === socket.playerId;
    const allowed = !isRoomExpired(room) && sameHostIdentity;
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
      broadcastRoom(room, socket, "storytellerOnline", true);
      broadcastRoom(room, socket, "storytellerName", room.hostName || "说书人");
      flushPendingSeatVacates(room);
      if (wasNewRoom) addRoomToLobby(room.channel);
      else broadcastLobby("setRoomDetails", activeRoomDetails());
    }
    send(socket, "allowHost", allowed);
  }

  if (requests.checkAllowJoin) {
    const isMember = !!room && room.members.has(socket.playerId);
    const roomExists =
      !!room && !!room.hostPlayerId && !isRoomExpired(room) && isMember;
    const hostOnline = roomExists && isHostOnline(room);
    send(socket, "allowJoin", {
      allowed: roomExists,
      reason: roomExists ? (hostOnline ? "" : "hostOffline") : "missing",
      hostOnline,
      hasPassword: roomExists ? !!room.hasPassword : false,
    });
  }
}

function isSocketRoomMember(socket) {
  const room = socket.room;
  return !!(
    room &&
    rooms.get(room.channel) === room &&
    room.members.has(socket.playerId)
  );
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
    case "playerHeartbeat": {
      const player = ensurePlayer(params && params.playerId);
      if (player) {
        send(socket, "heartbeatAccepted", { playerId: player.playerId });
      } else {
        send(socket, "heartbeatRejected", { reason: "账户不存在" });
      }
      break;
    }
    case "presenceJoin":
      if (
        isSocketRoomMember(socket) &&
        !socket.isHost &&
        !socket.hasJoinedPresence
      ) {
        registerPresence(room, socket, params && params.name);
      }
      break;
    case "presenceUpdate":
      if (room && !socket.isHost && socket.hasJoinedPresence) {
        updatePresence(room, socket, params && params.name);
      }
      break;
    case "presenceLeave":
      if (
        room &&
        !socket.isHost &&
        (socket.hasJoinedPresence || room.members.has(socket.playerId))
      ) {
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
        const player = ensurePlayer(socket.playerId, {
          name: params && params.name,
        });
        if (!player) {
          send(socket, "heartbeatRejected", { reason: "账户不存在" });
          break;
        }
        updateHostRoomInfo(room, params);
        room.lastHostHeartbeat = now();
        broadcastLobby("setRoomDetails", activeRoomDetails());
      }
      break;
    case "direct":
      routeDirect(room, socket, params, feedback);
      break;
    case "uploadFile":
      if (isSocketRoomMember(socket)) handleUpload(socket, params);
      break;
    default:
      if (!isSocketRoomMember(socket)) {
        send(socket, "roomClosed", { reason: "房间身份已失效。" });
        break;
      }
      if (!isAllowedRoomCommand(socket, command)) break;
      if (command === "claim" && Array.isArray(params)) {
        const [seat, playerId] = params;
        const player = players.get(playerId);
        if (player && player.currentRoomId === room.channel) {
          player.seat = Number(seat) >= 0 ? Number(seat) : null;
        }
      }
      if (room) broadcastRoom(room, socket, command, params, feedback);
      break;
  }

  if (feedback) send(socket, "feedback", feedback);
}

function attachSession(socket, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const channel = safeRoomCode(parts[1]);
  const playerId = safePlayerId(parts[2]);
  const wantsHost = parts[3] === "host";
  const player = players.get(playerId);
  if (!channel || !player) {
    socket.close(1008, "Invalid room");
    return;
  }

  const existingRoom = rooms.get(channel);
  if (existingRoom && isRoomExpired(existingRoom)) {
    closeRoom(existingRoom, "房间已过期。");
  }
  const room = rooms.get(channel);
  if (
    !room ||
    player.currentRoomId !== channel ||
    !room.members.has(playerId) ||
    (wantsHost && room.storytellerId !== playerId)
  ) {
    socket.close(1008, "Invalid room binding");
    return;
  }
  socket.type = "session";
  socket.channel = channel;
  socket.playerId = playerId;
  socket.room = room;
  socket.isHost = false;
  socket.hasJoinedPresence = false;
  socket.hasLeftPresence = false;
  socket.displayName = "";

  player.sockets.add(socket);
  player.lastHeartbeat = now();

  if (wantsHost) {
    const currentHostOpen =
      room.host && room.host.readyState === WebSocket.OPEN;
    if (currentHostOpen && room.host !== socket) room.host.close(1000);
    room.host = socket;
    socket.isHost = true;
    room.lastHostHeartbeat = now();
    broadcastRoom(room, socket, "storytellerOnline", true);
    broadcastRoom(room, socket, "storytellerName", room.hostName || "说书人");
    flushPendingSeatVacates(room);
    broadcastLobby("setRoomDetails", activeRoomDetails());
  } else {
    room.clients.set(playerId, socket);
  }

  socket.on("message", (data) => handleSessionMessage(socket, data.toString()));
  socket.on("close", () => {
    player.sockets.delete(socket);
    if (!room) return;
    const wasCurrentClient = room.clients.get(playerId) === socket;
    if (wasCurrentClient) room.clients.delete(playerId);
    if (room.host === socket) {
      broadcastRoom(room, socket, "storytellerOnline", false);
      room.host = null;
      broadcastLobby("setRoomDetails", activeRoomDetails());
    }
  });
}

function sendLobbyResult(socket, command, requestId, payload = {}) {
  send(socket, command, { requestId, ...payload });
}

function handleIdentifyPlayer(socket, params = {}) {
  const requestId = params.requestId;
  const candidatePlayerId = safePlayerId(params.candidatePlayerId);
  const profile = params.profile || {};
  let player = candidatePlayerId ? players.get(candidatePlayerId) : null;
  if (player) {
    if (profile.name) player.name = displayName(profile.name);
    if (profile.gender) player.gender = displayGender(profile.gender);
    player.lastHeartbeat = now();
    logPlayerAccess(socket, "identify", player, profile);
    sendLobbyResult(socket, "identifyPlayerResult", requestId, {
      status: "playerAccepted",
      playerId: player.playerId,
      name: player.name,
      currentRoomId: player.currentRoomId,
      roomRole: player.roomRole,
    });
    return;
  }
  if (!profile.name) {
    sendLobbyResult(socket, "identifyPlayerResult", requestId, {
      status: "playerMissing",
      reason: "用户已不存在，需要重新建立",
    });
    return;
  }
  player = createPlayer(profile);
  logPlayerAccess(socket, "identify", player, profile);
  sendLobbyResult(socket, "identifyPlayerResult", requestId, {
    status: "playerCreated",
    playerId: player.playerId,
    name: player.name,
    currentRoomId: "",
    roomRole: "none",
  });
}

function handleCreateRoom(socket, params = {}) {
  const requestId = params.requestId;
  const player = ensurePlayer(params.playerId, params.profile || {});
  if (!player) {
    sendLobbyResult(socket, "createRoomResult", requestId, {
      ok: false,
      reason: "账户不存在",
    });
    return;
  }
  removePlayerFromCurrentRoom(player, "玩家已切换房间。");
  let roomCode;
  try {
    roomCode = generateRoomCode();
  } catch (e) {
    sendLobbyResult(socket, "createRoomResult", requestId, {
      ok: false,
      reason: "暂时无法生成房间号，请稍后再试。",
    });
    return;
  }
  const room = createRoomRecord(roomCode, player, params);
  logPlayerAccess(socket, "create-room", player, params.profile || {});
  logRoomAccess("create", room, player.playerId);
  addRoomToLobby(room.channel);
  sendLobbyResult(socket, "createRoomResult", requestId, {
    ok: true,
    roomCode: room.channel,
    playerId: player.playerId,
  });
}

function handleJoinRoom(socket, params = {}) {
  const requestId = params.requestId;
  const player = ensurePlayer(params.playerId, params.profile || {});
  const roomCode = safeRoomCode(params.roomCode);
  const room = roomCode ? rooms.get(roomCode) : null;
  if (!player) {
    sendLobbyResult(socket, "joinRoomResult", requestId, {
      ok: false,
      reason: "账户不存在",
    });
    return;
  }
  if (!room || isRoomExpired(room)) {
    sendLobbyResult(socket, "joinRoomResult", requestId, {
      ok: false,
      reason: "missing",
    });
    return;
  }
  if (room.hasPassword && room.password !== String(params.password || "")) {
    sendLobbyResult(socket, "joinRoomResult", requestId, {
      ok: false,
      reason: "password",
    });
    return;
  }
  removePlayerFromCurrentRoom(player, "玩家已切换房间。");
  player.currentRoomId = room.channel;
  player.roomRole = "player";
  player.seat = null;
  room.members.set(player.playerId, player.name || "玩家");
  logPlayerAccess(socket, "join-room", player, params.profile || {});
  logRoomAccess("join", room, player.playerId);
  sendLobbyResult(socket, "joinRoomResult", requestId, {
    ok: true,
    roomCode: room.channel,
    playerId: player.playerId,
    hasPassword: room.hasPassword,
  });
}

function handleValidateSession(socket, params = {}) {
  const requestId = params.requestId;
  const player = ensurePlayer(params.playerId);
  const roomCode = safeRoomCode(params.roomCode);
  const room = roomCode ? rooms.get(roomCode) : null;
  let reason = "";
  let role = "none";
  const ok = !!(
    player &&
    room &&
    !isRoomExpired(room) &&
    player.currentRoomId === room.channel &&
    room.members.has(player.playerId)
  );
  if (ok) {
    role = player.roomRole;
  } else if (!player) {
    reason = "accountMissing";
  } else if (!room || isRoomExpired(room)) {
    reason = "roomMissing";
  } else if (room.storytellerId === player.playerId) {
    reason = "storytellerMismatch";
  } else {
    reason = "notMember";
  }
  sendLobbyResult(socket, "validateSessionResult", requestId, {
    ok,
    reason,
    playerId: player ? player.playerId : "",
    roomCode: room ? room.channel : "",
    role,
    hasPassword: room ? !!room.hasPassword : false,
  });
}

function handlePlayerHeartbeat(socket, params = {}) {
  const requestId = params.requestId;
  const player = ensurePlayer(params.playerId);
  if (!player) {
    sendLobbyResult(socket, "playerHeartbeatResult", requestId, {
      ok: false,
      reason: "账户不存在",
    });
    return;
  }
  sendLobbyResult(socket, "playerHeartbeatResult", requestId, {
    ok: true,
    playerId: player.playerId,
  });
}

function attachLobby(socket) {
  socket.type = "lobby";
  lobbies.add(socket);
  sendLobbyRooms(socket);
  socket.on("message", (data) => {
    let command;
    let params;
    try {
      [command, params] = JSON.parse(data.toString());
    } catch (e) {
      return;
    }
    if (command === "refreshRooms") sendLobbyRooms(socket);
    if (command === "refreshRoomsLive") sendLobbyRooms(socket, true);
    if (command === "identifyPlayer") handleIdentifyPlayer(socket, params);
    if (command === "createRoom") handleCreateRoom(socket, params);
    if (command === "joinRoom") handleJoinRoom(socket, params);
    if (command === "validateSession") handleValidateSession(socket, params);
    if (command === "playerHeartbeat") handlePlayerHeartbeat(socket, params);
  });
  socket.on("close", () => lobbies.delete(socket));
}

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (!pathname.startsWith("/ws/") && !pathname.startsWith("/lobby/")) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.clientIp = requestIp(req, socket);
    if (pathname.startsWith("/ws/")) {
      attachSession(ws, pathname);
    } else {
      attachLobby(ws);
    }
  });
});

setInterval(cleanupExpiredPlayers, PLAYER_CLEANUP_MS);

server.listen(port, host, () => {
  console.log(`Townsquare local server listening on http://${host}:${port}`);
  console.log(`Serving ${staticRoot}`);
});
