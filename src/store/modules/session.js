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
  createdAt: "",
  updatedAt: "",
  phaseIndexAtPush: 0,
  lastPhaseIndex: 0,
  nextOrder: 1,
  reviewFingerprint: "",
  initialRoles: [],
  bluffs: [],
  events: [],
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

const normalizeReviewDetails = (details = {}) => {
  const normalized = emptyReviewDetails();
  const source = details && typeof details === "object" ? details : {};
  normalized.version = Number(source.version) || 1;
  normalized.createdAt = String(source.createdAt || "");
  normalized.updatedAt = String(source.updatedAt || "");
  normalized.phaseIndexAtPush = Number(source.phaseIndexAtPush) || 0;
  normalized.lastPhaseIndex = Number(source.lastPhaseIndex) || 0;
  normalized.nextOrder = Number(source.nextOrder) || 1;
  normalized.reviewFingerprint = String(
    source.reviewFingerprint || source.contentHash || "",
  );
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
        ...event,
        phaseIndex: Number(event.phaseIndex) || 0,
        order: Number(event.order) || index + 1,
      }))
    : [];
  return normalized;
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
  isSecretVote: false,
  voteHistory: [],
  voteSelected: [],
  markedPlayer: -1,
  isStorytelling: false,
  initialRoleIds: [],
  grimoireHistory: emptyReviewDetails(),
  receivedReviewDetails: emptyReviewDetails(),
  hasUnreadReviewDetails: false,
  isVoteHistoryAllowed: true,
  isRolesDistributed: false,
  isTypesDistributed: false,
  isBluffsDistributed: false,
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
  addInitialRoleSnapshot(state, { seat, roleId = "" } = {}) {
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
      history.updatedAt = new Date().toISOString();
      state.grimoireHistory = history;
    }
  },
  initializeGrimoireHistory(
    state,
    { initialRoles = [], bluffs = [], phaseIndex = 0 } = {},
  ) {
    const timestamp = new Date().toISOString();
    state.grimoireHistory = normalizeReviewDetails({
      ...emptyReviewDetails(),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastPhaseIndex: Number(phaseIndex) || 0,
      initialRoles: normalizeReviewDetails({ initialRoles }).initialRoles,
      bluffs: normalizeReviewDetails({ bluffs }).bluffs,
    });
  },
  setGrimoireHistory(state, details = {}) {
    state.grimoireHistory = normalizeReviewDetails(details);
  },
  startReview(state) {
    if (!state.isSpectator && !state.isReview) {
      state.grimoireHistory = normalizeReviewDetails({
        ...state.grimoireHistory,
        reviewFingerprint: randomReviewFingerprint(),
        updatedAt: new Date().toISOString(),
      });
    }
    state.isReview = true;
  },
  appendGrimoireHistoryEvents(state, events = []) {
    if (!Array.isArray(events) || !events.length) return;
    const history = normalizeReviewDetails(state.grimoireHistory);
    const normalizedEvents = events.map((event = {}) => {
      const phaseIndex = Number(event.phaseIndex) || 0;
      const order = history.nextOrder++;
      history.lastPhaseIndex = Math.max(history.lastPhaseIndex, phaseIndex);
      return {
        ...event,
        phaseIndex,
        order,
        id: event.id || `${Date.now()}-${order}`,
      };
    });
    history.events = [...history.events, ...normalizedEvents];
    history.updatedAt = new Date().toISOString();
    state.grimoireHistory = history;
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
    state.grimoireHistory = history;
  },
  clearGrimoireHistory(state) {
    state.grimoireHistory = emptyReviewDetails();
  },
  receiveReviewDetails(state, details = {}) {
    const incomingDetails = normalizeReviewDetails(details);
    const currentDetails = normalizeReviewDetails(state.receivedReviewDetails);
    if (
      incomingDetails.reviewFingerprint &&
      incomingDetails.reviewFingerprint === currentDetails.reviewFingerprint
    )
      return;
    state.receivedReviewDetails = incomingDetails;
    state.hasUnreadReviewDetails = true;
  },
  setReceivedReviewDetails(state, details = {}) {
    state.receivedReviewDetails = normalizeReviewDetails(details);
  },
  clearReceivedReviewDetails(state) {
    state.receivedReviewDetails = emptyReviewDetails();
    state.hasUnreadReviewDetails = false;
  },
  markReviewDetailsRead(state) {
    state.hasUnreadReviewDetails = false;
  },
  startStorytelling(state, players = []) {
    state.initialRoleIds = Array.isArray(players)
      ? players.map((player, index) => ({
          seat: index + 1,
          roleId: String((player.role && player.role.id) || ""),
        }))
      : [];
    state.isStorytelling = true;
  },
  endStorytelling(state) {
    state.isStorytelling = false;
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
  distributeGrimoire(state, { val }) {
    state.isGrimoireDistributed = val;
  },
  clearDistributedPlayerInfo(state) {
    state.isRolesDistributed = false;
    state.isTypesDistributed = false;
    state.isBluffsDistributed = false;
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
      nominator:
        (nominatorIndex + 1).toString() +
        ". " +
        (nominator.id ? nominator.name : ""),
      nominee:
        (nomineeIndex + 1).toString() + ". " + (nominee.id ? nominee.name : ""),
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
      save: true,
    });
  },
  addVotes(
    state,
    {
      timestamp,
      nominator,
      nominee,
      type,
      mode,
      votes,
      majority,
      votedPlayers,
      save,
      day,
    },
  ) {
    // 重写时间
    const newTime = save ? timestamp : new Date(timestamp);
    state.voteHistory.push({
      timestamp: newTime,
      nominator,
      nominee,
      day,
      type,
      mode,
      votes,
      majority,
      votedPlayers,
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
  setPlayerAvatar(state) {
    state.playerAvatar = "";
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
