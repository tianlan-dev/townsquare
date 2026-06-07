const {
  DEFAULT_PLAYER_AVATARS,
  isDefaultPlayerAvatar,
  normalizePlayerGender,
} = require("../playerAvatars");

module.exports = (store) => {
  if (window.location.pathname != "/") return;

  const roomStorageKeys = [
    "players",
    "bluffs",
    "fabled",
    "session",
    "roomPassword",
    "stId",
    "claimedSeat",
    "playerVotes",
    "votes",
    "votesSelected",
    "nominationMarks",
    "isStorytelling",
    "initialRoleIds",
    "grimoireHistory",
    "customBootlegger",
    "secretVote",
    "isReview",
    "isRole",
    "phaseIndex",
  ];
  const removeRoomStorage = () => {
    roomStorageKeys.forEach((key) => localStorage.removeItem(key));
  };

  const updatePagetitle = (isPublic) =>
    // (document.title = `Blood on the Clocktower ${
    //   isPublic ? "Town Square" : "Grimoire"
    // }`);
    (document.title = `染·钟楼谜团${isPublic ? "" : ""}`);

  // initialize data
  localStorage.removeItem("background");
  if (localStorage.getItem("muted")) {
    store.commit("toggleMuted", true);
  }
  if (localStorage.getItem("static")) {
    store.commit("toggleStatic", true);
  }
  if (localStorage.getItem("imageOptIn")) {
    store.commit("toggleImageOptIn", true);
  }
  if (localStorage.getItem("zoom")) {
    store.commit("setZoom", parseFloat(localStorage.getItem("zoom")));
  }
  if (localStorage.getItem("isGrimoire")) {
    store.commit("toggleGrimoire", false);
    updatePagetitle(false);
  }
  if (localStorage.getItem("useOldOrder")) {
    store.commit(
      "session/setUseOldOrder",
      JSON.parse(localStorage.getItem("useOldOrder")),
    );
  }
  if (localStorage.getItem("useOldRole")) {
    store.commit(
      "session/setUseOldRole",
      JSON.parse(localStorage.getItem("useOldRole")),
    );
  }
  if (localStorage.getItem("isReview")) {
    store.commit(
      "session/setIsReview",
      JSON.parse(localStorage.getItem("isReview")),
    );
  }
  if (localStorage.getItem("selectedEditions")) {
    store.commit(
      "setSelectedEditions",
      JSON.parse(localStorage.getItem("selectedEditions")),
    );
  }
  if (localStorage.roles !== undefined) {
    store.commit("setCustomRoles", JSON.parse(localStorage.roles));
    store.commit("setEdition", { id: "custom" });
  }
  if (localStorage.getItem("states")) {
    store.commit("setStates", JSON.parse(localStorage.states));
  }
  if (localStorage.getItem("teamsNames")) {
    store.commit("setTeamsNames", JSON.parse(localStorage.teamsNames));
  }
  if (localStorage.getItem("firstNight")) {
    store.commit("setFirstNight", JSON.parse(localStorage.firstNight));
  }
  if (localStorage.getItem("otherNight")) {
    store.commit("setOtherNight", JSON.parse(localStorage.otherNight));
  }
  if (localStorage.edition !== undefined) {
    // this will initialize state.roles for official editions
    const edition = JSON.parse(localStorage.edition);
    if (edition.id === "custom_ankot") {
      localStorage.removeItem("edition");
      localStorage.removeItem("roles");
      localStorage.removeItem("states");
      localStorage.removeItem("teamsNames");
      localStorage.removeItem("firstNight");
      localStorage.removeItem("otherNight");
    } else {
      store.commit("setEdition", edition);
    }
  }
  if (localStorage.bluffs !== undefined) {
    JSON.parse(localStorage.bluffs).forEach((role, index) => {
      store.commit("players/setBluff", {
        index,
        role: store.state.roles.get(role) || {},
      });
    });
  }
  if (localStorage.getItem("playerProfileImage")) {
    localStorage.setItem(
      "playerAvatar",
      localStorage.getItem("playerProfileImage"),
    );
    localStorage.setItem("playerAvatarSource", "uploaded");
    localStorage.removeItem("playerProfileImage");
  }
  if (localStorage.fabled !== undefined) {
    store.commit("players/setFabled", {
      // fabled: JSON.parse(localStorage.fabled).map(
      //   fabled => store.state.fabled.get(fabled.id) || fabled
      // )
      fabled: JSON.parse(localStorage.fabled),
      emptyFabled: true,
    });
  }
  if (localStorage.players) {
    store.commit(
      "players/set",
      JSON.parse(localStorage.players).map((player) => ({
        ...player,
        role:
          store.state.roles.get(player.role) ||
          store.getters.rolesJSONbyId.get(player.role) ||
          {},
      })),
    );
  }
  /**** Session related data *****/
  if (localStorage.getItem("playerId")) {
    store.commit("session/setPlayerId", localStorage.getItem("playerId"));
  }
  if (localStorage.getItem("playerName")) {
    store.commit("session/setPlayerName", localStorage.getItem("playerName"));
  }
  if (localStorage.getItem("playerGender")) {
    store.commit(
      "session/setPlayerGender",
      normalizePlayerGender(localStorage.getItem("playerGender")),
    );
  }
  if (localStorage.getItem("roomPassword")) {
    store.commit(
      "session/setRoomPassword",
      localStorage.getItem("roomPassword"),
    );
  }
  if (localStorage.getItem("savedRoomPasswords")) {
    store.commit(
      "session/setSavedRoomPasswords",
      JSON.parse(localStorage.getItem("savedRoomPasswords")),
    );
  }
  if (localStorage.getItem("stId")) {
    store.commit("session/setStId", localStorage.getItem("stId"));
  }
  if (localStorage.getItem("claimedSeat")) {
    store.commit(
      "session/claimSeat",
      Number(localStorage.getItem("claimedSeat")),
    );
  }
  // Session restoration is validated by the live server after the lobby socket
  // connects. Local storage is only a hint and must not directly enter a room.
  if (localStorage.getItem("playerVotes")) {
    store.commit(
      "session/setPlayerVotes",
      JSON.parse(localStorage.getItem("playerVotes")),
    );
  }
  if (localStorage.getItem("votes")) {
    const votes = JSON.parse(localStorage.getItem("votes"));
    votes.forEach((voteHistory) => {
      store.commit("session/addVotes", voteHistory);
    });
  }
  if (localStorage.getItem("votesSelected")) {
    const votesSelected = JSON.parse(localStorage.getItem("votesSelected"));
    votesSelected.forEach((voteSelected) => {
      store.commit("session/addVoteSelected", voteSelected);
    });
  }
  if (localStorage.getItem("nominationMarks")) {
    store.commit(
      "session/setNominationMarks",
      JSON.parse(localStorage.getItem("nominationMarks")),
    );
  }
  if (localStorage.getItem("isStorytelling")) {
    store.commit(
      "session/setStorytelling",
      JSON.parse(localStorage.getItem("isStorytelling")),
    );
  }
  if (localStorage.getItem("initialRoleIds")) {
    store.commit(
      "session/setInitialRoleIds",
      JSON.parse(localStorage.getItem("initialRoleIds")),
    );
  }
  if (localStorage.getItem("grimoireHistory")) {
    store.commit(
      "session/setGrimoireHistory",
      JSON.parse(localStorage.getItem("grimoireHistory")),
    );
  }
  if (localStorage.getItem("receivedReviewDetails")) {
    store.commit(
      "session/setReceivedReviewDetails",
      JSON.parse(localStorage.getItem("receivedReviewDetails")),
    );
  }
  if (localStorage.getItem("hasUnreadReviewDetails")) {
    store.state.session.hasUnreadReviewDetails = JSON.parse(
      localStorage.getItem("hasUnreadReviewDetails"),
    );
  }
  if (localStorage.getItem("customBootlegger")) {
    const customBootlegger = JSON.parse(
      localStorage.getItem("customBootlegger"),
    );
    store.commit("session/setBootlegger", customBootlegger);
  }
  if (localStorage.getItem("playerAvatar")) {
    const savedAvatar = localStorage.getItem("playerAvatar");
    if (
      savedAvatar === "default.webp" ||
      savedAvatar === "default-townsperson.png" ||
      savedAvatar === "default-townsperson.webp"
    ) {
      localStorage.setItem("playerAvatar", DEFAULT_PLAYER_AVATARS.female);
      localStorage.setItem("playerAvatarSource", "default");
    }
    store.commit(
      "session/updatePlayerAvatar",
      savedAvatar === "default.webp" ||
        savedAvatar === "default-townsperson.png" ||
        savedAvatar === "default-townsperson.webp"
        ? DEFAULT_PLAYER_AVATARS.female
        : savedAvatar,
    );
  }
  if (localStorage.getItem("playerAvatarSource")) {
    store.commit(
      "session/setPlayerAvatarSource",
      localStorage.getItem("playerAvatarSource") === "uploaded"
        ? "uploaded"
        : "default",
    );
  } else if (localStorage.getItem("playerAvatar")) {
    store.commit(
      "session/setPlayerAvatarSource",
      isDefaultPlayerAvatar(localStorage.getItem("playerAvatar"))
        ? "default"
        : "uploaded",
    );
  }
  store.dispatch("refreshDefaultPlayerAvatar", { updateSeat: false });
  if (localStorage.getItem("secretVote")) {
    store.commit(
      "session/setSecretVote",
      JSON.parse(localStorage.getItem("secretVote")),
    );
  }
  if (localStorage.getItem("isRole")) {
    const isRole = JSON.parse(localStorage.getItem("isRole"));
    const role = Object.keys(isRole)[0];
    for (const property in isRole[role]) {
      store.commit("session/setIsRole", {
        role,
        property,
        value: isRole[role][property],
        st: true,
      });
    }
  }
  if (localStorage.getItem("phaseIndex")) {
    store.commit("setPhaseIndex", Number(localStorage.getItem("phaseIndex")));
  }
  // Keep the stored session as a server-validated restore hint. The session
  // module starts empty, so clearing here would discard a valid room before
  // the websocket layer can validate it with the server.
  // listen to mutations
  store.subscribe(({ type, payload }, state) => {
    switch (type) {
      case "toggleGrimoire":
        if (!state.grimoire.isPublic) {
          localStorage.setItem("isGrimoire", 1);
        } else {
          localStorage.removeItem("isGrimoire");
        }
        updatePagetitle(state.grimoire.isPublic);
        break;
      case "toggleMuted":
        if (state.grimoire.isMuted) {
          localStorage.setItem("muted", 1);
        } else {
          localStorage.removeItem("muted");
        }
        break;
      case "toggleStatic":
        if (state.grimoire.isStatic) {
          localStorage.setItem("static", 1);
        } else {
          localStorage.removeItem("static");
        }
        break;
      case "setImageOptIn":
      case "toggleImageOptIn":
        if (state.grimoire.isImageOptIn) {
          localStorage.setItem("imageOptIn", 1);
        } else {
          localStorage.removeItem("imageOptIn");
        }
        store.dispatch("refreshDefaultPlayerAvatar");
        break;
      case "setZoom":
        if (payload !== -2) {
          localStorage.setItem("zoom", payload);
        } else {
          localStorage.removeItem("zoom");
        }
        break;
      case "setSelectedEditions":
        localStorage.setItem("selectedEditions", JSON.stringify(payload));
        break;
      case "setEdition":
        localStorage.setItem("edition", JSON.stringify(payload));
        if (payload.id === "custom" && payload.imageSource !== "server") {
          localStorage.removeItem("imageOptIn");
        }
        if (state.edition.isOfficial) {
          localStorage.removeItem("roles");
        }
        store.dispatch("refreshDefaultPlayerAvatar");
        break;
      case "setCustomRoles":
        if (!payload.length) {
          localStorage.removeItem("roles");
        } else {
          localStorage.setItem("roles", JSON.stringify(payload));
        }
        break;
      case "setStates":
        localStorage.setItem("states", JSON.stringify(payload));
        break;
      case "setTeamsNames":
        localStorage.setItem("teamsNames", JSON.stringify(payload));
        break;
      case "setFirstNight":
        localStorage.setItem("firstNight", JSON.stringify(payload));
        break;
      case "setOtherNight":
        localStorage.setItem("otherNight", JSON.stringify(payload));
        break;
      case "players/setBluff":
      case "players/updateBluff":
        localStorage.setItem(
          "bluffs",
          JSON.stringify(state.players.bluffs.map(({ id }) => id)),
        );
        break;
      case "players/setFabled":
        if (state.players.fabled.length) {
          localStorage.setItem("fabled", JSON.stringify(state.players.fabled));
        } else {
          localStorage.removeItem("fabled");
        }
        break;
      case "players/add":
      case "players/update":
      case "players/remove":
      case "players/clear":
      case "players/set":
      case "players/swap":
      case "players/move":
        if (state.players.players.length) {
          localStorage.setItem(
            "players",
            JSON.stringify(
              state.players.players.map((player) => ({
                ...player,
                // simplify the stored data
                role: player.role.id || {},
              })),
            ),
          );
        } else {
          localStorage.removeItem("players");
        }
        break;
      case "session/setSessionId":
        if (payload) {
          localStorage.setItem(
            "session",
            JSON.stringify([state.session.isSpectator, payload]),
          );
        } else {
          removeRoomStorage();
        }
        break;
      case "session/setPlayerId":
        if (payload) {
          localStorage.setItem("playerId", payload);
        } else {
          localStorage.removeItem("playerId");
        }
        break;
      case "session/setPlayerName":
        if (payload) {
          localStorage.setItem("playerName", payload);
        } else {
          localStorage.removeItem("playerName");
        }
        break;
      case "session/setPlayerGender":
        if (payload) {
          localStorage.setItem("playerGender", payload);
        } else {
          localStorage.removeItem("playerGender");
        }
        break;
      case "session/setPlayerAvatarSource":
        localStorage.setItem(
          "playerAvatarSource",
          payload === "uploaded" ? "uploaded" : "default",
        );
        break;
      case "session/setRoomPassword":
        if (payload) {
          localStorage.setItem("roomPassword", payload);
        } else {
          localStorage.removeItem("roomPassword");
        }
        break;
      case "session/setSavedRoomPasswords":
      case "session/setSavedRoomPassword":
        localStorage.setItem(
          "savedRoomPasswords",
          JSON.stringify(state.session.savedRoomPasswords),
        );
        break;
      case "session/setStId":
        if (payload) {
          localStorage.setItem("stId", payload);
        } else {
          localStorage.removeItem("stId");
        }
        break;
      case "session/claimSeat":
        if (payload >= 0) {
          localStorage.setItem("claimedSeat", payload);
        } else {
          localStorage.removeItem("claimedSeat");
        }
        break;
      case "session/setPlayerVotes":
        if (payload !== 1) {
          localStorage.setItem("playerVotes", JSON.stringify(payload));
        } else {
          localStorage.removeItem("playerVotes");
        }
        break;
      case "session/addVotes": {
        if (payload.save) {
          const votes = localStorage.getItem("votes")
            ? JSON.parse(localStorage.getItem("votes"))
            : [];
          payload.save = false;
          votes.push(payload);
          localStorage.setItem("votes", JSON.stringify(votes));
        }
        break;
      }
      case "session/addVoteSelected": {
        if (payload.save) {
          const votesSelected = localStorage.getItem("votesSelected")
            ? JSON.parse(localStorage.getItem("votesSelected"))
            : [];
          payload.save = false;
          delete payload.players; // players added for conditioning in session
          votesSelected.push(payload);
          localStorage.setItem("votesSelected", JSON.stringify(votesSelected));
        }
        break;
      }
      case "session/clearVoteHistory": {
        if (!localStorage.getItem("votes")) break;
        if (!localStorage.getItem("votesSelected")) break;
        if (!payload || payload.length === 0) {
          localStorage.removeItem("votes");
          localStorage.removeItem("votesSelected");
        } else {
          const votes = JSON.parse(localStorage.getItem("votes"));
          const votesSelected = JSON.parse(
            localStorage.getItem("votesSelected"),
          );
          const newVotes = votes.filter((_, index) => !payload.includes(index));
          const newVotesSelected = votesSelected.filter(
            (_, index) => !payload.includes(index),
          );
          localStorage.setItem("votes", JSON.stringify(newVotes));
          localStorage.setItem(
            "votesSelected",
            JSON.stringify(newVotesSelected),
          );
        }
        break;
      }
      case "session/markNomination":
      case "session/clearNominationNominator":
      case "session/clearNominationNominee":
      case "session/setNominationMarks": {
        localStorage.setItem(
          "nominationMarks",
          JSON.stringify({
            nominatorsByDay: state.session.nominationNominatorsByDay,
            nomineesByDay: state.session.nominationNomineesByDay,
          }),
        );
        break;
      }
      case "session/clearNominationMarks":
        localStorage.removeItem("nominationMarks");
        break;
      case "session/setStorytelling":
        if (payload) {
          localStorage.setItem("isStorytelling", JSON.stringify(true));
        } else {
          localStorage.removeItem("isStorytelling");
        }
        break;
      case "session/setInitialRoleIds":
        if (payload && payload.length) {
          localStorage.setItem("initialRoleIds", JSON.stringify(payload));
        } else {
          localStorage.removeItem("initialRoleIds");
        }
        break;
      case "session/addInitialRoleSnapshot":
        if (state.session.initialRoleIds.length) {
          localStorage.setItem(
            "initialRoleIds",
            JSON.stringify(state.session.initialRoleIds),
          );
        } else {
          localStorage.removeItem("initialRoleIds");
        }
        if (
          state.session.grimoireHistory.initialRoles.length ||
          state.session.grimoireHistory.bluffs.length ||
          state.session.grimoireHistory.events.length
        ) {
          localStorage.setItem(
            "grimoireHistory",
            JSON.stringify(state.session.grimoireHistory),
          );
        }
        break;
      case "session/initializeGrimoireHistory":
      case "session/setGrimoireHistory":
      case "session/appendGrimoireHistoryEvents":
        if (state.session.grimoireHistory.events.length) {
          localStorage.setItem(
            "grimoireHistory",
            JSON.stringify(state.session.grimoireHistory),
          );
        } else if (
          state.session.grimoireHistory.initialRoles.length ||
          state.session.grimoireHistory.bluffs.length
        ) {
          localStorage.setItem(
            "grimoireHistory",
            JSON.stringify(state.session.grimoireHistory),
          );
        } else {
          localStorage.removeItem("grimoireHistory");
        }
        break;
      case "session/clearGrimoireHistory":
        localStorage.removeItem("grimoireHistory");
        break;
      case "session/receiveReviewDetails":
      case "session/setReceivedReviewDetails":
        if (
          state.session.receivedReviewDetails.events.length ||
          state.session.receivedReviewDetails.initialRoles.length ||
          state.session.receivedReviewDetails.bluffs.length
        ) {
          localStorage.setItem(
            "receivedReviewDetails",
            JSON.stringify(state.session.receivedReviewDetails),
          );
        } else {
          localStorage.removeItem("receivedReviewDetails");
        }
        localStorage.setItem(
          "hasUnreadReviewDetails",
          JSON.stringify(state.session.hasUnreadReviewDetails),
        );
        break;
      case "session/markReviewDetailsRead":
        localStorage.setItem(
          "hasUnreadReviewDetails",
          JSON.stringify(state.session.hasUnreadReviewDetails),
        );
        break;
      case "session/clearReceivedReviewDetails":
        localStorage.removeItem("receivedReviewDetails");
        localStorage.removeItem("hasUnreadReviewDetails");
        break;
      case "session/startReview":
        localStorage.setItem("isReview", JSON.stringify(true));
        localStorage.setItem(
          "grimoireHistory",
          JSON.stringify(state.session.grimoireHistory),
        );
        break;
      case "session/startStorytelling":
        localStorage.setItem("isStorytelling", JSON.stringify(true));
        localStorage.setItem(
          "initialRoleIds",
          JSON.stringify(state.session.initialRoleIds),
        );
        break;
      case "session/endStorytelling":
        localStorage.removeItem("isStorytelling");
        localStorage.removeItem("initialRoleIds");
        localStorage.removeItem("grimoireHistory");
        localStorage.removeItem("nominationMarks");
        break;
      case "session/setBootlegger":
        if (payload) {
          localStorage.setItem("customBootlegger", JSON.stringify(payload));
        } else {
          localStorage.removeItem("customBootlegger");
        }
        break;
      case "session/updatePlayerAvatar":
        localStorage.setItem("playerAvatar", payload);
        break;
      case "session/setSecretVote":
        if (payload) {
          localStorage.setItem("secretVote", JSON.stringify(payload));
        } else {
          localStorage.removeItem("secretVote");
        }
        break;
      case "session/setUseOldOrder":
        if (payload)
          localStorage.setItem("useOldOrder", JSON.stringify(payload));
        break;
      case "session/setUseOldRole":
        if (payload)
          localStorage.setItem("useOldRole", JSON.stringify(payload));
        break;
      case "session/setIsReview":
        if (payload) {
          localStorage.setItem("isReview", JSON.stringify(payload));
        } else {
          localStorage.removeItem("isReview");
        }
        break;
      case "session/setIsRole":
        {
          const role = payload.role;
          const property = payload.property;
          const value = payload.value;
          const stored = localStorage.getItem("isRole") ? true : false;
          const isRole = stored
            ? JSON.parse(localStorage.getItem("isRole"))
            : {};
          if (!stored && !!value) {
            // delete when value set to initial, need to pay caution with e.g. []
            isRole[role] = { [property]: value };
          } else if (isRole[role]) {
            if (!value) {
              // delete when value set to initial, need to pay caution with e.g. []
              delete isRole[role][property];
              if (Object.keys(isRole[role]).length === 0) delete isRole[role];
            } else {
              isRole[role][property] = value;
            }
          }
          if (Object.keys(isRole).length === 0) {
            localStorage.removeItem("isRole");
          } else {
            localStorage.setItem("isRole", JSON.stringify(isRole));
          }
        }
        break;
      case "setPhaseIndex":
      case "nextPhase":
      case "previousPhase":
      case "toggleNight":
        localStorage.setItem("phaseIndex", state.grimoire.phaseIndex);
        break;
    }
  });
  // console.log(localStorage);
  // localStorage.clear();
};
