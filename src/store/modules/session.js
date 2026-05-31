/**
 * Handle a vote request.
 * If the vote is from a seat that is already locked, ignore it.
 * @param state session state
 * @param index seat of the player in the circle
 * @param vote true or false
 */

import Vue from "vue";
import { DEFAULT_PLAYER_AVATARS } from "../../playerAvatars";

const handleVote = (state, [index, vote]) => {
  if (state.isSpectator && !state.isStorytellerOnline) return;
  if (!state.nomination) return;
  state.votes = [...state.votes];
  state.votes[index] = vote === undefined ? 0 : vote;
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
  roomPassword: "",
  pendingJoinPassword: "",
  savedRoomPasswords: {},
  claimedSeat: -1,
  nomination: false,
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
  votingSpeed: 500,
  isVoteInProgress: false,
  isSecretVote: false,
  voteHistory: [],
  voteSelected: [],
  markedPlayer: -1,
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
  setStorytellerName: set("storytellerName"),
  setStId: set("stId"),
  setSpectator: set("isSpectator"),
  setStorytellerOnline: set("isStorytellerOnline"),
  setReconnecting: set("isReconnecting"),
  setPlayerCount: set("playerCount"),
  setPing: set("ping"),
  setPlayerVotes: set("playerVotes"),
  setVotingSpeed: set("votingSpeed"),
  setVoteInProgress: set("isVoteInProgress"),
  setMarkedPlayer(state, { val, force }) {
    if (!force && state.isSecretVote && val >= 0) return;
    state.markedPlayer = val;
  },
  setNomination: set("nomination"),
  setVoteHistoryAllowed: set("isVoteHistoryAllowed"),
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
      nominatedPlayer = null,
    } = {},
  ) {
    state.nomination = nomination || false;
    if (
      !!nomination &&
      !!nominatedPlayer &&
      state.isSecretVote &&
      nominatedPlayer.role.team != "traveler"
    ) {
      for (let i = 0; i < votes.length; i++) {
        if (i != state.claimedSeat) {
          votes[i] = false;
        }
      }
    }
    state.votes = votes || [];
    state.votingSpeed = votingSpeed || state.votingSpeed;
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
    if (!state.isVoteHistoryAllowed && state.isSpectator) return;
    if (!state.nomination || state.lockedVote <= players.length) return;
    const isExile = players[state.nomination[1]].role.team === "traveler";
    const votedPlayers = Array.from(players).filter(
      (player, index) => state.votes[index],
    );
    votedPlayers.forEach((player) => {
      player.seat = players.indexOf(player) + 1;
      player.votes = state.votes[players.indexOf(player)];
    });
    this.commit("session/addVotes", {
      timestamp: new Date(),
      nominator:
        (state.nomination[0] + 1).toString() +
        ". " +
        (players[state.nomination[0]].id
          ? players[state.nomination[0]].name
          : ""),
      nominee:
        (state.nomination[1] + 1).toString() +
        ". " +
        (players[state.nomination[1]].id
          ? players[state.nomination[1]].name
          : ""),
      type: isExile ? "流放" : "处决",
      mode: state.isSecretVote ? "闭眼" : "睁眼",
      votes: state.votes
        .filter((item) => typeof item === "number")
        .reduce((item, sum) => item + sum, 0),
      majority: Math.ceil(
        players.filter((player) => !player.isDead || isExile).length / 2,
      ),
      votedPlayers: votedPlayers.map(
        ({ seat, name, votes }) =>
          seat + ". " + name + (votes > 1 ? " *" + votes + "票" : ""),
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
    },
  ) {
    // 重写时间
    const newTime = save ? timestamp : new Date(timestamp);
    state.voteHistory.push({
      timestamp: newTime,
      nominator,
      nominee,
      type,
      mode,
      votes,
      majority,
      votedPlayers,
    });
  },
  addVoteSelected(state, { selected, players, save }) {
    if (save && !players && !state.isVoteHistoryAllowed && state.isSpectator)
      return;
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
