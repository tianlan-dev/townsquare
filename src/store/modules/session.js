/**
 * Handle a vote request.
 * If the vote is from a seat that is already locked, ignore it.
 * @param state session state
 * @param index seat of the player in the circle
 * @param vote true or false
 */

import Vue from "vue";
import { DEFAULT_PLAYER_AVATARS } from "../../playerAvatars";

const MIN_VOTING_SPEED = 2000;

const normalizeVotingSpeed = (votingSpeed) =>
  Math.max(MIN_VOTING_SPEED, Number(votingSpeed) || MIN_VOTING_SPEED);

const handleVote = (state, [index, vote]) => {
  if (state.isSpectator && !state.isStorytellerOnline) return;
  if (!state.nomination) return;
  state.votes = [...state.votes];
  state.votes[index] = vote === undefined ? 0 : vote;
};

const voteValue = (vote) => (typeof vote === "number" ? vote : vote ? 1 : 0);

const nominationKeyFor = (players, index) => {
  const player = Array.isArray(players) ? players[index] : null;
  return player && player.id
    ? `player:${player.id}`
    : `seat:${Number(index) + 1}`;
};

const normalizeSeatList = (seats = []) =>
  [...new Set((Array.isArray(seats) ? seats : []).map(Number))]
    .filter((seat) => Number.isInteger(seat) && seat >= 0)
    .sort((a, b) => a - b);

const normalizeNominationMarks = (marks = {}) => {
  if (!marks || typeof marks !== "object") return {};
  return Object.entries(marks).reduce((normalized, [day, keys]) => {
    const dayKey = String(day);
    if (!Array.isArray(keys)) return normalized;
    normalized[dayKey] = [...new Set(keys.filter(Boolean).map(String))];
    return normalized;
  }, {});
};

const setMarkedForDay = (collection, day, key, value) => {
  const dayKey = String(day || "");
  const playerKey = String(key || "");
  if (!dayKey || !playerKey) return;
  const current = Array.isArray(collection[dayKey])
    ? [...collection[dayKey]]
    : [];
  const exists = current.includes(playerKey);
  if (value && !exists) {
    current.push(playerKey);
  } else if (!value && exists) {
    current.splice(current.indexOf(playerKey), 1);
  }
  if (current.length) {
    Vue.set(collection, dayKey, current);
  } else {
    Vue.delete(collection, dayKey);
  }
};

const normalizeInitialRoleIds = (roleIds = []) => {
  if (!Array.isArray(roleIds)) return [];
  return roleIds.map((entry, index) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return {
        seat: Number(entry.seat) || index + 1,
        roleId: String(entry.roleId || ""),
      };
    }
    return {
      seat: index + 1,
      roleId: String(entry || ""),
    };
  });
};

const emptyReviewDetails = () => ({
  version: 1,
  id: "",
  createdAt: "",
  updatedAt: "",
  storytellingStartedAt: "",
  storytellingEndedAt: "",
  pushedAt: "",
  phaseIndexAtPush: 0,
  lastPhaseIndex: 0,
  nextOrder: 1,
  reviewFingerprint: "",
  roleCatalog: {},
  initialRoles: [],
  bluffs: [],
  events: [],
  winnerTeam: "",
});

const randomReviewFingerprint = () => {
  const cryptoObject =
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
      ? window.crypto
      : null;
  if (cryptoObject) {
    const values = new Uint32Array(4);
    cryptoObject.getRandomValues(values);
    return Array.from(values, (value) =>
      value.toString(16).padStart(8, "0"),
    ).join("");
  }
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
};

const randomReviewId = () => `review-${randomReviewFingerprint()}`;

const normalizeRoleCatalog = (roleCatalog = {}) => {
  if (!roleCatalog || typeof roleCatalog !== "object") return {};
  return Object.entries(roleCatalog).reduce((catalog, [key, value]) => {
    const source = value && typeof value === "object" ? value : {};
    const id = String(source.id || key || "");
    if (!id) return catalog;
    catalog[id] = {
      id,
      name: String(source.name || ""),
      team: String(source.team || ""),
    };
    return catalog;
  }, {});
};

const sanitizeReviewSeatInfo = (seatInfo = {}) => {
  if (!seatInfo || typeof seatInfo !== "object") return seatInfo;
  const sanitized = { ...seatInfo };
  delete sanitized.playerName;
  delete sanitized.name;
  return sanitized;
};

const sanitizeReviewVoteText = (text = "") => {
  const match = String(text || "").match(/^(\d+)/);
  return match ? match[1] : String(text || "");
};

const sanitizeReviewEvent = (event = {}) => {
  const sanitized = { ...event };
  if (sanitized.seatInfo) {
    sanitized.seatInfo = sanitizeReviewSeatInfo(sanitized.seatInfo);
  }
  if (sanitized.vote && typeof sanitized.vote === "object") {
    const vote = { ...sanitized.vote };
    vote.nominator = sanitizeReviewVoteText(vote.nominator);
    vote.nominee = sanitizeReviewVoteText(vote.nominee);
    vote.nominatorSeatInfo = sanitizeReviewSeatInfo(vote.nominatorSeatInfo);
    vote.nomineeSeatInfo = sanitizeReviewSeatInfo(vote.nomineeSeatInfo);
    vote.votedSeatInfos = Array.isArray(vote.votedSeatInfos)
      ? vote.votedSeatInfos.map(sanitizeReviewSeatInfo)
      : [];
    vote.votedPlayers = Array.isArray(vote.votedPlayers)
      ? vote.votedPlayers.map(sanitizeReviewVoteText)
      : [];
    sanitized.vote = vote;
  }
  return sanitized;
};

const normalizeReviewDetails = (details = {}) => {
  const normalized = emptyReviewDetails();
  const source = details && typeof details === "object" ? details : {};
  normalized.version = Number(source.version) || 1;
  normalized.id = String(
    source.id ||
      source.reviewFingerprint ||
      source.contentHash ||
      source.createdAt ||
      "",
  );
  normalized.createdAt = String(source.createdAt || "");
  normalized.updatedAt = String(source.updatedAt || "");
  normalized.storytellingStartedAt = String(
    source.storytellingStartedAt || source.createdAt || "",
  );
  normalized.storytellingEndedAt = String(source.storytellingEndedAt || "");
  normalized.pushedAt = String(source.pushedAt || "");
  normalized.phaseIndexAtPush = Number(source.phaseIndexAtPush) || 0;
  normalized.lastPhaseIndex = Number(source.lastPhaseIndex) || 0;
  normalized.nextOrder = Number(source.nextOrder) || 1;
  normalized.reviewFingerprint = String(
    source.reviewFingerprint || source.contentHash || "",
  );
  normalized.roleCatalog = normalizeRoleCatalog(source.roleCatalog);
  normalized.initialRoles = Array.isArray(source.initialRoles)
    ? source.initialRoles.map((entry, index) => ({
        seat: Number(entry.seat) || index + 1,
        roleId: String(entry.roleId || ""),
      }))
    : [];
  normalized.bluffs = Array.isArray(source.bluffs)
    ? source.bluffs.map((entry) => ({
        roleId: String((entry && entry.roleId) || ""),
      }))
    : [];
  normalized.events = Array.isArray(source.events)
    ? source.events.map((event, index) => ({
        ...sanitizeReviewEvent(event),
        phaseIndex: Number(event.phaseIndex) || 0,
        order: Number(event.order) || index + 1,
      }))
    : [];
  normalized.winnerTeam = ["good", "evil"].includes(String(source.winnerTeam))
    ? String(source.winnerTeam)
    : "";
  return normalized;
};

const reviewSeatInfoFor = (players = [], index) => {
  const seat = Number(index) + 1;
  const player = players[index] || {};
  return {
    seat,
    roleId: String((player.role && player.role.id) || ""),
  };
};

const mergeRoleCatalog = (current = {}, incoming = {}) => {
  const merged = normalizeRoleCatalog(current);
  Object.entries(normalizeRoleCatalog(incoming)).forEach(([id, role]) => {
    const existing = merged[id] || { id, name: "", team: "" };
    merged[id] = {
      id,
      name: existing.name || role.name || "",
      team: existing.team || role.team || "",
    };
  });
  return merged;
};

const reviewRecordKey = (details = {}) =>
  String(
    details.id ||
      details.reviewFingerprint ||
      details.contentHash ||
      details.createdAt ||
      "",
  );

const hasReviewDetailsContent = (details = {}) =>
  !!(
    (Array.isArray(details.initialRoles) && details.initialRoles.length) ||
    (Array.isArray(details.bluffs) && details.bluffs.length) ||
    (Array.isArray(details.events) && details.events.length) ||
    details.winnerTeam
  );

const normalizeReviewRecords = (records = []) =>
  (Array.isArray(records) ? records : [])
    .map((record) => normalizeReviewDetails(record))
    .filter(
      (record) => reviewRecordKey(record) || hasReviewDetailsContent(record),
    )
    .map((record) => ({
      ...record,
      id: reviewRecordKey(record) || randomReviewId(),
    }));

const newestReviewRecord = (records = []) =>
  [...records].sort((a, b) =>
    String(
      b.pushedAt ||
        b.storytellingEndedAt ||
        b.updatedAt ||
        b.storytellingStartedAt ||
        b.createdAt ||
        "",
    ).localeCompare(
      String(
        a.pushedAt ||
          a.storytellingEndedAt ||
          a.updatedAt ||
          a.storytellingStartedAt ||
          a.createdAt ||
          "",
      ),
    ),
  )[0] || emptyReviewDetails();

const upsertReviewRecord = (records = [], details = {}) => {
  const normalized = normalizeReviewDetails(details);
  const key = reviewRecordKey(normalized) || randomReviewId();
  const record = {
    ...normalized,
    id: key,
  };
  const existingIndex = records.findIndex(
    (candidate) => reviewRecordKey(candidate) === key,
  );
  if (existingIndex >= 0) {
    Vue.set(records, existingIndex, record);
  } else {
    records.push(record);
  }
  return record;
};

const removeUnreadReviewId = (state, id = "") => {
  const key = String(id || "");
  if (!key) return;
  state.unreadReviewDetailsIds = state.unreadReviewDetailsIds.filter(
    (unreadId) => unreadId !== key,
  );
  state.hasUnreadReviewDetails = state.unreadReviewDetailsIds.length > 0;
};

const state = () => ({
  sessionId: "",
  stId: null,
  rooms: null,
  roomDetails: [],
  roomListRefreshKey: 0,
  roomListRefreshedAt: 0,
  isHostAllowed: null,
  hostTimeout: null,
  isJoinAllowed: null,
  joinTimeout: null,
  isClosingRoom: false,
  isLeavingRoom: false,
  isSpectator: false,
  isStorytellerOnline: false,
  isReconnecting: false,
  playerCount: 0,
  ping: 0,
  storytellerName: "",
  playerId: "",
  playerSecret: "",
  playerName: "",
  playerGender: "",
  playerAvatar: DEFAULT_PLAYER_AVATARS.female,
  playerAvatarSource: "default",
  defaultAvatarRequest: null,
  avatarCleanupRequest: 0,
  roomPassword: "",
  pendingJoinPassword: "",
  savedRoomPasswords: {},
  claimedSeat: -1,
  nomination: false,
  nominationDay: null,
  nominationNominatorsByDay: {},
  nominationNomineesByDay: {},
  playerVotes: 1,
  isRole: {
    wraith: {
      active: false, // player
      using: false, // player
      st: 0, // st
      player: 0, // st
      prob: 0.05, // st
      probMax: 0.1, // st
    },
  },
  votes: [],
  lockedVote: 0,
  votingSpeed: MIN_VOTING_SPEED,
  isVoteInProgress: false,
  voteReadyStatus: "idle",
  voteReadyEligibleSeats: [],
  voteReadySeats: [],
  voteReadyDismissedSeats: [],
  isSecretVote: false,
  voteHistory: [],
  voteSelected: [],
  markedPlayer: -1,
  isStorytelling: false,
  initialRoleIds: [],
  grimoireHistory: emptyReviewDetails(),
  grimoireHistoryRecords: [],
  activeGrimoireHistoryId: "",
  receivedReviewDetails: emptyReviewDetails(),
  receivedReviewDetailsRecords: [],
  unreadReviewDetailsIds: [],
  hasUnreadReviewDetails: false,
  isVoteHistoryAllowed: true,
  isRolesDistributed: false,
  isTypesDistributed: false,
  isBluffsDistributed: false,
  isEvilInfoDistributed: false,
  isGrimoireDistributed: false,
  isUseOldOrder: {
    pithag: false,
    professor: false,
  },
  isUseOldRole: {
    balloonist: false,
    acrobat: false,
    lilmonsta: false,
    alchemist: false,
    lycanthrope: false,
  },
  isReview: false,
  isTyping: false,
  inputType: "",
  inputModal: "",
  inputData: {},
  inputResolver: null,
  inputRejecter: null,
  bootlegger: "",
  timer: 480,
  isTimerRunning: false,
  startTime: null,
  lastUpdateTime: null,
  interval: null,
});

const getters = {};

const actions = {};

// mutations helper functions
const set = (key) => (state, val) => {
  state[key] = val;
};

const mutations = {
  setIsJoinAllowed: set("isJoinAllowed"),
  setIsHostAllowed: set("isHostAllowed"),
  setRooms: set("rooms"),
  setRoomDetails: set("roomDetails"),
  setRoomListRefreshedAt: set("roomListRefreshedAt"),
  requestRoomListRefresh(state) {
    state.roomListRefreshKey += 1;
  },
  setClosingRoom: set("isClosingRoom"),
  setLeavingRoom: set("isLeavingRoom"),
  setPlayerId: set("playerId"),
  setPlayerSecret: set("playerSecret"),
  setPlayerGender: set("playerGender"),
  setPlayerAvatarSource: set("playerAvatarSource"),
  requestDefaultAvatar: set("defaultAvatarRequest"),
  requestAvatarCleanup(state) {
    state.avatarCleanupRequest += 1;
  },
  setStorytellerName: set("storytellerName"),
  setStId: set("stId"),
  setSpectator: set("isSpectator"),
  setStorytellerOnline: set("isStorytellerOnline"),
  setReconnecting: set("isReconnecting"),
  setPlayerCount: set("playerCount"),
  setPing: set("ping"),
  setPlayerVotes: set("playerVotes"),
  setVotingSpeed(state, votingSpeed) {
    state.votingSpeed = normalizeVotingSpeed(votingSpeed);
  },
  setTimer(state, time) {
    state.timer = Math.max(0, Number(time) || 0);
  },
  setVoteInProgress: set("isVoteInProgress"),
  setVoteReadyState(
    state,
    {
      status = "idle",
      eligibleSeats = [],
      readySeats = [],
      dismissedSeats = [],
    } = {},
  ) {
    state.voteReadyStatus = status === "waiting" ? "waiting" : "idle";
    state.voteReadyEligibleSeats =
      state.voteReadyStatus === "waiting" ? normalizeSeatList(eligibleSeats) : [];
    state.voteReadySeats =
      state.voteReadyStatus === "waiting" ? normalizeSeatList(readySeats) : [];
    state.voteReadyDismissedSeats =
      state.voteReadyStatus === "waiting"
        ? normalizeSeatList(dismissedSeats)
        : [];
  },
  startVoteReady(state, eligibleSeats = []) {
    state.voteReadyStatus = "waiting";
    state.voteReadyEligibleSeats = normalizeSeatList(eligibleSeats);
    state.voteReadySeats = [];
    state.voteReadyDismissedSeats = [];
  },
  voteReady(state, seat) {
    const normalizedSeat = Number(seat);
    if (!state.voteReadyEligibleSeats.includes(normalizedSeat)) return;
    state.voteReadySeats = normalizeSeatList([
      ...state.voteReadySeats,
      normalizedSeat,
    ]);
    state.voteReadyDismissedSeats = state.voteReadyDismissedSeats.filter(
      (dismissedSeat) => dismissedSeat !== normalizedSeat,
    );
  },
  voteReadyDismissed(state, seat) {
    const normalizedSeat = Number(seat);
    if (!state.voteReadyEligibleSeats.includes(normalizedSeat)) return;
    if (state.voteReadySeats.includes(normalizedSeat)) return;
    state.voteReadyDismissedSeats = normalizeSeatList([
      ...state.voteReadyDismissedSeats,
      normalizedSeat,
    ]);
  },
  clearVoteReady(state) {
    state.voteReadyStatus = "idle";
    state.voteReadyEligibleSeats = [];
    state.voteReadySeats = [];
    state.voteReadyDismissedSeats = [];
  },
  setMarkedPlayer(state, { val, force }) {
    if (!force && state.isSecretVote && val >= 0) return;
    state.markedPlayer = val;
  },
  setNomination: set("nomination"),
  setNominationDay: set("nominationDay"),
  setNominationMarks(state, { nominatorsByDay = {}, nomineesByDay = {} } = {}) {
    state.nominationNominatorsByDay = normalizeNominationMarks(nominatorsByDay);
    state.nominationNomineesByDay = normalizeNominationMarks(nomineesByDay);
  },
  markNomination(state, { day, nominatorKey, nomineeKey } = {}) {
    setMarkedForDay(state.nominationNominatorsByDay, day, nominatorKey, true);
    setMarkedForDay(state.nominationNomineesByDay, day, nomineeKey, true);
  },
  clearNominationNominator(state, { day, key } = {}) {
    setMarkedForDay(state.nominationNominatorsByDay, day, key, false);
  },
  clearNominationNominee(state, { day, key } = {}) {
    setMarkedForDay(state.nominationNomineesByDay, day, key, false);
  },
  clearNominationMarks(state) {
    state.nominationNominatorsByDay = {};
    state.nominationNomineesByDay = {};
  },
  setVoteHistoryAllowed: set("isVoteHistoryAllowed"),
  setStorytelling(state, isStorytelling) {
    state.isStorytelling = !!isStorytelling;
  },
  setInitialRoleIds(state, roleIds = []) {
    state.initialRoleIds = normalizeInitialRoleIds(roleIds);
  },
  addInitialRoleSnapshot(state, { seat, roleId = "", roleCatalog = {} } = {}) {
    const normalizedSeat = Number(seat) || state.initialRoleIds.length + 1;
    const existingIndex = state.initialRoleIds.findIndex(
      (entry) => Number(entry.seat) === normalizedSeat,
    );
    const entry = {
      seat: normalizedSeat,
      roleId: String(roleId || ""),
    };
    if (existingIndex >= 0) {
      Vue.set(state.initialRoleIds, existingIndex, entry);
    } else {
      state.initialRoleIds.push(entry);
    }
    if (state.isStorytelling && state.grimoireHistory.createdAt) {
      const history = normalizeReviewDetails(state.grimoireHistory);
      const historyIndex = history.initialRoles.findIndex(
        (initialRole) => Number(initialRole.seat) === normalizedSeat,
      );
      if (historyIndex >= 0) {
        Vue.set(history.initialRoles, historyIndex, entry);
      } else {
        history.initialRoles.push(entry);
      }
      history.roleCatalog = mergeRoleCatalog(history.roleCatalog, roleCatalog);
      history.updatedAt = new Date().toISOString();
      const record = upsertReviewRecord(state.grimoireHistoryRecords, history);
      state.activeGrimoireHistoryId = record.id;
      state.grimoireHistory = record;
    }
  },
  initializeGrimoireHistory(
    state,
    { initialRoles = [], bluffs = [], phaseIndex = 0, roleCatalog = {} } = {},
  ) {
    const timestamp = new Date().toISOString();
    const history = normalizeReviewDetails({
      ...emptyReviewDetails(),
      id: randomReviewId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      storytellingStartedAt: timestamp,
      lastPhaseIndex: Number(phaseIndex) || 0,
      roleCatalog,
      initialRoles: normalizeReviewDetails({ initialRoles }).initialRoles,
      bluffs: normalizeReviewDetails({ bluffs }).bluffs,
    });
    const record = upsertReviewRecord(state.grimoireHistoryRecords, history);
    state.activeGrimoireHistoryId = record.id;
    state.grimoireHistory = record;
  },
  setGrimoireHistory(state, details = {}) {
    const history = normalizeReviewDetails(details);
    if (reviewRecordKey(history) || hasReviewDetailsContent(history)) {
      const record = upsertReviewRecord(state.grimoireHistoryRecords, history);
      state.activeGrimoireHistoryId =
        state.activeGrimoireHistoryId || record.id;
      state.grimoireHistory = record;
    } else {
      state.grimoireHistory = history;
    }
  },
  setGrimoireHistoryRecords(state, { records = [], activeId = "" } = {}) {
    state.grimoireHistoryRecords = normalizeReviewRecords(records);
    const activeRecord =
      state.grimoireHistoryRecords.find(
        (record) => reviewRecordKey(record) === String(activeId || ""),
      ) || newestReviewRecord(state.grimoireHistoryRecords);
    state.activeGrimoireHistoryId = reviewRecordKey(activeRecord);
    state.grimoireHistory = normalizeReviewDetails(activeRecord);
  },
  startReview(state, { phaseIndex = 0, winnerTeam = "" } = {}) {
    if (!state.isSpectator && !state.isReview) {
      const timestamp = new Date().toISOString();
      const history = normalizeReviewDetails({
        ...state.grimoireHistory,
        id: state.grimoireHistory.id || state.activeGrimoireHistoryId,
        reviewFingerprint:
          state.grimoireHistory.reviewFingerprint || randomReviewFingerprint(),
        storytellingEndedAt:
          state.grimoireHistory.storytellingEndedAt || timestamp,
        phaseIndexAtPush: Number(phaseIndex) || 0,
        pushedAt: timestamp,
        updatedAt: timestamp,
        winnerTeam,
      });
      const record = upsertReviewRecord(state.grimoireHistoryRecords, history);
      state.activeGrimoireHistoryId = record.id;
      state.grimoireHistory = record;
    }
    state.isReview = true;
  },
  mergeGrimoireHistoryRoleCatalog(state, roleCatalog = {}) {
    if (state.isSpectator || !state.grimoireHistory.createdAt) return;
    const history = normalizeReviewDetails(state.grimoireHistory);
    const mergedCatalog = mergeRoleCatalog(history.roleCatalog, roleCatalog);
    if (JSON.stringify(mergedCatalog) === JSON.stringify(history.roleCatalog)) {
      return;
    }
    history.roleCatalog = mergedCatalog;
    history.updatedAt = new Date().toISOString();
    const record = upsertReviewRecord(state.grimoireHistoryRecords, history);
    state.grimoireHistory = record;
  },
  appendGrimoireHistoryEvents(state, payload = []) {
    const events = Array.isArray(payload) ? payload : payload.events;
    if (!Array.isArray(events) || !events.length) return;
    const roleCatalog = Array.isArray(payload) ? {} : payload.roleCatalog;
    const history = normalizeReviewDetails(state.grimoireHistory);
    history.roleCatalog = mergeRoleCatalog(history.roleCatalog, roleCatalog);
    const normalizedEvents = events.map((event = {}) => {
      const phaseIndex = Number(event.phaseIndex) || 0;
      const order = history.nextOrder++;
      history.lastPhaseIndex = Math.max(history.lastPhaseIndex, phaseIndex);
      return {
        ...sanitizeReviewEvent(event),
        phaseIndex,
        order,
        id: event.id || `${Date.now()}-${order}`,
      };
    });
    history.events = [...history.events, ...normalizedEvents];
    history.updatedAt = new Date().toISOString();
    const record = upsertReviewRecord(state.grimoireHistoryRecords, history);
    state.activeGrimoireHistoryId = record.id;
    state.grimoireHistory = record;
  },
  removeGrimoireHistoryEvent(state, eventToRemove = {}) {
    if (state.isSpectator || state.isReview || !state.isStorytelling) return;
    const history = normalizeReviewDetails(state.grimoireHistory);
    const eventId = String(eventToRemove.id || "");
    const eventOrder = Number(eventToRemove.order) || 0;
    const nextEvents = history.events.filter((event) => {
      if (eventId && String(event.id || "") === eventId) return false;
      if (!eventId && eventOrder && Number(event.order) === eventOrder) {
        return false;
      }
      return true;
    });
    if (nextEvents.length === history.events.length) return;
    history.events = nextEvents;
    history.updatedAt = new Date().toISOString();
    const record = upsertReviewRecord(state.grimoireHistoryRecords, history);
    state.grimoireHistory = record;
  },
  clearGrimoireHistory(state) {
    state.grimoireHistory = emptyReviewDetails();
    state.activeGrimoireHistoryId = "";
  },
  deleteGrimoireHistoryRecord(state, recordId = "") {
    const key = String(recordId || "");
    if (!key) return;
    if (state.isStorytelling && key === state.activeGrimoireHistoryId) return;
    state.grimoireHistoryRecords = state.grimoireHistoryRecords.filter(
      (record) => reviewRecordKey(record) !== key,
    );
    if (state.activeGrimoireHistoryId === key) {
      state.activeGrimoireHistoryId = "";
    }
    const activeRecord =
      state.grimoireHistoryRecords.find(
        (record) => reviewRecordKey(record) === state.activeGrimoireHistoryId,
      ) || newestReviewRecord(state.grimoireHistoryRecords);
    state.grimoireHistory = normalizeReviewDetails(activeRecord);
    state.activeGrimoireHistoryId = reviewRecordKey(activeRecord);
  },
  receiveReviewDetails(state, details = {}) {
    const incomingDetails = normalizeReviewDetails(details);
    const incomingKey = reviewRecordKey(incomingDetails);
    const incomingFingerprint = incomingDetails.reviewFingerprint;
    const exists = state.receivedReviewDetailsRecords.some((record) => {
      if (
        incomingFingerprint &&
        record.reviewFingerprint === incomingFingerprint
      )
        return true;
      return incomingKey && reviewRecordKey(record) === incomingKey;
    });
    if (exists) return;
    const record = upsertReviewRecord(
      state.receivedReviewDetailsRecords,
      incomingDetails,
    );
    state.receivedReviewDetails = record;
    if (!state.unreadReviewDetailsIds.includes(record.id)) {
      state.unreadReviewDetailsIds.push(record.id);
    }
    state.hasUnreadReviewDetails = true;
  },
  setReceivedReviewDetails(state, details = {}) {
    const incomingDetails = normalizeReviewDetails(details);
    if (
      reviewRecordKey(incomingDetails) ||
      hasReviewDetailsContent(incomingDetails)
    ) {
      const record = upsertReviewRecord(
        state.receivedReviewDetailsRecords,
        incomingDetails,
      );
      state.receivedReviewDetails = record;
    } else {
      state.receivedReviewDetails = incomingDetails;
    }
  },
  setReceivedReviewDetailsRecords(
    state,
    { records = [], unreadIds = [] } = {},
  ) {
    state.receivedReviewDetailsRecords = normalizeReviewRecords(records);
    state.receivedReviewDetails = normalizeReviewDetails(
      newestReviewRecord(state.receivedReviewDetailsRecords),
    );
    const validIds = new Set(
      state.receivedReviewDetailsRecords.map((record) => record.id),
    );
    state.unreadReviewDetailsIds = (Array.isArray(unreadIds) ? unreadIds : [])
      .map(String)
      .filter((id) => validIds.has(id));
    state.hasUnreadReviewDetails = state.unreadReviewDetailsIds.length > 0;
  },
  clearReceivedReviewDetails(state) {
    state.receivedReviewDetails = emptyReviewDetails();
  },
  deleteReceivedReviewDetailsRecord(state, recordId = "") {
    const key = String(recordId || "");
    if (!key) return;
    state.receivedReviewDetailsRecords =
      state.receivedReviewDetailsRecords.filter(
        (record) => reviewRecordKey(record) !== key,
      );
    removeUnreadReviewId(state, key);
    state.receivedReviewDetails = normalizeReviewDetails(
      newestReviewRecord(state.receivedReviewDetailsRecords),
    );
  },
  markReviewDetailsRead(state, recordId = "") {
    const key = String(recordId || "");
    if (key) {
      removeUnreadReviewId(state, key);
      return;
    }
    state.unreadReviewDetailsIds = [];
    state.hasUnreadReviewDetails = false;
  },
  startStorytelling(state, players = []) {
    state.initialRoleIds = Array.isArray(players)
      ? players.map((player, index) => ({
          seat: index + 1,
          roleId: String((player.role && player.role.id) || ""),
        }))
      : [];
    state.isReview = false;
    state.isStorytelling = true;
  },
  endStorytelling(state) {
    state.isStorytelling = false;
    state.isReview = false;
    state.initialRoleIds = [];
    state.nominationNominatorsByDay = {};
    state.nominationNomineesByDay = {};
  },
  setTyping: set("isTyping"),
  setInputType: set("inputType"),
  setInputModal: set("inputModal"),
  setInputData: set("inputData"),
  setSecretVote: set("isSecretVote"),
  setBootlegger: set("bootlegger"),
  setUseOldOrder: set("isUseOldOrder"),
  setUseOldRole: set("isUseOldRole"),
  setIsReview: set("isReview"),
  setInputResolver(state, resolver) {
    state.inputResolver = resolver;
  },
  setInputRejecter(state, rejecter) {
    state.inputRejecter = rejecter;
  },
  clearInputHandlers(state) {
    // New mutation for cleanup
    state.inputResolver = null;
    state.inputRejecter = null;
  },
  claimSeat: set("claimedSeat"),
  distributeRoles: set("isRolesDistributed"),
  distributeTypes: set("isTypesDistributed"),
  distributeBluffs(state, { val }) {
    state.isBluffsDistributed = val;
  },
  distributeEvilInfo(state, { val }) {
    state.isEvilInfoDistributed = val;
  },
  distributeSeatTypeInfo(state, { val }) {
    state.isEvilInfoDistributed = val;
  },
  distributeGrimoire(state, { val }) {
    state.isGrimoireDistributed = val;
  },
  clearDistributedPlayerInfo(state) {
    state.isRolesDistributed = false;
    state.isTypesDistributed = false;
    state.isBluffsDistributed = false;
    state.isEvilInfoDistributed = false;
    state.isGrimoireDistributed = false;
  },
  setSessionId(state, sessionId) {
    state.sessionId = sessionId
      .toLocaleLowerCase()
      .replace(/[^0-9a-z]/g, "")
      .substr(0, 10);
  },
  setPlayerName(state, name) {
    state.playerName = name;
  },
  setRoomPassword: set("roomPassword"),
  setPendingJoinPassword: set("pendingJoinPassword"),
  setSavedRoomPasswords: set("savedRoomPasswords"),
  setSavedRoomPassword(state, { sessionId, password }) {
    if (!sessionId) return;
    Vue.set(state.savedRoomPasswords, sessionId, password);
  },
  nomination(
    state,
    {
      nomination,
      votes,
      votingSpeed,
      lockedVote,
      isVoteInProgress,
      day,
      nominatedPlayer = null,
    } = {},
  ) {
    state.nomination = nomination || false;
    state.nominationDay = nomination ? day || state.nominationDay : null;
    if (!nomination) {
      state.voteReadyStatus = "idle";
      state.voteReadyEligibleSeats = [];
      state.voteReadySeats = [];
      state.voteReadyDismissedSeats = [];
    }
    const voteInProgress =
      isVoteInProgress !== undefined
        ? isVoteInProgress
        : state.isVoteInProgress;
    if (
      !!nomination &&
      !!nominatedPlayer &&
      state.isSecretVote &&
      voteInProgress &&
      nominatedPlayer.role.team != "traveler"
    ) {
      for (let i = 0; i < votes.length; i++) {
        if (i != state.claimedSeat) {
          votes[i] = false;
        }
      }
    }
    state.votes = votes || [];
    state.votingSpeed =
      votingSpeed !== undefined
        ? normalizeVotingSpeed(votingSpeed)
        : state.votingSpeed;
    state.lockedVote = lockedVote || 0;
    state.isVoteInProgress = isVoteInProgress || false;
  },
  /**
   * Create an entry in the vote history log. Requires current player array because it might change later in the game.
   * Only stores votes that were completed.
   * @param state
   * @param players
   */
  addHistory(state, players) {
    if (
      !Array.isArray(players) ||
      !state.nomination ||
      state.lockedVote <= players.length
    )
      return;
    const [nominatorIndex, nomineeIndex] = state.nomination;
    const nominator = players[nominatorIndex];
    const nominee = players[nomineeIndex];
    if (!nominator || !nominee) return;
    const isExile = nominee.role && nominee.role.team === "traveler";
    const votedPlayers = Array.from(players).filter(
      (player, index) => state.votes[index],
    );
    votedPlayers.forEach((player) => {
      player.seat = players.indexOf(player) + 1;
      player.votes = voteValue(state.votes[players.indexOf(player)]);
    });
    this.commit("session/markNomination", {
      day: state.nominationDay,
      nominatorKey: nominationKeyFor(players, nominatorIndex),
      nomineeKey: nominationKeyFor(players, nomineeIndex),
    });
    this.commit("session/addVotes", {
      timestamp: new Date(),
      nominator: (nominatorIndex + 1).toString(),
      nominatorSeatInfo: reviewSeatInfoFor(players, nominatorIndex),
      nominee: (nomineeIndex + 1).toString(),
      nomineeSeatInfo: reviewSeatInfoFor(players, nomineeIndex),
      day: state.nominationDay,
      type: isExile ? "流放" : "处决",
      mode: state.isSecretVote ? "闭眼" : "睁眼",
      votes: state.votes.reduce((sum, vote) => sum + voteValue(vote), 0),
      majority: Math.ceil(
        players.filter((player) => !player.isDead || isExile).length / 2,
      ),
      votedPlayers: votedPlayers.map(
        ({ seat, votes }) => seat + (votes > 1 ? " *" + votes + "票" : ""),
      ),
      votedSeatInfos: votedPlayers.map((player) =>
        reviewSeatInfoFor(players, players.indexOf(player)),
      ),
      save: true,
    });
  },
  addVotes(
    state,
    {
      timestamp,
      nominator,
      nominatorSeatInfo,
      nominee,
      nomineeSeatInfo,
      type,
      mode,
      votes,
      majority,
      votedPlayers,
      votedSeatInfos,
      save,
      day,
    },
  ) {
    // 重写时间
    const newTime = save ? timestamp : new Date(timestamp);
    state.voteHistory.push({
      timestamp: newTime,
      nominator,
      nominatorSeatInfo,
      nominee,
      nomineeSeatInfo,
      day,
      type,
      mode,
      votes,
      majority,
      votedPlayers,
      votedSeatInfos,
    });
  },
  setVoteHistory(state, { voteHistory = [], voteSelected = [] } = {}) {
    state.voteHistory = voteHistory.map((vote) => ({
      ...vote,
      day: vote.day || null,
      timestamp:
        vote.timestamp instanceof Date
          ? vote.timestamp
          : new Date(vote.timestamp),
    }));
    state.voteSelected = state.voteHistory.map((_, index) =>
      Boolean(voteSelected[index]),
    );
  },
  addVoteSelected(state, { selected, players, save }) {
    if (
      save &&
      !players &&
      (!state.nomination || state.lockedVote <= players.length)
    )
      return;
    state.voteSelected.push(selected);
  },
  setVoteSelected(state, { index, value }) {
    Vue.set(state.voteSelected, index, value);
  },
  clearVoteHistory(state, voteIndex = null) {
    if (voteIndex == null || voteIndex.length === 0) {
      state.voteHistory = [];
      state.voteSelected = [];
      return;
    } else {
      state.voteHistory = state.voteHistory.filter(
        (_, index) => !voteIndex.includes(index),
      );
      state.voteSelected = state.voteSelected.filter(
        (_, index) => !voteIndex.includes(index),
      );
    }
  },
  /**
   * Store a vote with and without syncing it to the live session.
   * This is necessary in order to prevent infinite voting loops.
   * @param state
   * @param vote
   */
  vote: handleVote,
  voteSync: handleVote,
  clearVotes(state) {
    state.votes = [];
  },
  lockVote(state, lock) {
    state.lockedVote = lock !== undefined ? lock : state.lockedVote + 1;
  },
  setPlayerAvatar(state, link) {
    state.playerAvatar = link || "";
    state.playerAvatarSource = "uploaded";
  },
  updatePlayerAvatar(state, link) {
    state.playerAvatar = link;
  },
  setIsRole(state, { role, property, value, st }) {
    if (!state.isRole[role]) return;
    if (property === "using" && !st) return; // using会请求说书人统一更改，说书人不会使用using属性
    state.isRole[role][property] = value;
  },
  startTimer(state, time) {
    clearInterval(state.interval);
    if (time) state.timer = time;
    state.isTimerRunning = true;
    state.startTime = Date.now();
    state.lastUpdateTime = Date.now(); // Initialize last update time

    state.interval = setInterval(() => {
      const now = Date.now();
      const elapsedSinceLastUpdate = now - state.lastUpdateTime;

      // Calculate how many full seconds have passed
      const secondsPassed = elapsedSinceLastUpdate / 1000;

      if (secondsPassed > 0) {
        state.timer -= secondsPassed; // Decrement by the actual seconds passed
        state.lastUpdateTime = now; // Update the last update time
      }

      if (state.timer <= 0) {
        state.timer = 0;
        state.isTimerRunning = false;
        clearInterval(state.interval);
      }
    }, 1000);
  },
  stopTimer(state) {
    clearInterval(state.interval);
    state.isTimerRunning = false;
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
