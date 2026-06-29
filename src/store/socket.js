const HOST_HEARTBEAT_INTERVAL = 5 * 60 * 1000;
const PLAYER_HEARTBEAT_INTERVAL = 10 * 1000;
const PHASE_COUNT = 4;
const PHASE_NIGHT = 0;
const PHASE_DAWN = 1;
const RATE_LIMITED_MESSAGE = "操作过于频繁，请稍后再试。";

const phaseOf = (phaseIndex) => {
  const index = Number.parseInt(phaseIndex, 10);
  return Number.isFinite(index) && index > 0 ? index % PHASE_COUNT : 0;
};

class LiveSession {
  constructor(store) {
    this._wss = `${window.location.protocol === "https:" ? "wss" : "ws"}://${
      window.location.host
    }/ws/`;
    this._socket = null;
    this._isSpectator = true;
    this._isAlive = true;
    this._gamestate = [];
    this._publishedDeathStates = [];
    this._pendingDeathUpdates = new Set();
    this._store = store;
    this._lastSentPhaseIndex = this._store.state.grimoire.phaseIndex;
    this._pingInterval = 3 * 1000; // 30 seconds between pings
    this._pingTimer = null;
    this._authTimer = null;
    this._hostHeartbeatTimer = null;
    this._passwordTimer = null;
    this._pendingJoinHasPassword = false;
    this._sendInterval = 1.5 * 1000; // 1.5 seconds between unsent message cycles
    this._sendTimer = null;
    this._reconnectTimer = null;
    this._closeShouldReset = new WeakMap();
    this._players = {}; // map of players connected to a session
    this._pings = {}; // map of player IDs to ping
    this._lastRateLimitedAlertAt = 0;
    // reconnect to previous session
    if (this._store.state.session.sessionId) {
      this.connect(this._store.state.session.sessionId);
    }
  }

  /**
   * Open a new session for the passed channel.
   * @param channel
   * @private
   */
  _open(channel) {
    this.disconnect(false);
    this._socket = new WebSocket(
      this._wss +
        channel +
        "/" +
        this._store.state.session.playerId +
        (!this._isSpectator ? "/host" : ""),
    );
    if (this._socket === null) {
      this._store.commit("session/setReconnecting", true);
      this._reconnectTimer = setTimeout(() => this.connect(channel), 3 * 1000);
      return;
    }
    this._socket.addEventListener("message", this._handleMessage.bind(this));
    this._socket.onopen = this._onOpen.bind(this);
    const socket = this._socket;
    this._socket.onclose = (err) => {
      const shouldReset = this._closeShouldReset.get(socket) === true;
      this._closeShouldReset.delete(socket);
      const isCurrentSocket = this._socket === socket;
      if (isCurrentSocket) {
        this._socket = null;
        clearTimeout(this._pingTimer);
        this._pingTimer = null;
        clearTimeout(this._authTimer);
        this._authTimer = null;
        this._stopHostHeartbeat();
      }
      if (err.code !== 1000) {
        if (err.code === 1008) {
          this._store.commit("session/setReconnecting", false);
          restoreStoredSession(this._store, this._store.$liveLobby, {
            notify: true,
          });
          return;
        }
        // connection interrupted, reconnect after 3 seconds
        this._store.commit("session/setReconnecting", true);
        this._reconnectTimer = setTimeout(
          () => this.connect(channel),
          3 * 1000,
        );
      } else if (shouldReset) {
        this._store.dispatch("resetRoomState");

        if (err.reason) {
          this.showInputModal({
            inputType: "alert",
            inputModal: "text",
            inputData: {
              name: [err.reason],
            },
          }).catch(() => {
            return null;
          });
        }
      }
    };
  }

  /**
   * Send a message through the socket.
   * @param command
   * @param params
   * @private
   */
  _send(command, params, feedback = false) {
    if (this._socket && this._socket.readyState === 1) {
      this._socket.send(JSON.stringify([command, params, feedback]));
    }
  }

  /**
   * Send a message directly to a single playerId, if provided.
   * Otherwise broadcast it.
   * @param playerId player ID or "host", optional
   * @param command
   * @param params
   * @private
   */
  _sendDirect(playerId, command, params, feedback = false) {
    if (playerId) {
      this._send("direct", { [playerId]: [command, params] }, feedback);
    } else {
      this._send(command, params, feedback);
    }
  }

  /**
   * Request some server side information.
   * @param playerId player ID or "host"
   * @param command
   * @param params
   * @private
   */
  _request(command, playerId, params, feedback = false) {
    this._send("request", { [command]: [playerId, params] }, feedback);
  }

  /**
   * Upload a file to the server (stored).
   * Currently only supports images for avatar pictures
   * @param playerId player ID or "host"
   * @param command
   * @param params
   * @private
   */
  _uploadFile(command, playerId, params, feedback = false) {
    if (playerId) {
      this._send("uploadFile", { [command]: [playerId, params] }, feedback);
    }
  }

  /**
   * Open event handler for socket.
   * @private
   */
  _onOpen() {
    clearTimeout(this._authTimer);
    this._send("sessionAuth", {
      playerSecret: this._store.state.session.playerSecret,
    });
    this._authTimer = setTimeout(() => {
      this._handleSessionAuthResult({ ok: false });
    }, 6000);
  }

  async _handleSessionAuthResult(result = {}) {
    clearTimeout(this._authTimer);
    this._authTimer = null;
    if (!result.ok) {
      this.disconnect(false);
      this._store.commit("session/setPlayerId", "");
      this._store.commit("session/setPlayerSecret", "");
      this._store.dispatch("resetRoomState");
      await this.showInputModal({
        inputType: "alert",
        inputModal: "text",
        inputData: {
          name: ["身份验证失败，请重新进入房间。"],
        },
      }).catch(() => {
        return null;
      });
      return;
    }

    if (this._isSpectator) {
      if (
        this._store.state.session.isJoinAllowed === true &&
        this._store.state.session.isStorytellerOnline
      ) {
        this.requestLatestRoomState();
      } else {
        this.checkAllowJoin(true);
      }
    } else {
      this.checkAllowHost();
    }
    this._ping();
  }

  /**
   * Send a ping message with player ID and ST flag.
   * @private
   */
  _ping() {
    this._handlePing();
    this._send("ping", [
      this._isSpectator
        ? this._store.state.session.playerId
        : Object.keys(this._players).length,
      "latency",
    ]);
    clearTimeout(this._pingTimer);
    this._pingTimer = setTimeout(this._ping.bind(this), this._pingInterval);
    // if (this._store.state.session.sessionId &&
    //   !this._isAlive && !this._store.state.session.isReconnecting
    // ) {
    //   this._isAlive = true;
    //   this.connect(this._store.state.session.sessionId);
    // }
    // this._isAlive = false;
  }

  _hostInfo() {
    return {
      name: this._store.state.session.playerName,
      playerCount: this._store.state.players.players.length,
      isStorytelling: this._store.state.session.isStorytelling,
      hasPassword: !!this._store.state.session.roomPassword,
    };
  }

  _isDeathUpdateHiddenPhase() {
    return phaseOf(this._store.state.grimoire.phaseIndex) === PHASE_NIGHT;
  }

  _ensurePublishedDeathStates() {
    const players = this._store.state.players.players;
    if (this._publishedDeathStates.length > players.length) {
      this._publishedDeathStates.length = players.length;
    }
    players.forEach((player, index) => {
      if (this._publishedDeathStates[index] === undefined) {
        this._publishedDeathStates[index] = !!player.isDead;
      }
    });
  }

  _publishCurrentDeathStates() {
    this._publishedDeathStates = this._store.state.players.players.map(
      (player) => !!player.isDead,
    );
    this._pendingDeathUpdates.clear();
  }

  _publishedDeathStateFor(player, index) {
    const publishedValue = this._publishedDeathStates[index];
    return publishedValue === undefined ? !!player.isDead : publishedValue;
  }

  _deferDeathUpdate(index) {
    this._ensurePublishedDeathStates();
    if (index >= 0) {
      this._pendingDeathUpdates.add(index);
    }
  }

  _publishDeathUpdate(index, value) {
    if (index < 0) return;
    this._publishedDeathStates[index] = !!value;
    this._pendingDeathUpdates.delete(index);
    this._send("player", {
      index,
      property: "isDead",
      value,
    });
  }

  _publishAllDeathStates() {
    if (this._isSpectator) return;
    const players = this._store.state.players.players;
    this._publishedDeathStates = players.map((player) => !!player.isDead);
    this._pendingDeathUpdates.clear();
    players.forEach((player, index) => {
      this._send("player", {
        index,
        property: "isDead",
        value: !!player.isDead,
      });
    });
  }

  sendHostHeartbeat() {
    if (this._isSpectator) return;
    this._send("hostHeartbeat", this._hostInfo());
  }

  _startHostHeartbeat() {
    if (this._isSpectator) return;
    this._stopHostHeartbeat();
    this.sendHostHeartbeat();
    this._hostHeartbeatTimer = setInterval(() => {
      this.sendHostHeartbeat();
    }, HOST_HEARTBEAT_INTERVAL);
  }

  _stopHostHeartbeat() {
    clearInterval(this._hostHeartbeatTimer);
    this._hostHeartbeatTimer = null;
  }

  /**
   * Handle an incoming socket message.
   * @param data
   * @private
   */
  _handleMessage({ data }) {
    let command, params;
    try {
      [command, params] = JSON.parse(data);
    } catch (err) {
      return;
    }
    switch (command) {
      case "alertPopup":
        this._alertPopup(params);
        break;
      case "presenceNotice":
        this._handlePresenceNotice(params);
        break;
      case "sessionAuthResult":
        this._handleSessionAuthResult(params);
        break;
      case "rateLimited":
        this._handleRateLimited();
        break;
      case "allowHost":
        this._handleAllowHost(params);
        break;
      case "allowJoin":
        this._handleAllowJoin(params);
        break;
      case "roomInfoRequest":
        this.sendHostHeartbeat();
        break;
      case "passwordCheck":
        this._handlePasswordCheck(params);
        break;
      case "passwordResult":
        this._handlePasswordResult(params);
        break;
      case "joinCheck":
        this._handleJoinCheck(params);
        break;
      case "joinResult":
        this._handleJoinResult(params);
        break;
      case "getGamestate":
        this.sendGamestate(params);
        break;
      case "getStId":
        this.sendStId(params);
        break;
      case "edition":
        this._updateEdition(params);
        break;
      case "states":
        this._updateStates(params);
        break;
      case "teamsNames":
        this._updateTeamsNames(params);
        break;
      case "firstNight":
        this._updateFirstNight(params);
        break;
      case "otherNight":
        this._updateOtherNight(params);
        break;
      case "fabled":
        this._updateFabled(params);
        break;
      case "syncPlayersStatus":
        this._handleSyncPlayerStatus(params);
        break;
      case "gs":
        this._updateGamestate(params);
        break;
      case "stId":
        this._updateStId(params);
        break;
      case "storytellerName":
        this._updateStorytellerName(params);
        break;
      case "storytellerOnline":
        this._updateStorytellerOnline(params);
        break;
      case "roomClosed":
        this._handleRoomClosed(params);
        break;
      case "heartbeatRejected":
      case "playerInvalid":
        this._handlePlayerInvalid(params);
        break;
      case "player":
        this._updatePlayer(params);
        break;
      case "bluff":
        this._updateBluff(params);
        break;
      case "grimoire":
        this._updateGrimoire(params);
        break;
      case "reviewDetailsFingerprint":
        this._handleReviewDetailsFingerprint(params);
        break;
      case "reviewDetails":
        this._updateReviewDetails(params);
        break;
      case "requestReviewDetails":
        if (!this._isSpectator) this.sendReviewDetails(params);
        break;
      case "clearPlayerInfo":
        this._clearPlayerInfo();
        break;
      case "claim":
        this._updateSeat(params);
        break;
      case "leaveSeat":
        this._updateLeaveSeat();
        break;
      case "ping":
        this._handlePing(params);
        break;
      case "pong":
        this._handlePong(params);
        break;
      case "nomination": {
        if (!this._isSpectator) return;
        const isPayloadObject =
          params && !Array.isArray(params) && typeof params === "object";
        const nominationPayload = isPayloadObject ? params.nomination : params;
        const nominationDay = isPayloadObject ? params.day : null;
        const isRecordedNomination = isPayloadObject && params.recorded;
        if (!nominationPayload && isRecordedNomination) {
          if (Array.isArray(params.voteHistory)) {
            this._store.commit("session/setVoteHistory", {
              voteHistory: params.voteHistory,
              voteSelected: params.voteSelected,
            });
          } else {
            // create vote history record
            this._store.commit(
              "session/addHistory",
              this._store.state.players.players,
            );
            this._store.commit("session/addVoteSelected", {
              selected: false,
              players: this._store.state.players.players,
              save: true,
            });
          }
        }
        this._store.commit("session/nomination", {
          nomination: nominationPayload,
          day: nominationDay,
        });
        break;
      }
      case "swap":
        if (!this._isSpectator) return;
        this._store.commit("players/swap", params);
        break;
      case "move":
        if (!this._isSpectator) return;
        this._store.commit("players/move", params);
        break;
      case "remove":
        if (!this._isSpectator) return;
        this._store.commit("players/remove", params);
        break;
      case "marked":
        if (!this._isSpectator) return;
        this._store.commit("session/setMarkedPlayer", params);
        break;
      case "isNight":
        if (!this._isSpectator) return;
        this._store.commit("toggleNight", params);
        break;
      case "phaseIndex":
        if (!this._isSpectator) return;
        this._store.commit("setPhaseIndex", params);
        break;
      case "isVoteHistoryAllowed":
        if (!this._isSpectator) return;
        this._store.commit("session/setVoteHistoryAllowed", params);
        break;
      case "votingSpeed":
        if (!this._isSpectator) return;
        this._store.commit("session/setVotingSpeed", params);
        break;
      case "clearVoteHistory":
        if (!this._isSpectator) return;
        this._store.commit("session/clearVoteHistory");
        break;
      case "nominationMarks":
        if (!this._isSpectator) return;
        this._store.commit("session/setNominationMarks", params);
        break;
      case "isVoteInProgress":
        if (!this._isSpectator) return;
        this._store.commit("session/setVoteInProgress", params);
        break;
      case "voteReadyState":
        this._updateVoteReadyState(params);
        break;
      case "voteReady":
        if (!this._isSpectator) {
          this._store.commit("session/voteReady", params);
        }
        break;
      case "voteReadyDismissed":
        if (!this._isSpectator) {
          this._store.commit("session/voteReadyDismissed", params);
        }
        break;
      case "vote":
        this._handleVote(params);
        break;
      case "votes":
        this._handleVotes(params);
        break;
      case "lock":
        this._handleLock(params);
        break;
      case "bye":
        this._handleBye(params);
        break;
      case "pronouns":
        this._updatePlayerPronouns(params);
        break;
      case "isRole":
        this._updateIsRole(params);
        break;
      case "usingRole":
        this._updateUsingRole(params);
        break;
      case "setTimer":
        this._handleSetTimer(params);
        break;
      case "startTimer":
        this._handleStartTimer(params);
        break;
      case "stopTimer":
        this._handleStopTimer(params);
        break;
      case "avatarReceived":
        this._avatarReceived(params);
        break;
      case "useDefaultAvatar":
        this._useDefaultAvatar();
        break;
      case "secretVote":
        this._handleSecretVote(params);
        break;
      case "bootlegger":
        this._handleSetBootlegger(params);
        break;
      case "useOldOrder":
        this._handleSetUseOldOrder(params);
        break;
      case "useOldRole":
        this._handleSetUseOldRole(params);
        break;
      case "isReview":
        this._handleSetIsReview(params);
        break;
    }
  }

  /**
   * Connect to a new live session, either as host or spectator.
   * Set a unique playerId if there isn't one yet.
   * @param channel
   */
  async connect(channel) {
    if (!Number(channel) || Number(channel) < 1 || Number(channel) > 999999) {
      this.disconnect();
      this._store.commit("session/setSessionId", "");
      await this._alertPopup("无效的房间号！");
      return;
    }
    if (
      !this._store.state.session.playerId ||
      !this._store.state.session.playerSecret
    ) {
      this.disconnect();
      this._store.commit("session/setSessionId", "");
      if (this._store.state.session.playerId) {
        this._store.commit("session/setPlayerId", "");
        this._store.commit("session/setPlayerSecret", "");
        await this._alertPopup("账户身份已过期，请重新进入房间。");
      } else {
        await this._alertPopup("请先输入昵称后再进入房间！");
      }
      return;
    }
    this._pings = {};
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._isSpectator = this._store.state.session.isSpectator;
    this._open(channel);
  }

  /**
   * Close the current session, if any.
   */
  disconnect(shouldReset = true) {
    this._pings = {};
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._store.commit("session/setReconnecting", false);
    this._stopHostHeartbeat();
    clearTimeout(this._pingTimer);
    this._pingTimer = null;
    clearTimeout(this._authTimer);
    this._authTimer = null;
    clearTimeout(this._reconnectTimer);
    clearTimeout(this._store.state.session.joinTimeout);
    clearTimeout(this._store.state.session.hostTimeout);
    clearTimeout(this._passwordTimer);
    this._passwordTimer = null;
    if (this._socket) {
      if (this._isSpectator && this._store.state.session.isLeavingRoom) {
        this._send("presenceLeave", {
          name: this._store.state.session.playerName,
        });
        this._sendDirect("host", "bye", this._store.state.session.playerId);
      } else if (this._store.state.session.isClosingRoom) {
        this._send("closeRoom");
      }
      this._closeShouldReset.set(this._socket, shouldReset);
      this._socket.close(1000);
      this._socket = null;
    }
    if (this._store.state.session.isClosingRoom) {
      this._store.commit("session/setClosingRoom", false);
    }
    if (this._store.state.session.isLeavingRoom) {
      this._store.commit("session/setLeavingRoom", false);
    }
    this._pendingJoinHasPassword = false;
  }

  /**
   * Alert any messages from the server
   */
  async _alertPopup(text) {
    await this.showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: [text],
      },
    }).catch(() => {
      return null;
    });
    return;
  }

  _handlePresenceNotice({ action, name } = {}) {
    const playerName = String(name || "玩家").trim() || "玩家";
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (action === "join") {
      this._store.commit("addNotification", {
        id,
        text: `${playerName}加入房间`,
      });
    } else if (action === "leave") {
      this._store.commit("addNotification", {
        id,
        text: `${playerName}退出房间`,
      });
    } else {
      return;
    }
    setTimeout(() => this._store.commit("removeNotification", id), 3500);
  }

  async showInputModal({ inputType, inputModal, inputData }) {
    return new Promise((resolve, reject) => {
      this._store.commit("session/setInputResolver", resolve);
      this._store.commit("session/setInputRejecter", reject);

      this._store.commit("session/setInputType", inputType);
      this._store.commit("session/setInputModal", inputModal);
      this._store.commit("session/setInputData", inputData);

      this._store.commit("toggleModal", "input");
    });
  }

  async _handleRateLimited() {
    const timestamp = Date.now();
    if (timestamp - this._lastRateLimitedAlertAt < 10 * 1000) return;
    this._lastRateLimitedAlertAt = timestamp;
    await this._alertPopup(RATE_LIMITED_MESSAGE);
  }

  async _showStorytellerOfflineModal() {
    const action = await this.showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: ["说书人暂时离开，稍后再试。"],
        actionLabel: "离开房间",
        action: "leaveRoom",
      },
    }).catch(() => {
      return null;
    });
    if (action === "leaveRoom") {
      this._store.commit("session/setLeavingRoom", true);
      this._store.dispatch("resetRoomState");
    }
  }

  /**
   * Send request to server to check if hosting channel is allowed (no existing hosts).
   */
  async checkAllowHost() {
    clearTimeout(this._store.state.session.hostTimeout);
    this._request(
      "checkAllowHost",
      this._store.state.session.playerId,
      this._hostInfo(),
    );
    this._store.state.session.hostTimeout = setTimeout(async () => {
      if (this._store.state.session.isHostAllowed === null) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["连接失败，请重新进入房间！"],
          },
        }).catch(() => {
          return null;
        });
        this._store.commit("session/setSessionId", "");
        this._store.commit("session/setSpectator", false);
      }
    }, 6000);
  }

  /**
   * @param allow indicator to if hosting the channel is allowed
   */
  async _handleAllowHost(allow) {
    clearTimeout(this._store.state.session.hostTimeout);
    this._store.state.session.hostTimeout = null;
    this._store.commit("session/setIsHostAllowed", allow ? allow : null);

    if (allow) {
      this._startHostHeartbeat();
      this.sendGamestate();
    } else {
      await this.showInputModal({
        inputType: "alert",
        inputModal: "text",
        inputData: {
          name: [
            `房间"${this._store.state.session.sessionId}"已经存在说书人！`,
          ],
        },
      }).catch(() => {
        return null;
      });
      this._store.commit("session/setSessionId", "");
      this._store.commit("session/setSpectator", false);
    }
  }

  /**
   * Send request to server to check if joining the channel is allowed (has a host).
   */
  checkAllowJoin(force = false) {
    if (!force && this._store.state.session.isJoinAllowed === true) return;
    clearTimeout(this._store.state.session.joinTimeout);
    this._request("checkAllowJoin", this._store.state.session.playerId);
    this._store.state.session.joinTimeout = setTimeout(async () => {
      if (this._store.state.session.isJoinAllowed === null) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["连接失败，请重新进入房间！"],
          },
        }).catch(() => {
          return null;
        });
        this._store.commit("session/setSessionId", "");
        this._store.commit("session/setSpectator", false);
      }
    }, 1000);
  }

  /**
   * @param allow indicator to if joining the session is allowed
   */
  async _handleAllowJoin(allow) {
    if (this._store.state.session.isJoinAllowed === true) return;
    clearInterval(this._store.state.session.joinTimeout);
    this._store.state.session.joinTimeout = null;
    const result =
      typeof allow === "object" && allow !== null
        ? allow
        : { allowed: !!allow, reason: allow ? "" : "missing" };
    this._store.commit(
      "session/setIsJoinAllowed",
      result.allowed ? true : null,
    );

    if (result.allowed) {
      this._pendingJoinHasPassword = !!result.hasPassword;
      this._store.commit("session/setStorytellerOnline", !!result.hostOnline);
      if (result.reason === "hostOffline") {
        await this._showStorytellerOfflineModal();
        return;
      }
      await this._requestJoinValidation(result.hasPassword);
    } else {
      if (result.reason === "hostOffline") {
        this._store.commit("session/setStorytellerOnline", false);
        await this._showStorytellerOfflineModal();
        return;
      }
      await this.showInputModal({
        inputType: "alert",
        inputModal: "text",
        inputData: {
          name: [
            result.reason === "hostOffline"
              ? "说书人暂时离开，稍后再试。"
              : `房间"${this._store.state.session.sessionId}"不存在！`,
          ],
        },
      }).catch(() => {
        return null;
      });
      this._store.commit("session/setSessionId", "");
      this._store.commit("session/setSpectator", false);
    }
  }

  async _requestJoinValidation(needsPassword) {
    const sessionId = this._store.state.session.sessionId;
    let password =
      this._store.state.session.pendingJoinPassword ||
      this._store.state.session.savedRoomPasswords[sessionId] ||
      "";
    if (needsPassword && !password) {
      const input = await this.showInputModal({
        inputType: "roomPassword",
        inputModal: "input",
        inputData: {
          name: ["请输入房间密码"],
          length: 1,
          placeholder: [""],
        },
      }).catch(() => {
        return null;
      });
      if (input === null) {
        this._store.commit("session/setSessionId", "");
        this._store.commit("session/setSpectator", false);
        return;
      }
      password = input[0] || "";
      this._store.commit("session/setPendingJoinPassword", password);
    }
    this._sendDirect("host", "joinCheck", {
      playerId: this._store.state.session.playerId,
      password,
    });
    clearTimeout(this._passwordTimer);
    this._passwordTimer = setTimeout(async () => {
      this._resetPendingJoin();
      await this._showStorytellerOfflineModal();
    }, 3000);
  }

  _handlePasswordCheck(params = {}) {
    this._handleJoinCheck(params);
  }

  _handleJoinCheck(params = {}) {
    if (this._isSpectator) return;
    const playerId = params.playerId;
    if (!playerId) return;
    const roomPassword = this._store.state.session.roomPassword || "";
    this._sendDirect(playerId, "joinResult", {
      allowed: !roomPassword || params.password === roomPassword,
      reason:
        roomPassword && params.password !== roomPassword ? "password" : "",
    });
  }

  async _handlePasswordResult(params = {}) {
    await this._handleJoinResult(params);
  }

  async _handleJoinResult(params = {}) {
    if (!this._isSpectator) return;
    clearTimeout(this._passwordTimer);
    this._passwordTimer = null;
    if (params.allowed) {
      const sessionId = this._store.state.session.sessionId;
      const password = this._store.state.session.pendingJoinPassword;
      if (this._pendingJoinHasPassword && password) {
        this._store.commit("session/setSavedRoomPassword", {
          sessionId,
          password,
        });
      }
      this._joinAllowedRoom();
      return;
    }
    const failedSessionId = this._store.state.session.sessionId;
    this._resetPendingJoin();
    await this.showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: [
          params.reason === "password" ? "房间密码错误！" : "无法加入房间。",
        ],
      },
    }).catch(() => {
      return null;
    });
    this._store.commit("session/setPendingJoinPassword", "");
    if (params.reason === "password") {
      await this._retryPasswordJoin(failedSessionId);
      return;
    }
  }

  _joinAllowedRoom() {
    this._store.commit("session/setPendingJoinPassword", "");
    this.requestLatestRoomState();
  }

  requestLatestRoomState() {
    if (!this._isSpectator) return;
    if (!this._socket || this._socket.readyState !== 1) return;
    if (!this._store.state.session.sessionId) return;
    if (this._store.state.session.isJoinAllowed !== true) return;
    if (!this._store.state.session.isStorytellerOnline) return;
    this._send("presenceJoin", {
      name: this._store.state.session.playerName,
    });
    this._sendDirect(
      "host",
      "getGamestate",
      this._store.state.session.playerId,
    );
    this._sendDirect("host", "getStId", this._store.state.session.playerId);
  }

  refreshSpectatorSession() {
    if (!this._isSpectator) return;
    if (!this._store.state.session.sessionId) return;
    if (this._store.state.session.isStorytellerOnline) {
      this.requestLatestRoomState();
    } else {
      this.checkAllowJoin(true);
    }
  }

  _resetPendingJoin() {
    this._store.commit("players/clear", true);
    this._store.commit("session/setSessionId", "");
    this._store.commit("session/setSpectator", false);
    this._store.commit("session/setStorytellerName", "");
    this._store.commit("session/setStorytellerOnline", false);
    this._store.commit("session/setIsJoinAllowed", null);
    this._pendingJoinHasPassword = false;
  }

  async _retryPasswordJoin(sessionId) {
    if (!sessionId) return;
    const input = await this.showInputModal({
      inputType: "roomPassword",
      inputModal: "input",
      inputData: {
        name: ["请输入房间密码"],
        length: 1,
        placeholder: [""],
      },
    }).catch(() => {
      return null;
    });
    if (input === null) return;
    this._store.commit("session/setPendingJoinPassword", input[0] || "");
    this._store.commit("session/clearVoteHistory", []);
    this._store.commit("session/setSpectator", true);
    this._store.commit("toggleGrimoire", false);
    this._store.commit("session/setSessionId", sessionId);
  }

  async _handleRoomClosed(params = {}) {
    this.disconnect(false);
    this._store.dispatch("resetRoomState");
    await this.showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: [params.reason || "房间已被说书人解散。"],
      },
    }).catch(() => {
      return null;
    });
  }

  async _handlePlayerInvalid(params = {}) {
    this.disconnect(false);
    this._store.commit("session/setPlayerId", "");
    this._store.commit("session/setPlayerSecret", "");
    this._store.dispatch("resetRoomState");
    await this.showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: [params.reason || "账户不存在，请重新进入房间。"],
      },
    }).catch(() => {
      return null;
    });
  }

  /**
   * Publish the current gamestate.
   * Optional param to reduce traffic. (send only player data)
   * @param playerId
   * @param isLightweight
   */
  sendGamestate(playerId = "", isLightweight = false) {
    if (this._isSpectator) return;
    if (this._isDeathUpdateHiddenPhase()) {
      this._ensurePublishedDeathStates();
    } else {
      this._publishCurrentDeathStates();
    }
    this._gamestate = this._store.state.players.players.map(
      (player, index) => ({
        name: player.name,
        id: player.id,
        image: player.image,
        stReminders: this._store.state.session.isReview
          ? player.stReminders
          : [],
        isDead: this._publishedDeathStateFor(player, index),
        isVoteless: player.isVoteless,
        votes: player.votes,
        pronouns: player.pronouns,
        ...(player.role && player.role.team === "traveler"
          ? { roleId: player.role.id }
          : {}),
      }),
    );
    if (isLightweight) {
      this._sendDirect(playerId, "gs", {
        gamestate: this._gamestate,
        isLightweight,
      });
    } else {
      const { session, grimoire, states, teamsNames, firstNight, otherNight } =
        this._store.state;
      const { fabled } = this._store.state.players;
      this.sendEdition(playerId);
      const nominee = session.nomination
        ? this._store.state.players.players[session.nomination[1]]
        : null;
      const shouldHideSecretVotes =
        session.isSecretVote &&
        session.isVoteInProgress &&
        nominee &&
        nominee.role.team !== "traveler";
      const claimedSeat = playerId
        ? this._store.state.players.players.findIndex(
            (player) => player.id === playerId,
          )
        : -1;
      let votes = session.nomination ? Array.from(session.votes) : []; // 闭眼投票过程中只发送各玩家自己的真实投票情况
      if (shouldHideSecretVotes && playerId === "") {
        votes = [];
      } else if (shouldHideSecretVotes && votes.length > 0) {
        const playerIndex = this._store.state.players.players.findIndex(
          (player) => player.id === playerId,
        );
        for (let i = 0; i < votes.length; i++) {
          // 如果不与playerIndex相同则调整至不投票状态，显示层会用问号盖住
          if (i != playerIndex && votes[i] === true) votes[i] = false;
        }
      }
      this._sendDirect(playerId, "gs", {
        gamestate: this._gamestate,
        phaseIndex: grimoire.phaseIndex,
        isNight: grimoire.isNight,
        storytellerName: session.playerName,
        isStorytellerOnline: true,
        isVoteHistoryAllowed: session.isVoteHistoryAllowed,
        isSecretVote: session.isSecretVote,
        isUseOldOrder: session.isUseOldOrder,
        isUseOldRole: session.isUseOldRole,
        isStorytelling: session.isStorytelling,
        initialRoleIds: session.initialRoleIds,
        isReview: session.isReview,
        nomination: session.nomination,
        nominationDay: session.nominationDay,
        nominationMarks: {
          nominatorsByDay: session.nominationNominatorsByDay,
          nomineesByDay: session.nominationNomineesByDay,
        },
        votingSpeed: session.votingSpeed,
        lockedVote: session.lockedVote,
        isVoteInProgress: session.isVoteInProgress,
        voteReadyStatus: session.voteReadyStatus,
        voteReadyEligibleSeats: session.voteReadyEligibleSeats,
        voteReadySeats: session.voteReadySeats,
        voteReadyDismissedSeats: session.voteReadyDismissedSeats,
        markedPlayer: session.isSecretVote ? session.markedPlayer : -1,
        timer: session.timer,
        isTimerRunning: session.isTimerRunning,
        voteHistory: session.voteHistory.map((vote) => ({
          ...vote,
          timestamp:
            vote.timestamp instanceof Date
              ? vote.timestamp.toISOString()
              : vote.timestamp,
        })),
        voteSelected: session.voteSelected,
        ...(playerId ? { claimedSeat } : {}),
        fabled,
        states,
        teamsNames,
        firstNight,
        otherNight,
        ...(session.nomination ? { votes } : {}),
      });
    }

    if (this._store.state.session.isReview) {
      this.distributeGrimoire(playerId ? { playerId } : { all: true });
      this.sendReviewDetails(playerId);
    }

    // 场内玩家更新
    const playerIndex = !playerId
      ? -1
      : this._store.state.players.players.findIndex(
          (player) => player.id === playerId,
        );
    if (!playerId || playerIndex > -1) {
      const selectedPlayers = !playerId
        ? this._store.state.players.players.filter((player) => !!player.id)
        : [this._store.state.players.players[playerIndex]];

      selectedPlayers.forEach((player) => {
        this._sendDirect(player.id, "syncPlayersStatus", {
          isSecretVoteless: player.isSecretVoteless,
          isWraith: player.isWraith,
          isUsingWraith: player.isUsingWraith,
        });
      });
    }
  }

  _voteHistoryPayload() {
    const { voteHistory, voteSelected } = this._store.state.session;
    return {
      voteHistory: voteHistory.map((vote) => ({
        ...vote,
        timestamp:
          vote.timestamp instanceof Date
            ? vote.timestamp.toISOString()
            : vote.timestamp,
      })),
      voteSelected,
    };
  }

  /**
   * Update the gamestate based on incoming data.
   * @param data
   * @private
   */
  _updateGamestate(data) {
    if (!this._isSpectator) return;
    const {
      gamestate,
      isLightweight,
      phaseIndex,
      isNight,
      storytellerName,
      isStorytellerOnline,
      isVoteHistoryAllowed,
      isSecretVote,
      isUseOldOrder,
      isUseOldRole,
      isStorytelling,
      initialRoleIds,
      isReview,
      nomination,
      nominationDay,
      nominationMarks,
      votingSpeed,
      votes,
      lockedVote,
      isVoteInProgress,
      voteReadyStatus,
      voteReadyEligibleSeats,
      voteReadySeats,
      voteReadyDismissedSeats,
      markedPlayer,
      timer,
      isTimerRunning,
      voteHistory,
      voteSelected,
      claimedSeat,
      fabled,
      states,
      teamsNames,
      firstNight,
      otherNight,
    } = data;
    const players = this._store.state.players.players;
    // adjust number of players
    if (players.length < gamestate.length) {
      for (let x = players.length; x < gamestate.length; x++) {
        this._store.commit("players/add", { name: gamestate[x].name });
      }
    } else if (players.length > gamestate.length) {
      for (let x = players.length; x > gamestate.length; x--) {
        this._store.commit("players/remove", x - 1);
      }
    }
    // update status for each player
    gamestate.forEach((state, x) => {
      const player = players[x];
      const { roleId } = state;
      // update relevant properties
      [
        "name",
        "id",
        "image",
        "stReminders",
        "isDead",
        "isSecretVoteless",
        "isVoteless",
        "pronouns",
        "votes",
      ].forEach((property) => {
        const value = state[property];
        if (player[property] !== value) {
          if (property === "isVoteless") {
            if (value || !player.isSecretVoteless)
              this._store.commit("players/update", { player, property, value });
          } else {
            this._store.commit("players/update", { player, property, value });
          }
        }
      });
      // roles are special, because of travelers
      if (roleId && player.role.id !== roleId) {
        const role =
          this._store.state.roles.get(roleId) ||
          this._store.getters.rolesJSONbyId.get(roleId);
        if (role) {
          this._store.commit("players/update", {
            player,
            property: "role",
            value: role,
          });
        }
      } else if (!roleId && player.role.team === "traveler") {
        this._store.commit("players/update", {
          player,
          property: "role",
          value: {},
        });
      }
    });
    if (!isLightweight) {
      if (storytellerName !== undefined) {
        this._store.commit("session/setStorytellerName", storytellerName);
      }
      if (isStorytellerOnline !== undefined) {
        this._store.commit("session/setStorytellerOnline", isStorytellerOnline);
      }
      if (phaseIndex !== undefined) {
        this._store.commit("setPhaseIndex", phaseIndex);
      } else {
        this._store.commit("toggleNight", !!isNight);
      }
      this._store.commit("session/setVoteHistoryAllowed", isVoteHistoryAllowed);
      this._store.commit("session/setSecretVote", isSecretVote);
      this._store.commit("session/setUseOldOrder", isUseOldOrder);
      this._store.commit("session/setUseOldRole", isUseOldRole);
      this._store.commit("session/setStorytelling", isStorytelling);
      this._store.commit("session/setInitialRoleIds", initialRoleIds);
      this._store.commit("session/setIsReview", isReview);
      const nominatedPlayer =
        Array.isArray(nomination) && nomination.length
          ? players[nomination[1]]
          : null;
      this._store.commit("session/nomination", {
        nomination,
        votes,
        votingSpeed,
        lockedVote,
        isVoteInProgress,
        day: nominationDay,
        nominatedPlayer,
      });
      if (voteReadyStatus !== undefined) {
        this._store.commit("session/setVoteReadyState", {
          status: voteReadyStatus,
          eligibleSeats: voteReadyEligibleSeats,
          readySeats: voteReadySeats,
          dismissedSeats: voteReadyDismissedSeats,
        });
      }
      if (nominationMarks !== undefined) {
        this._store.commit("session/setNominationMarks", nominationMarks);
      }
      this._store.commit("session/setMarkedPlayer", {
        val: markedPlayer,
        force: false,
      });
      if (voteHistory !== undefined) {
        this._store.commit("session/setVoteHistory", {
          voteHistory,
          voteSelected,
        });
      }
      if (timer !== undefined) {
        if (isTimerRunning) {
          this._store.commit("session/startTimer", timer);
        } else {
          this._store.commit("session/stopTimer");
          this._store.commit("session/setTimer", timer);
        }
      }
      this._store.commit(
        "session/claimSeat",
        claimedSeat !== undefined
          ? claimedSeat
          : players.findIndex(
              (player) => player.id === this._store.state.session.playerId,
            ),
      );
      this._store.commit("players/setFabled", { fabled });
      this._store.commit("setStates", states);
      this._store.commit("setTeamsNames", teamsNames);
      this._store.commit("setFirstNight", firstNight);
      this._store.commit("setOtherNight", otherNight);
    }
  }

  sendStId(playerId = "") {
    if (this._isSpectator) return;
    this._sendDirect(playerId, "stId", this._store.state.session.playerId);
  }

  _updateStId(data) {
    if (!this._isSpectator) return;
    // this._store.state.session.stId = data;
    this._store.commit("session/setStId", data);
  }

  sendStorytellerName() {
    if (this._isSpectator) return;
    this._send("storytellerName", this._store.state.session.playerName);
  }

  _updateStorytellerName(name) {
    if (!this._isSpectator) return;
    this._store.commit("session/setStorytellerName", name || "");
    this._store.commit("players/setStorytellerFabled", { name: name || "" });
  }

  _updateStorytellerOnline(isOnline) {
    if (!this._isSpectator) return;
    this._store.commit("session/setStorytellerOnline", !!isOnline);
    if (
      isOnline &&
      this._store.state.session.sessionId &&
      this._store.state.session.isJoinAllowed === true
    ) {
      this._requestJoinValidation(this._pendingJoinHasPassword);
    }
  }

  /**
   * Publish an edition update. ST only
   * @param playerId
   */
  sendEdition(playerId = "") {
    if (this._isSpectator) return;
    const { edition } = this._store.state;
    let roles;
    if (!edition.isOfficial) {
      roles = this._store.getters.customRolesStripped;
    }
    this._sendDirect(playerId, "edition", {
      edition: edition.isOfficial ? { id: edition.id } : edition,
      ...(roles ? { roles } : {}),
    });
  }

  /**
   * Update edition and roles for custom editions.
   * @param edition
   * @param roles
   * @private
   */
  async _updateEdition({ edition, roles }) {
    if (!this._isSpectator) return;
    this._store.commit("setEdition", edition);
    if (roles) {
      this._store.commit("setCustomRoles", roles);
      if (this._store.state.roles.size !== roles.length) {
        const missing = [];
        roles.forEach(({ id }) => {
          if (!this._store.state.roles.get(id)) {
            missing.push(id);
          }
        });
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: [
              `此剧本中有未收录的角色。` +
                `请先加载这些角色！` +
                `这些角色包含：${missing.join("，")}`,
            ],
          },
        }).catch(() => {
          return null;
        });
        this.disconnect();
        this._store.commit("toggleModal", "edition");
      }
    }
  }

  /**
   * Publish a states update. ST only
   * @param playerId
   */
  sendStates(playerId = "") {
    if (this._isSpectator) return;
    const { states } = this._store.state;
    this._sendDirect(playerId, "states", states);
  }

  /**
   * Update states for custom editions.
   * @param states
   * @private
   */
  _updateStates(states) {
    if (!this._isSpectator) return;
    this._store.commit("setStates", states);
  }

  /**
   * Publish a teams alias update. ST only
   * @param playerId
   */
  sendTeamsNames(playerId = "") {
    if (this._isSpectator) return;
    const { teamsNames } = this._store.state;
    this._sendDirect(playerId, "teamsNames", teamsNames);
  }

  /**
   * Update teamsNames for custom editions.
   * @param teamsNames
   * @private
   */
  _updateTeamsNames(teamsNames) {
    if (!this._isSpectator) return;
    this._store.commit("setTeamsNames", teamsNames);
  }

  /**
   * Publish a firstNight update. ST only
   * @param playerId
   */
  sendFirstNight(playerId = "") {
    if (this._isSpectator) return;
    const { firstNight } = this._store.state;
    this._sendDirect(playerId, "firstNight", firstNight);
  }

  /**
   * Update firstNight.
   * @param firstNight
   * @private
   */
  _updateFirstNight(firstNight) {
    if (!this._isSpectator) return;
    this._store.commit("setFirstNight", firstNight);
  }

  /**
   * Publish an otherNight update. ST only
   * @param playerId
   */
  sendOtherNight(playerId = "") {
    if (this._isSpectator) return;
    const { otherNight } = this._store.state;
    this._sendDirect(playerId, "otherNight", otherNight);
  }

  /**
   * Update otherNight.
   * @param otherNight
   * @private
   */
  _updateOtherNight(otherNight) {
    if (!this._isSpectator) return;
    this._store.commit("setOtherNight", otherNight);
  }

  /**
   * Publish a fabled update. ST only
   */
  sendFabled() {
    if (this._isSpectator) return;
    const { fabled } = this._store.state.players;
    this._send("fabled", fabled);
  }

  /**
   * Update fabled roles.
   * @param fabled
   * @private
   */
  _updateFabled(fabled) {
    if (!this._isSpectator) return;
    this._store.commit("players/setFabled", {
      fabled,
    });
  }

  /**
   * Publish a player update.
   * @param player
   * @param property
   * @param value
   */
  sendPlayer({ player, property, value }) {
    if (
      this._isSpectator ||
      property === "reminders" ||
      (property === "stReminders" && !this._store.state.session.isReview)
    )
      return;
    const index = this._store.state.players.players.indexOf(player);
    const staticProperties = ["isAllowRole"];
    if (property === "role") {
      if (
        this._store.state.session.isReview ||
        (value.team && value.team === "traveler")
      ) {
        // update local gamestate to remember this player as a traveler
        if (value.team && value.team === "traveler" && this._gamestate[index])
          this._gamestate[index].roleId = value.id;
        this._send("player", {
          index,
          property,
          value: value.id,
        });
        if (
          this._store.state.session.isReview &&
          value.team != "traveler" &&
          this._gamestate[index] &&
          this._gamestate[index].roleId
        )
          delete this._gamestate[index].roleId;
      } else if (this._gamestate[index] && this._gamestate[index].roleId) {
        // player was previously a traveler
        delete this._gamestate[index].roleId;
        this._send("player", { index, property, value: "" });
      }
    } else if (property === "isSecretVoteless") {
      this._sendDirect(player.id, "player", { index, property, value });
    } else if (property === "isWraith") {
      this._sendDirect(player.id, "isRole", {
        role: "wraith",
        property: "active",
        value,
      });
    } else if (property === "isUsingWraith") {
      this._sendDirect(player.id, "isRole", {
        role: "wraith",
        property: "using",
        value,
        st: true,
      });
    } else if (property === "isDead") {
      if (this._isDeathUpdateHiddenPhase()) {
        this._deferDeathUpdate(index);
      } else {
        this._publishDeathUpdate(index, value);
      }
    } else if (!staticProperties.includes(property)) {
      this._send("player", { index, property, value });
    }
  }

  /**
   * Update a player based on incoming data. Player only.
   * @param index
   * @param property
   * @param value
   * @private
   */
  _updatePlayer({ index, property, value }) {
    if (!this._isSpectator) return;
    const player = this._store.state.players.players[index];
    if (!player) return;
    // special case where a player stops being a traveler
    if (property === "role") {
      if (!value && player.role.team === "traveler") {
        // reset to an unknown role
        this._store.commit("players/update", {
          player,
          property: "role",
          value: {},
        });
      } else {
        // load role, first from session, the global, then fail gracefully
        const role =
          this._store.state.roles.get(value) ||
          this._store.getters.rolesJSONbyId.get(value) ||
          {};
        this._store.commit("players/update", {
          player,
          property: "role",
          value: role,
        });
      }
    } else if (property === "isSecretVoteless") {
      // if (value === true) {
      this._store.commit("players/update", { player, property, value });
      // 如果是玩家则同时移除投票标记
      if (player.id === this._store.state.session.playerId && value) {
        this._store.commit("players/update", {
          player,
          property: "isVoteless",
          value,
        });
      }
      // }
    } else if (property === "isVoteless") {
      if (!player.isSecretVoteless || value)
        this._store.commit("players/update", { player, property, value });
    } else {
      // just update the player otherwise
      this._store.commit("players/update", { player, property, value });
      if (
        property === "name" &&
        player.id === this._store.state.session.playerId
      ) {
        this._store.commit("session/setPlayerName", value);
        this._send("presenceUpdate", { name: value });
      }
    }
  }

  emptyPlayer({ id }) {
    if (id === "") return; //必须指定玩家
    this._sendDirect(id, "leaveSeat");
  }

  _updateLeaveSeat() {
    this._store.state.session.claimedSeat = -1;
  }

  /**
   * Publish a player pronouns update
   * @param player
   * @param value
   * @param isFromSockets
   */
  sendPlayerPronouns({ player, value, isFromSockets }) {
    //send pronoun only for the seated player or storyteller
    //Do not re-send pronoun data for an update that was recieved from the sockets layer
    if (
      isFromSockets ||
      (this._isSpectator && this._store.state.session.playerId !== player.id)
    )
      return;
    const index = this._store.state.players.players.indexOf(player);
    this._send("pronouns", [index, value]);
  }

  /**
   * Update a pronouns based on incoming data.
   * @param index
   * @param value
   * @private
   */
  _updatePlayerPronouns([index, value]) {
    const player = this._store.state.players.players[index];

    this._store.commit("players/update", {
      player,
      property: "pronouns",
      value,
      isFromSockets: true,
    });
  }

  /**
   * Update a role using status, player only.
   * @param role role to be updated
   * @param property property in the role set to be
   * @param value value to be updated
   */
  setIsRole({ role, property, value, st }) {
    if (st === true) return;
    if (!this._isSpectator) return;
    if (property !== "using") return;
    if (!this._store.state.session.isRole[role]) return;
    this._sendDirect("host", "usingRole", {
      role,
      value,
      playerId: this._store.state.session.playerId,
    });
  }

  /**
   * Update a role status.
   * @param role role to be updated
   * @param property property in the role set to be updated
   * @param value value to be updated
   */
  _updateIsRole({ role, property, value, st }) {
    if (!this._isSpectator && property !== "using") return;
    if (this._isSpectator && property === "using" && !st) return;
    this._store.commit("session/setIsRole", { role, property, value, st });
  }

  /**
   * Update a role status.
   * @param role role to be updated
   * @param property property in the role set to be updated
   * @param value value to be updated
   */
  _updateUsingRole({ role, value, playerId }) {
    if (this._isSpectator) return;
    const index = this._store.state.players.players.findIndex(
      (player) => player.id === playerId,
    );
    if (index === -1) return;
    const player = this._store.state.players.players[index];
    if (role === "wraith") {
      if (player.isWraith) {
        this._store.commit("players/update", {
          player,
          property: "isUsingWraith",
          value,
        });
      } else {
        this._store.commit("players/update", {
          player,
          property: "isWraith",
          value: false,
        });
        this._store.commit("players/update", {
          player,
          property: "isUsingWraith",
          value: false,
        });
      }
    }
  }

  /**
   * Upload avatar image to the server and create a link.
   * @param image
   */
  uploadAvatar(image) {
    this._uploadFile("uploadAvatar", this._store.state.session.playerId, image);
  }

  clearUploadedAvatar(playerId = this._store.state.session.playerId) {
    if (!playerId) return;
    this._uploadFile("deleteAvatar", playerId, "");
  }

  /**
   * Confirmation on receiving the uploaded image.
   * @param image
   */
  async _avatarReceived(link) {
    const playerId = this._store.state.session.playerId;
    const linkId = link.split(".")[0];
    if (playerId != linkId) return;

    this._store.commit("session/setPlayerAvatarSource", "uploaded");
    this._store.commit("session/updatePlayerAvatar", link);
    if (
      this._isSpectator &&
      this._store.state.session.claimedSeat > -1 &&
      this._store.state.players.players[this._store.state.session.claimedSeat]
    ) {
      this._store.commit("players/update", {
        player:
          this._store.state.players.players[
            this._store.state.session.claimedSeat
          ],
        property: "image",
        value: link,
      });
      this._store.commit(
        "session/claimSeat",
        this._store.state.session.claimedSeat,
      );
    }
    await this.showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: ["头像上传成功！"],
      },
    }).catch(() => {
      return null;
    });
    return;
  }

  requestDefaultAvatar(player) {
    if (this._isSpectator) return;
    if (!player || !player.id || player.id === "host") return;
    this.clearUploadedAvatar(player.id);
    this._sendDirect(player.id, "useDefaultAvatar");
  }

  async _useDefaultAvatar() {
    if (!this._isSpectator) return;
    this.clearUploadedAvatar();
    this._store.commit("session/setPlayerAvatarSource", "default");
    await this._store.dispatch("refreshDefaultPlayerAvatar");
  }

  /**
   * Handle a ping message by another player / storyteller
   * @param playerIdOrCount
   * @param latency
   * @private
   */
  _handlePing([playerIdOrCount = 0, latency] = []) {
    const now = new Date().getTime();
    // if (!this._players.length) return;
    if (!this._isSpectator) {
      // store new player data
      if (playerIdOrCount) {
        this._players[playerIdOrCount] = now;
        const ping = parseInt(latency, 10);
        if (ping && ping > 0 && ping < 30 * 1000) {
          // ping to Players
          this._pings[playerIdOrCount] = ping;
          const pings = Object.values(this._pings);
          this._store.commit(
            "session/setPing",
            Math.round(pings.reduce((a, b) => a + b, 0) / pings.length),
          );
        }
      }
    } else if (latency) {
      // ping to ST
      this._store.commit("session/setPing", parseInt(latency, 10));
    }
    // update player count
    if (!this._isSpectator || playerIdOrCount) {
      this._store.commit(
        "session/setPlayerCount",
        this._isSpectator ? playerIdOrCount : Object.keys(this._players).length,
      );
    }
  }

  _handlePong() {
    this._isAlive = true;
  }

  /**
   * Handle a player leaving the sessions. ST only
   * @param playerId
   * @private
   */
  _handleBye(playerId) {
    if (this._isSpectator) return;
    delete this._players[playerId];
    this._store.commit(
      "session/setPlayerCount",
      Object.keys(this._players).length,
    );
  }

  /**
   * Claim a seat, needs to be confirmed by the Storyteller.
   * Seats already occupied can't be claimed.
   * @param seat either -1 to vacate or the index of the seat claimed
   */
  claimSeat(seat) {
    if (!this._isSpectator) return;
    if (!this._store.state.session.isStorytellerOnline) return;
    const players = this._store.state.players.players;
    if (
      players.length > seat &&
      (seat < 0 ||
        !players[seat].id ||
        players[seat].id === this._store.state.session.playerId)
    ) {
      // this._send("claim", [seat, this._store.state.session.playerId, this._store.state.session.playerName, this._store.state.session.playerAvatar]);
      this._sendDirect("host", "claim", [
        seat,
        this._store.state.session.playerId,
        this._store.state.session.playerName,
        this._store.state.session.playerAvatar,
      ]);
    }
  }

  /**
   * Update a player id associated with that seat.
   * @param index seat index or -1
   * @param value playerId to add / remove
   * @private
   */
  _updateSeat([index, value, name, image]) {
    // index is the seat number, value is the playerId, name is the playerName
    if (this._isSpectator) return;
    // const property = "id";
    const players = this._store.state.players.players;
    if (index >= 0 && players[index].id && players[index].id !== value) return;
    // remove previous seat
    const oldIndex = players.findIndex(({ id }) => id === value);
    const existingSeatPlayer = oldIndex >= 0 ? players[oldIndex] : null;
    const isSameSeatRefresh = oldIndex >= 0 && oldIndex === index;
    const seatName =
      existingSeatPlayer && !(isSameSeatRefresh && name !== undefined)
        ? existingSeatPlayer.name
        : name;
    const seatImage =
      existingSeatPlayer && !(isSameSeatRefresh && image !== undefined)
        ? existingSeatPlayer.image
        : image;
    if (oldIndex >= 0 && oldIndex !== index) {
      this._store.commit("players/update", {
        player: players[oldIndex],
        property: "id",
        value: "",
      });
      this._store.commit("players/update", {
        player: players[oldIndex],
        property: "name",
        value: "",
      });
      this._store.commit("players/update", {
        player: players[oldIndex],
        property: "image",
        value: "",
      });
      if (players[oldIndex].isWraith === true) {
        this._store.commit("players/update", {
          player: players[oldIndex],
          property: "isWraith",
          value: false,
        });
      }
      if (players[oldIndex].isUsingWraith === true) {
        this._store.commit("players/update", {
          player: players[oldIndex],
          property: "isUsingWraith",
          value: false,
        });
      }
      if (players[oldIndex].isAllowRole === false) {
        this._store.commit("players/update", {
          player: players[oldIndex],
          property: "isAllowRole",
          value: true,
        });
      }
    }
    // add playerId to new seat
    if (index >= 0) {
      const player = players[index];
      if (!player) return;
      this._store.commit("players/update", {
        player,
        property: "image",
        value: seatImage,
      });
      this._store.commit("players/update", {
        player,
        property: "name",
        value: seatName,
      });
      this._store.commit("players/update", { player, property: "id", value });
    }
    // update player session list as if this was a ping
    this._handlePing([true, value, 0]);
  }

  /**
   * Distribute player roles to all seated players in a direct message.
   * This will be split server side so that each player only receives their own (sub)message.
   */
  distributeRoles() {
    if (this._isSpectator) return;
    const message = {};
    this._store.state.players.players.forEach((player, index) => {
      if (player.id && player.role) {
        message[player.id] = [
          "player",
          { index, property: "role", value: player.role.id },
        ];
      }
    });
    if (Object.keys(message).length) {
      this._send("direct", message);
    }
  }

  /**
   * Distribute player types to all seated players in a direct message.
   * This will be split server side so that each player only receives their own (sub)message.
   */
  distributeTypes() {
    if (this._isSpectator) return;
    const message = {};
    this._store.state.players.players.forEach((player, index) => {
      if (player.id && player.role) {
        message[player.id] = [
          "player",
          {
            index,
            property: "role",
            value:
              player.role.team === "traveler"
                ? player.role.id
                : player.role.team + "s",
          }, //角色类型图标均有s后缀
        ];
      }
    });
    if (Object.keys(message).length) {
      this._send("direct", message);
    }
  }

  _roleTypeValue(role = {}) {
    return role.team === "traveler" ? role.id : role.team + "s";
  }

  distributeSeatTypeInfo({ sourceIndex, targetSeat } = {}) {
    if (this._isSpectator) return;
    const source = this._store.state.players.players[sourceIndex];
    const targetIndex = Number(targetSeat) - 1;
    const target = this._store.state.players.players[targetIndex];
    if (!source || !source.role || !source.role.team) return;
    if (!target || !target.id || target.id === "host") return;

    this._sendDirect(target.id, "player", {
      index: sourceIndex,
      property: "role",
      value: this._roleTypeValue(source.role),
    });
  }

  /**
   * Distribute evil team type information without revealing specific roles.
   * @param mode "demonsToMinions", "minionsToDemons", or "both"
   */
  distributeEvilInfo({ mode } = {}) {
    if (this._isSpectator) return;
    if (!mode) return;

    const players = this._store.state.players.players;
    const sendTypeInfo = (
      recipientTeam,
      revealedTeam,
      { excludeRecipient = false } = {},
    ) => {
      const recipients = players
        .map((player, index) => ({ player, index }))
        .filter(
          ({ player }) =>
            player.id && player.role && player.role.team === recipientTeam,
        );
      const revealedPlayers = players
        .map((player, index) => ({ player, index }))
        .filter(
          ({ player }) =>
            player.role && player.role.team === revealedTeam,
        );
      if (!recipients.length || !revealedPlayers.length) return;

      recipients.forEach(({ player: recipient, index: recipientIndex }) => {
        revealedPlayers.forEach(({ index }) => {
          if (excludeRecipient && index === recipientIndex) return;
          this._sendDirect(recipient.id, "player", {
            index,
            property: "role",
            value: revealedTeam + "s",
          });
        });
      });
    };

    if (mode === "demonsToMinions" || mode === "both") {
      sendTypeInfo("minion", "demon");
      sendTypeInfo("minion", "minion", { excludeRecipient: true });
    }
    if (mode === "minionsToDemons" || mode === "both") {
      sendTypeInfo("demon", "minion");
    }
  }

  /**
   * Distribute bluffs to demon, lunatic, minion players.
   * This will be split server side so that each player only receives their own (sub)message.
   * @param all is the boolean indicator if sending bluffs to everyone
   * @param role is the role being sent a bluffs
   * @param seatNum is the seat number being sent a bluffs
   * @param playerId is the playerId being sent a bluffs, may or may not be seated.
   */
  distributeBluffs({ all, role, seatNum, playerId }) {
    if (this._isSpectator) return;
    if (!all && !seatNum && !playerId && !role) return;

    if (all) {
      this._send("bluff", this._store.state.players.bluffs);
      return;
    }
    if (playerId) {
      this._sendDirect(playerId, "bluff", this._store.state.players.bluffs);
      return;
    }
    if (seatNum) {
      playerId = this._store.state.players.players[seatNum - 1].id;
      this._sendDirect(playerId, "bluff", this._store.state.players.bluffs);
      return;
    }

    let team;
    switch (role) {
      case "demon":
      case "lunatic":
      case "demonAll":
        team = "demon";
        break;
      case "snitch":
      case "minionAll":
      case "widow":
      case "spy":
        team = "minion";
        break;
    }

    const message = {};
    this._store.state.players.players.forEach((player) => {
      if (player.id && player.role && player.role.team == team) {
        if (team === "demon") {
          let lunatic = false;
          player.reminders.forEach((reminder) => {
            if (reminder.role === "lunatic") {
              lunatic = true;
              return;
            }
          });
          if ((role === "lunatic" && !lunatic) || (role === "demon" && lunatic))
            return;
        } else if (
          (role === "widow" || role === "spy") &&
          player.role.id != role
        )
          return;
        message[player.id] = ["bluff", this._store.state.players.bluffs];
      }
    });
    if (Object.keys(message).length) {
      this._send("direct", message);
    }
  }

  /**
   * Update demon bluffs based on incoming data. Demon/Luantic only.
   * @param bluffs
   */
  _updateBluff(bluffs) {
    if (!this._isSpectator) return;
    this._store.commit("players/updateBluff", bluffs);
  }

  /**
   * Distribute grimoire to designated players.
   * Takes one of the arguments, everything else will be null.
   * role, seatNum, playerId in a direct message.
   * This will be split server side so that each player only receives their own (sub)message.
   * @param all is the boolean indicator if sending grimoire to everyone
   * @param role is the role being sent a grimoire
   * @param seatNum is the seat number being sent a grimoire
   * @param playerId is the playerId being sent a grimoire, may or may not be seated.
   */
  distributeGrimoire({ all, role, seatNum, playerId }) {
    if (this._isSpectator) return;
    if (!all && !seatNum && !playerId && !role) return;

    const fullGrimoire = !!all || !!playerId ? false : true;

    const message = {};
    if (!role) {
      // not specifying a role
      message.roles = [];
      if (fullGrimoire) {
        message.reminders = [];
      }
      if (all) {
        message.stReminders = [];
      }
      this._store.state.players.players.forEach((player, index) => {
        message.roles.push([
          { index, property: "role", value: player.role.id },
        ]);
        if (fullGrimoire) {
          message.reminders.push([
            { index, property: "reminder", value: player.reminders },
          ]);
        }
        if (all) {
          message.stReminders.push([
            { index, property: "stReminder", value: player.stReminders },
          ]);
        }
      });
      if (Object.keys(message.roles).length) {
        if (all) this._send("grimoire", message);
        if (playerId) this._sendDirect(playerId, "grimoire", message);
        if (seatNum) {
          playerId = this._store.state.players.players[seatNum - 1].id;
          this._sendDirect(playerId, "grimoire", message);
        }
      }
    } else {
      // send all roles and reminders when requesting full grimoire (i.e. widow or spy)
      this._store.state.players.players.forEach((player) => {
        if (player.id && player.role && player.role.id == role) {
          message[player.id] = ["grimoire", { roles: [], reminders: [] }];
          this._store.state.players.players.forEach((player2, index) => {
            message[player.id][1].roles.push([
              { index, property: "role", value: player2.role.id },
            ]);
            if (fullGrimoire) {
              message[player.id][1].reminders.push([
                { index, property: "reminder", value: player2.reminders },
              ]);
            }
          });
        }
      });
      if (Object.keys(message).length) {
        this._send("direct", message);
      }
    }

    // send bluffs
    this.distributeBluffs({ all, role, seatNum, playerId });
  }

  /**
   * Update grimoire once received
   * @param payload is the grimoire details.
   */
  _updateGrimoire(payload) {
    // set roles
    payload.roles.forEach((grimRole) => {
      // load role, first from session, the global, then fail gracefully
      const role =
        this._store.state.roles.get(grimRole[0].value) ||
        this._store.getters.rolesJSONbyId.get(grimRole[0].value) ||
        {};
      if (role.team === "traveler") return;
      const player = this._store.state.players.players[grimRole[0].index];
      this._store.commit("players/update", {
        player,
        property: "role",
        value: role,
      });
    });

    // set reminders
    if (payload.reminders) {
      payload.reminders.forEach((grimReminder) => {
        const player = this._store.state.players.players[grimReminder[0].index];
        const value = (grimReminder[0].value || []).filter(
          (reminder) => reminder.role !== "custom",
        );
        this._store.commit("players/update", {
          player,
          property: "reminders",
          value,
        });
      });
    }
    // set stReminders
    if (payload.stReminders) {
      payload.stReminders.forEach((grimReminder) => {
        const player = this._store.state.players.players[grimReminder[0].index];
        const value = grimReminder[0].value || [];
        this._store.commit("players/update", {
          player,
          property: "reminders",
          value,
        });
        this._store.commit("players/update", {
          player,
          property: "stReminders",
          value,
        });
      });
    }
  }

  clearDistributedPlayerInfo() {
    if (this._isSpectator) return;
    const playerIds = new Set(Object.keys(this._players));
    this._store.state.players.players.forEach(({ id }) => {
      if (id) playerIds.add(id);
    });
    playerIds.delete(this._store.state.session.playerId);

    const message = {};
    playerIds.forEach((playerId) => {
      message[playerId] = ["clearPlayerInfo"];
    });
    if (Object.keys(message).length) {
      this._send("direct", message);
    }
  }

  _clearPlayerInfo() {
    if (!this._isSpectator) return;
    this._store.commit("players/clearKnownInfo");
  }

  /**
   * A player nomination. ST only
   * This also syncs the voting speed to the players.
   * Payload can be an object with {nomination} property or just the nomination itself, or undefined.
   * Passing { nomination: false, recorded: true } closes a recorded vote.
   * @param payload [nominator, nominee]|{nomination}
   */
  nomination(payload) {
    if (this._isSpectator) return;
    const isPayloadObject =
      payload && !Array.isArray(payload) && typeof payload === "object";
    const nomination = isPayloadObject ? payload.nomination : payload;
    const day = isPayloadObject ? payload.day : undefined;
    const recorded = isPayloadObject && payload.recorded;
    const players = this._store.state.players.players;
    if (
      !nomination ||
      (players.length > nomination[0] && players.length > nomination[1])
    ) {
      this.setVotingSpeed(this._store.state.session.votingSpeed);
      const recordedPayload =
        !nomination && recorded
          ? {
              nomination: false,
              day,
              recorded: true,
              ...this._voteHistoryPayload(),
            }
          : null;
      this._send(
        "nomination",
        nomination
          ? { nomination, day }
          : recorded
          ? recordedPayload
          : nomination,
      );
    }
  }

  /**
   * Set the isVoteInProgress status. ST only
   */
  setVoteInProgress() {
    if (this._isSpectator) return;
    const { session, players } = this._store.state;
    this._send("isVoteInProgress", session.isVoteInProgress);
    if (
      !session.isVoteInProgress &&
      session.isSecretVote &&
      session.nomination &&
      session.lockedVote > players.players.length
    ) {
      this._send("votes", Array.from(session.votes));
    }
  }

  voteReadyStatePayload() {
    const {
      voteReadyStatus,
      voteReadyEligibleSeats,
      voteReadySeats,
      voteReadyDismissedSeats,
    } = this._store.state.session;
    return {
      status: voteReadyStatus,
      eligibleSeats: Array.from(voteReadyEligibleSeats || []),
      readySeats: Array.from(voteReadySeats || []),
      dismissedSeats: Array.from(voteReadyDismissedSeats || []),
    };
  }

  sendVoteReadyState() {
    if (this._isSpectator) return;
    this._send("voteReadyState", this.voteReadyStatePayload());
  }

  sendVoteReady(seat) {
    if (!this._isSpectator) return;
    this._sendDirect("host", "voteReady", seat);
  }

  sendVoteReadyDismissed(seat) {
    if (!this._isSpectator) return;
    this._sendDirect("host", "voteReadyDismissed", seat);
  }

  _updateVoteReadyState(payload = {}) {
    if (!this._isSpectator) return;
    this._store.commit("session/setVoteReadyState", payload);
  }

  /**
   * Send the current phase status. ST only
   */
  setPhaseIndex() {
    if (this._isSpectator) return;
    const previousPhase = phaseOf(this._lastSentPhaseIndex);
    const currentPhaseIndex = this._store.state.grimoire.phaseIndex;
    const currentPhase = phaseOf(currentPhaseIndex);
    this._send("phaseIndex", this._store.state.grimoire.phaseIndex);
    this._send("isNight", this._store.state.grimoire.isNight);
    if (previousPhase === PHASE_NIGHT && currentPhase === PHASE_DAWN) {
      this._publishAllDeathStates();
    }
    this._lastSentPhaseIndex = currentPhaseIndex;
  }

  /**
   * Send the isVoteHistoryAllowed state. ST only
   */
  setVoteHistoryAllowed() {
    if (this._isSpectator) return;
    this._send(
      "isVoteHistoryAllowed",
      this._store.state.session.isVoteHistoryAllowed,
    );
  }

  /**
   * Send the voting speed. ST only
   * @param votingSpeed voting speed in seconds, minimum 1
   */
  setVotingSpeed(votingSpeed) {
    if (this._isSpectator) return;
    if (votingSpeed) {
      this._send("votingSpeed", votingSpeed);
    }
  }

  /**
   * Set which player is on the block. ST only
   * @param playerIndex, player id or -1 for empty
   */
  setMarked(playerIndex) {
    if (this._isSpectator) return;
    if (this._store.state.session.isSecretVote) return;
    this._send("marked", playerIndex);
  }

  /**
   * Clear the vote history for everyone. ST only
   */
  clearVoteHistory() {
    if (this._isSpectator) return;
    this._send("clearVoteHistory");
  }

  setNominationMarks() {
    if (this._isSpectator) return;
    const session = this._store.state.session;
    this._send("nominationMarks", {
      nominatorsByDay: session.nominationNominatorsByDay,
      nomineesByDay: session.nominationNomineesByDay,
    });
  }

  /**
   * Send a vote. Player or ST
   * @param index Seat of the player
   * @param sync Flag whether to sync this vote with others or not
   */
  vote([index]) {
    if (this._isSpectator && !this._store.state.session.isStorytellerOnline) {
      return;
    }
    const player = this._store.state.players.players[index];
    if (!player) return;
    if (this._isSpectator && player && player.isDead && player.isVoteless) {
      return;
    }
    if (
      this._store.state.session.playerId === player.id ||
      !this._isSpectator
    ) {
      if (
        this._store.state.players.players[
          this._store.state.session.nomination[1]
        ].role.team === "traveler" ||
        !this._store.state.session.isSecretVote
      ) {
        // send to everyone if exile or secret vote is off
        // send vote only if it is your own vote or you are the storyteller
        this._send("vote", [
          index,
          this._store.state.session.votes[index],
          !this._isSpectator,
        ]);
      } else {
        // otherwise only send direct messages
        if (this._isSpectator) {
          this._sendDirect("host", "vote", [
            index,
            this._store.state.session.votes[index],
            !this._isSpectator,
          ]);
        } else {
          this._sendDirect(player.id, "vote", [
            index,
            this._store.state.session.votes[index],
            !this._isSpectator,
          ]);
        }
      }
    }
  }

  /**
   * Send a status change to whether anonymous votes are in progress. ST to players only
   */
  setSecretVote(isSecretVote) {
    if (this._isSpectator) return;
    this._send("secretVote", isSecretVote);
  }

  _handleSecretVote(isSecretVote) {
    if (!this._isSpectator) return;
    this._store.state.session.isSecretVote = isSecretVote;
  }

  setBootlegger(content) {
    if (this._isSpectator) return;
    this._send("bootlegger", content);
  }

  _handleSetBootlegger(content) {
    if (!this._isSpectator) return;
    this._store.state.session.bootlegger = content;
  }

  setUseOldOrder(isUseOldOrder) {
    if (this._isSpectator) return;
    this._send("useOldOrder", isUseOldOrder);
  }

  _handleSetUseOldOrder(isUseOldOrder) {
    if (!this._isSpectator) return;
    this._store.state.session.isUseOldOrder = isUseOldOrder;
  }

  setUseOldRole(isUseOldRole) {
    if (this._isSpectator) return;
    this._send("useOldRole", isUseOldRole);
  }

  _handleSetUseOldRole(isUseOldRole) {
    if (!this._isSpectator) return;
    this._store.state.session.isUseOldRole = isUseOldRole;
  }

  setIsReview(isReview) {
    if (this._isSpectator) return;
    this._send("isReview", isReview);
  }

  _handleSetIsReview(isReview) {
    if (!this._isSpectator) return;
    this._store.state.session.isReview = isReview;
  }

  sendReviewDetails(playerId = "") {
    if (this._isSpectator) return;
    const details = this._store.state.session.grimoireHistory || {};
    if (!details.reviewFingerprint) return;
    this._sendDirect(playerId, "reviewDetails", details);
  }

  sendReviewDetailsFingerprint(playerId = "") {
    if (this._isSpectator) return;
    const reviewFingerprint =
      this._store.state.session.grimoireHistory.reviewFingerprint || "";
    if (!reviewFingerprint) return;
    this._sendDirect(playerId, "reviewDetailsFingerprint", {
      reviewFingerprint,
    });
  }

  _handleReviewDetailsFingerprint(details = {}) {
    if (!this._isSpectator) return;
    const reviewFingerprint =
      typeof details === "string"
        ? details
        : String((details && details.reviewFingerprint) || "");
    const receivedRecords =
      this._store.state.session.receivedReviewDetailsRecords || [];
    const alreadyReceived = receivedRecords.some(
      (record) => record.reviewFingerprint === reviewFingerprint,
    );
    if (!reviewFingerprint || alreadyReceived) return;
    this._sendDirect(
      "host",
      "requestReviewDetails",
      this._store.state.session.playerId,
    );
  }

  _updateReviewDetails(details) {
    if (!this._isSpectator) return;
    this._store.commit("session/receiveReviewDetails", details);
  }

  /**
   * Handle an incoming vote, but only if it is from ST or unlocked.
   * @param index
   * @param vote
   * @param fromST
   */
  _handleVote([index, vote, fromST]) {
    // do not reveal vote when anonymous voting is in progress, unless it's ST changing that player's vote
    const votingPlayer = this._store.state.players.players[index];
    if (!votingPlayer) return;
    if (!fromST && votingPlayer.isDead && votingPlayer.isVoteless) return;
    const voteId = votingPlayer.id;
    if (
      this._isSpectator &&
      voteId != this._store.state.session.playerId &&
      this._store.state.session.isSecretVote &&
      this._store.state.session.isVoteInProgress &&
      this._store.state.players.players[this._store.state.session.nomination[1]]
        .role.team != "traveler"
    )
      return;

    const { session, players } = this._store.state;
    const playerCount = players.players.length;
    const indexAdjusted =
      (index - 1 + playerCount - session.nomination[1]) % playerCount;
    if (fromST || indexAdjusted === session.lockedVote - 1) {
      this._store.commit("session/vote", [index, vote]);
    }
  }

  /**
   * Reveal the full vote state after a secret vote ends. Player only
   * @param votes
   * @private
   */
  _handleVotes(votes = []) {
    if (!this._isSpectator) return;
    if (!Array.isArray(votes)) return;
    const { players } = this._store.state.players;
    for (let index = 0; index < players.length; index++) {
      this._store.commit("session/vote", [index, votes[index] || 0]);
    }
  }

  /**
   * Publish a full vote state replacement. ST only
   */
  clearVotes() {
    if (this._isSpectator) return;
    this._send("votes", Array.from(this._store.state.session.votes));
  }

  /**
   * Lock a vote. ST only
   */
  lockVote() {
    if (this._isSpectator) return;
    const { lockedVote, votes, nomination } = this._store.state.session;
    const { players } = this._store.state.players;
    const index = (nomination[1] + lockedVote - 1) % players.length;
    this._send("lock", [this._store.state.session.lockedVote, votes[index]]);
  }

  /**
   * Update vote lock and the locked vote, if it differs. Player only
   * @param lock
   * @param vote
   * @private
   */
  _handleLock([lock, vote]) {
    if (!this._isSpectator) return;
    this._store.commit("session/lockVote", lock);

    if (lock > 1) {
      const { lockedVote, nomination } = this._store.state.session;
      const { players } = this._store.state.players;
      const index = (nomination[1] + lockedVote - 1) % players.length;
      const voteId = players[index] && players[index].id;
      // During secret voting, only the current player's own locked vote is shown.
      const displayVote =
        this._store.state.session.isSecretVote &&
        voteId !== this._store.state.session.playerId
          ? false
          : vote;
      if (this._store.state.session.votes[index] !== vote) {
        this._store.commit("session/vote", [index, displayVote]);
      }
    }
  }

  /**
   * Swap two player seats. ST only
   * @param payload
   */
  swapPlayer(payload) {
    if (this._isSpectator) return;
    this._send("swap", payload);
  }

  /**
   * Move a player to another seat. ST only
   * @param payload
   */
  movePlayer(payload) {
    if (this._isSpectator) return;
    this._send("move", payload);
  }

  /**
   * Remove a player. ST only
   * @param payload
   */
  removePlayer(payload) {
    if (this._isSpectator) return;
    this._send("remove", payload);
  }

  /**
   * Sync seated player status.
   * @param isSecretVoteless boolean says if this player is secretly voteless.
   */
  _handleSyncPlayerStatus({ isSecretVoteless, isWraith, isUsingWraith }) {
    if (!this._isSpectator) return;
    if (this._store.state.session.claimedSeat === -1) return;

    if (this._store.state.session.isSecretVote && isSecretVoteless) {
      this._store.commit("players/update", {
        player:
          this._store.state.players.players[
            this._store.state.session.claimedSeat
          ],
        property: "isVoteless",
        value: isSecretVoteless,
      });
    }

    this._store.commit("session/setIsRole", {
      role: "wraith",
      property: "active",
      value: isWraith,
    });
    this._store.commit("session/setIsRole", {
      role: "wraith",
      property: "using",
      value: isUsingWraith,
      st: true,
    });
  }

  /**
   * Send out timer.
   * @param payload
   */
  setTimer(payload) {
    if (this._isSpectator) return;
    this._send("setTimer", payload);
  }

  /**
   * Update timer when received.
   * @param payload
   */
  _handleSetTimer(time) {
    this._store.commit("session/setTimer", time);
  }

  /**
   * Send out starting timer.
   * @param payload
   */
  startTimer(payload) {
    if (this._isSpectator) return;
    this._send("startTimer", payload);
  }

  /**
   * Starting timer.
   */
  _handleStartTimer(payload) {
    this._store.commit("session/startTimer", payload);
  }

  /**
   * Send out starting timer.
   * @param payload
   */
  stopTimer(payload) {
    if (this._isSpectator) return;
    this._send("stopTimer", payload);
  }

  /**
   * Starting timer.
   */
  _handleStopTimer() {
    this._store.commit("session/stopTimer");
  }
}

class LiveLobby {
  constructor(store) {
    this._wss = `${window.location.protocol === "https:" ? "wss" : "ws"}://${
      window.location.host
    }/lobby/`;
    this._socket = null;
    this._isSpectator = true;
    this._isAlive = true;
    this._store = store;
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._requestId = 0;
    this._requests = new Map();
    this._pings = {}; // map of player IDs to ping
  }

  /**
   * Open a new session for lobby.
   * @private
   */
  _open() {
    this.disconnect();
    this._socket = new WebSocket(this._wss);
    if (this._socket === null) {
      this._store.commit("session/setReconnecting", true);
      this._reconnectTimer = setTimeout(() => this.connect(), 3 * 1000);
      return;
    }
    this._socket.addEventListener("message", this._handleMessage.bind(this));
    this._socket.onopen = this._onOpen.bind(this);
    this._socket.onclose = (err) => {
      this._socket = null;
      this._stopHeartbeat();
      if (err.code !== 1000) {
        // connection interrupted, reconnect after 3 seconds
        this._reconnectTimer = setTimeout(() => this.connect(), 3 * 1000);
      }
    };
  }

  /**
   * Send a message through the socket.
   * @param command
   * @param params
   * @private
   */
  _send(command, params, feedback = false) {
    if (this._socket && this._socket.readyState === 1) {
      this._socket.send(JSON.stringify([command, params, feedback]));
    }
  }

  /**
   * Send a message directly to a single playerId, if provided.
   * Otherwise broadcast it.
   * @param playerId player ID or "host", optional
   * @param command
   * @param params
   * @private
   */
  _sendDirect(playerId, command, params, feedback = false) {
    if (playerId) {
      this._send("direct", { [playerId]: [command, params] }, feedback);
    } else {
      this._send(command, params, feedback);
    }
  }

  _onOpen() {
    this._startHeartbeat();
  }

  _whenOpen() {
    if (this._socket && this._socket.readyState === 1) {
      return Promise.resolve();
    }
    if (!this._socket || this._socket.readyState > 1) this._open();
    return new Promise((resolve, reject) => {
      const socket = this._socket;
      const timeout = setTimeout(() => reject(new Error("连接超时")), 5000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        () => {
          clearTimeout(timeout);
          reject(new Error("连接已关闭"));
        },
        { once: true },
      );
    });
  }

  async _request(command, params = {}) {
    await this._whenOpen();
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${++this._requestId}`;
      const timeout = setTimeout(() => {
        this._requests.delete(requestId);
        reject(new Error("请求超时"));
      }, 5000);
      this._requests.set(requestId, { resolve, reject, timeout });
      this._send(command, { ...params, requestId });
    });
  }

  _resolveRequest(params) {
    const requestId = params && params.requestId;
    const request = this._requests.get(requestId);
    if (!request) return;
    clearTimeout(request.timeout);
    this._requests.delete(requestId);
    request.resolve(params);
  }

  _clearLocalIdentity() {
    this._store.commit("session/setPlayerId", "");
    this._store.commit("session/setPlayerSecret", "");
    this._store.dispatch("resetRoomState");
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._sendHeartbeat();
    this._heartbeatTimer = setInterval(
      () => this._sendHeartbeat(),
      PLAYER_HEARTBEAT_INTERVAL,
    );
  }

  _stopHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  async _sendHeartbeat() {
    const playerId = this._store.state.session.playerId;
    const playerSecret = this._store.state.session.playerSecret;
    if (!playerId || !playerSecret) return;
    try {
      const result = await this._request("playerHeartbeat", {
        playerId,
        playerSecret,
      });
      if (!result.ok && result.reason !== "rateLimited")
        this._clearLocalIdentity();
    } catch (e) {
      // Connection errors are handled by socket reconnect.
    }
  }

  _handleMessage({ data }) {
    let command, params;
    try {
      [command, params] = JSON.parse(data);
    } catch (err) {
      return;
    }
    switch (command) {
      case "setRooms":
        this.setRooms(params);
        break;
      case "setRoomDetails":
        this.setRoomDetails(params);
        break;
      case "addRoom":
        this.addRoom(params);
        break;
      case "removeRoom":
        this.removeRoom(params);
        break;
      case "identifyPlayerResult":
      case "createRoomResult":
      case "joinRoomResult":
      case "validateSessionResult":
      case "playerHeartbeatResult":
        this._resolveRequest(params);
        break;
    }
  }

  refreshRooms() {
    this._send("refreshRoomsLive");
  }

  async identifyPlayer(profile = {}) {
    const result = await this._request("identifyPlayer", {
      candidatePlayerId: this._store.state.session.playerId,
      candidatePlayerSecret: this._store.state.session.playerSecret,
      profile,
    });
    if (result.playerId) {
      this._store.commit("session/setPlayerId", result.playerId);
    }
    if (result.playerSecret) {
      this._store.commit("session/setPlayerSecret", result.playerSecret);
    }
    return result;
  }

  async createRoom({ profile, playerCount, password }) {
    const identity = await this.identifyPlayer(profile);
    if (!identity.playerId) return { ok: false, reason: identity.reason };
    const result = await this._request("createRoom", {
      playerId: identity.playerId,
      playerSecret:
        identity.playerSecret || this._store.state.session.playerSecret,
      profile,
      playerCount,
      password,
    });
    if (!result.ok && result.reason === "账户不存在")
      this._clearLocalIdentity();
    return result;
  }

  async joinRoom({ profile, roomCode, password = "" }) {
    const identity = await this.identifyPlayer(profile);
    if (!identity.playerId) return { ok: false, reason: identity.reason };
    const result = await this._request("joinRoom", {
      playerId: identity.playerId,
      playerSecret:
        identity.playerSecret || this._store.state.session.playerSecret,
      profile,
      roomCode,
      password,
    });
    if (!result.ok && result.reason === "账户不存在")
      this._clearLocalIdentity();
    return result;
  }

  async validateSession({ roomCode, clearOnInvalid = false } = {}) {
    const playerId = this._store.state.session.playerId;
    const playerSecret = this._store.state.session.playerSecret;
    if (!playerId || !playerSecret || !roomCode) {
      if (clearOnInvalid) this._clearLocalIdentity();
      return {
        ok: false,
        reason: !playerSecret && playerId ? "accountMissing" : "",
      };
    }
    const result = await this._request("validateSession", {
      playerId,
      playerSecret,
      roomCode,
    });
    if (!result.ok && result.reason !== "rateLimited" && clearOnInvalid)
      this._clearLocalIdentity();
    return result;
  }

  /**
   * Connect to a new live session to the lobby to receive information about available rooms.
   * Set a unique playerId if there isn't one yet.
   */
  connect() {
    this._pings = {};
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._isSpectator = this._store.state.session.isSpectator;
    this._open();
  }

  /**
   * Close the current session, if any.
   */
  disconnect() {
    this._pings = {};
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._store.commit("session/setReconnecting", false);
    clearTimeout(this._reconnectTimer);
    this._stopHeartbeat();
    if (this._socket) {
      this._socket.close(1000);
      this._socket = null;
    }
  }

  /**
   * Set the full list of available rooms
   * @param params full list of all existing channels
   * @private
   */
  setRooms(params) {
    if (!Array.isArray(params)) return;
    this._store.commit("session/setRooms", params);
  }

  setRoomDetails(params) {
    if (!Array.isArray(params)) return;
    this._store.commit("session/setRoomDetails", params);
  }

  /**
   * Add rooms to the existing list
   * @param params full list of all existing channels
   * @private
   */
  addRoom(params) {
    if (typeof params != "string") return;
    const rooms = this._store.state.session.rooms || [];
    if (rooms.includes(params)) return;
    this._store.commit("session/setRooms", [...rooms, params]);
  }

  /**
   * Remove rooms from the existing list
   * @param params full list of all existing channels
   * @private
   */
  removeRoom(params) {
    if (typeof params != "string") return;
    this._store.commit(
      "session/setRooms",
      (this._store.state.session.rooms || []).filter((room) => room != params),
    );
    this._store.commit(
      "session/setRoomDetails",
      this._store.state.session.roomDetails.filter((room) => room.id != params),
    );
  }
}

function showStoreInputModal(store, { inputType, inputModal, inputData }) {
  return new Promise((resolve, reject) => {
    store.commit("session/setInputResolver", resolve);
    store.commit("session/setInputRejecter", reject);
    store.commit("session/setInputType", inputType);
    store.commit("session/setInputModal", inputModal);
    store.commit("session/setInputData", inputData);
    store.commit("toggleModal", "input");
  });
}

async function showRestoreAlert(store, message) {
  await showStoreInputModal(store, {
    inputType: "alert",
    inputModal: "text",
    inputData: {
      name: [message],
    },
  }).catch(() => {
    return null;
  });
}

async function restoreStoredSession(store, lobby, { notify = false } = {}) {
  if (typeof localStorage === "undefined") return;
  const storedSession = localStorage.getItem("session");
  if (!storedSession || !store.state.session.playerId) return;
  let sessionId = "";
  let wasSpectator = true;
  try {
    const parsed = JSON.parse(storedSession);
    wasSpectator = Array.isArray(parsed) ? !!parsed[0] : true;
    sessionId = Array.isArray(parsed) ? parsed[1] : "";
  } catch (e) {
    store.dispatch("resetRoomState");
    return;
  }
  if (!sessionId) return;
  const result = await lobby
    .validateSession({ roomCode: sessionId })
    .catch(() => ({ ok: false }));
  if (!result.ok) {
    if (result.reason === "rateLimited") {
      if (notify) await showRestoreAlert(store, RATE_LIMITED_MESSAGE);
      return;
    }
    if (result.reason === "notMember" && wasSpectator) {
      const password = store.state.session.savedRoomPasswords[sessionId] || "";
      const join = await lobby
        .joinRoom({
          profile: {
            name: store.state.session.playerName,
            gender: store.state.session.playerGender,
          },
          roomCode: sessionId,
          password,
        })
        .catch(() => ({ ok: false }));
      if (join.ok) {
        store.commit("session/setSpectator", true);
        store.commit("toggleGrimoire", false);
        store.commit("session/claimSeat", -1);
        store.commit("session/setSessionId", join.roomCode);
        if (notify) {
          await showRestoreAlert(
            store,
            "你已重新回到房间，但原座位可能已被清空。",
          );
        }
        return;
      }
      await showRestoreAlert(
        store,
        join.reason === "rateLimited"
          ? RATE_LIMITED_MESSAGE
          : join.reason === "password"
          ? "你已不在该房间中，保存的房间密码无效，请重新加入。"
          : "你已不在该房间中，请重新加入。",
      );
      store.dispatch("resetRoomState");
      return;
    }
    if (result.reason === "accountMissing") {
      store.commit("session/setPlayerId", "");
      store.commit("session/setPlayerSecret", "");
      await showRestoreAlert(store, "账户不存在，请重新进入房间。");
      store.dispatch("resetRoomState");
      return;
    }
    await showRestoreAlert(
      store,
      result.reason === "roomMissing"
        ? "房间已被解散或清理，请重新创建或加入房间。"
        : "你已经不属于该房间，请重新创建或加入房间。",
    );
    store.dispatch("resetRoomState");
    return;
  }
  store.commit("session/setSpectator", result.role !== "storyteller");
  if (result.role !== "storyteller") store.commit("toggleGrimoire", false);
  store.commit("session/setSessionId", result.roomCode);
}

export default (store) => {
  // lobby
  const lobby = new LiveLobby(store);
  store.$liveLobby = lobby;
  if (window.location.pathname === "/") lobby.connect();
  // setup
  const session = new LiveSession(store);
  const refreshSpectatorSession = () => {
    if (document.visibilityState && document.visibilityState !== "visible") {
      return;
    }
    session.refreshSpectatorSession();
  };
  window.addEventListener("focus", refreshSpectatorSession);
  window.addEventListener("online", refreshSpectatorSession);
  document.addEventListener("visibilitychange", refreshSpectatorSession);

  // listen to mutations
  store.subscribe(({ type, payload }, state) => {
    switch (type) {
      case "session/setSessionId":
        if (state.session.sessionId) {
          session.connect(state.session.sessionId);
        } else {
          session.disconnect();
        }
        break;
      case "session/requestRoomListRefresh":
        lobby.refreshRooms();
        break;
      case "session/claimSeat":
        session.claimSeat(payload);
        break;
      case "session/distributeRoles":
        if (payload && !state.session.isReview) {
          session.distributeRoles();
        }
        break;
      case "session/distributeTypes":
        if (payload && !state.session.isReview) {
          session.distributeTypes();
        }
        break;
      case "session/distributeBluffs":
        if (payload && !state.session.isReview) {
          session.distributeBluffs(payload);
        }
        break;
      case "session/distributeEvilInfo":
        if (payload && !state.session.isReview) {
          session.distributeEvilInfo(payload);
        }
        break;
      case "session/distributeSeatTypeInfo":
        if (payload && payload.val && !state.session.isReview) {
          session.distributeSeatTypeInfo(payload);
        }
        break;
      case "session/distributeGrimoire":
        if (payload && !state.session.isReview) {
          session.distributeGrimoire(payload);
        }
        break;
      case "session/clearDistributedPlayerInfo":
        session.clearDistributedPlayerInfo();
        break;
      case "session/startStorytelling":
      case "session/endStorytelling":
      case "session/setStorytelling":
      case "session/setInitialRoleIds":
      case "session/addInitialRoleSnapshot":
        session.sendHostHeartbeat();
        session.sendGamestate();
        break;
      case "session/nomination":
      case "session/setNomination":
        session.nomination(payload);
        break;
      case "session/setVoteInProgress":
        session.setVoteInProgress(payload);
        break;
      case "session/startVoteReady":
      case "session/clearVoteReady":
        if (!session._isSpectator) {
          session.sendVoteReadyState();
        }
        break;
      case "session/voteReady":
        if (session._isSpectator) {
          session.sendVoteReady(payload);
        } else {
          session.sendVoteReadyState();
        }
        break;
      case "session/voteReadyDismissed":
        if (session._isSpectator) {
          session.sendVoteReadyDismissed(payload);
        } else {
          session.sendVoteReadyState();
        }
        break;
      case "session/voteSync":
        session.vote(payload);
        break;
      case "session/clearVotes":
        session.clearVotes();
        break;
      case "session/lockVote":
        session.lockVote();
        break;
      case "session/setVotingSpeed":
        session.setVotingSpeed(payload);
        break;
      case "session/clearVoteHistory":
        session.clearVoteHistory();
        break;
      case "session/setVoteHistoryAllowed":
        session.setVoteHistoryAllowed();
        break;
      case "session/markNomination":
      case "session/clearNominationNominator":
      case "session/clearNominationNominee":
      case "session/setNominationMarks":
      case "session/clearNominationMarks":
        session.setNominationMarks();
        break;
      case "setPhaseIndex":
      case "nextPhase":
      case "previousPhase":
        session.setPhaseIndex();
        break;
      case "session/setPlayerName":
        if (!session._isSpectator) {
          session._store.commit("players/setStorytellerFabled", {
            name: payload,
          });
        }
        session.sendHostHeartbeat();
        session.sendStorytellerName();
        break;
      case "session/updatePlayerAvatar":
        if (!session._isSpectator) {
          session._store.commit("players/setStorytellerFabled", {
            image: state.session.playerAvatar,
          });
        }
        break;
      case "toggleNight":
        session.setPhaseIndex();
        break;
      case "setEdition":
        session.sendEdition();
        break;
      case "setStates":
        session.sendStates();
        break;
      case "setTeamsNames":
        session.sendTeamsNames();
        break;
      case "setFirstNight":
        session.sendFirstNight();
        break;
      case "setOtherNight":
        session.sendOtherNight();
        break;
      case "players/setFabled":
      case "players/setStorytellerFabled":
        session.sendFabled();
        break;
      case "session/setMarkedPlayer":
        session.setMarked(payload);
        break;
      case "players/swap":
        session.swapPlayer(payload);
        break;
      case "players/move":
        session.movePlayer(payload);
        break;
      case "players/remove":
        session.sendHostHeartbeat();
        session.removePlayer(payload);
        break;
      case "players/set":
      case "players/clear":
      case "players/add":
        session.sendHostHeartbeat();
        session.sendGamestate("", true);
        break;
      case "players/update":
        if (payload.property === "pronouns") {
          session.sendPlayerPronouns(payload);
        } else {
          session.sendPlayer(payload);
        }
        break;
      case "players/empty":
        session.emptyPlayer(payload);
        break;
      case "session/setTimer":
        session.setTimer(payload);
        break;
      case "session/startTimer":
        session.startTimer(payload);
        break;
      case "session/stopTimer":
        session.stopTimer(payload);
        break;
      case "session/setPlayerAvatar":
        session.uploadAvatar(payload);
        break;
      case "session/requestDefaultAvatar":
        session.requestDefaultAvatar(payload);
        break;
      case "session/requestAvatarCleanup":
        session.clearUploadedAvatar();
        break;
      case "session/setSecretVote":
        session.setSecretVote(payload);
        break;
      case "session/setUseOldOrder":
        session.setUseOldOrder(payload);
        break;
      case "session/setUseOldRole":
        session.setUseOldRole(payload);
        break;
      case "session/setIsReview":
        session.setIsReview(payload);
        if (payload) {
          session.distributeGrimoire({ all: true });
          session.sendReviewDetails();
        }
        break;
      case "session/startReview":
        session.setIsReview(true);
        session.distributeGrimoire({ all: true });
        session.sendReviewDetails();
        break;
      // case "session/setBootlegger":
      //   session.setBootlegger(payload);
      //   break;
      case "session/setIsRole":
        session.setIsRole(payload);
        break;
    }
  });
  restoreStoredSession(store, lobby);
};
