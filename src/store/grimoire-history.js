const trackedPlayerMutations = new Set([
  "players/add",
  "players/remove",
  "players/set",
  "players/clear",
  "players/swap",
  "players/move",
  "players/update",
]);

const ignoredMutations = new Set([
  "session/initializeGrimoireHistory",
  "session/setGrimoireHistory",
  "session/setGrimoireHistoryRecords",
  "session/appendGrimoireHistoryEvents",
  "session/mergeGrimoireHistoryRoleCatalog",
  "session/removeGrimoireHistoryEvent",
  "session/clearGrimoireHistory",
  "session/deleteGrimoireHistoryRecord",
  "session/receiveReviewDetails",
  "session/setReceivedReviewDetails",
  "session/setReceivedReviewDetailsRecords",
  "session/clearReceivedReviewDetails",
  "session/deleteReceivedReviewDetailsRecord",
  "session/markReviewDetailsRead",
  "session/startReview",
]);

const reminderKey = (reminder = {}) =>
  `${String(reminder.role || "")}\u0000${String(reminder.name || "")}`;

const normalizeReminder = (reminder = {}) => ({
  role: String(reminder.role || ""),
  name: String(reminder.name || ""),
});

const isCustomReminder = (reminder = {}) => reminder.role === "custom";

const roleIdOf = (player = {}) => String((player.role && player.role.id) || "");

const roleCatalogEntry = (role = {}) => {
  const id = String(role.id || "");
  if (!id) return null;
  return {
    id,
    name: String(role.name || ""),
    team: String(role.team || ""),
  };
};

const addRoleToCatalog = (catalog, role = {}) => {
  const entry = roleCatalogEntry(role);
  if (!entry) return;
  const current = catalog[entry.id] || { id: entry.id, name: "", team: "" };
  catalog[entry.id] = {
    id: entry.id,
    name: current.name || entry.name,
    team: current.team || entry.team,
  };
};

const roleInfoById = (state, getters, roleId = "") => {
  const id = String(roleId || "");
  if (!id) return null;
  return (
    state.roles.get(id) ||
    getters.rolesJSONbyId.get(id) || {
      id,
    }
  );
};

const addRoleIdToCatalog = (
  catalog,
  state,
  getters,
  roleId = "",
  role = {},
) => {
  const id = String(roleId || (role && role.id) || "");
  if (!id) return;
  addRoleToCatalog(
    catalog,
    role && role.id ? role : roleInfoById(state, getters, id),
  );
};

const roleCatalogForCurrentSetup = (state, getters) => {
  const catalog = {};
  state.players.players.forEach((player) =>
    addRoleToCatalog(catalog, player.role),
  );
  state.players.bluffs.forEach((role) => addRoleToCatalog(catalog, role));
  state.session.initialRoleIds.forEach((entry) =>
    addRoleIdToCatalog(catalog, state, getters, entry.roleId),
  );
  return catalog;
};

const snapshotPlayers = (players = []) =>
  players.map((player) => ({
    name: String(player.name || ""),
    roleId: roleIdOf(player),
    role: roleCatalogEntry(player.role),
    reminders: Array.isArray(player.reminders)
      ? player.reminders.map(normalizeReminder)
      : [],
    isDead: !!player.isDead,
  }));

const reminderDiff = (before = [], after = []) => {
  const remainingBefore = before.map(normalizeReminder);
  const added = [];

  after.map(normalizeReminder).forEach((reminder) => {
    const index = remainingBefore.findIndex(
      (candidate) => reminderKey(candidate) === reminderKey(reminder),
    );
    if (index >= 0) {
      remainingBefore.splice(index, 1);
    } else {
      added.push(reminder);
    }
  });

  return {
    added,
    removed: remainingBefore,
  };
};

const snapshot = (state) => ({
  phaseIndex: state.grimoire.phaseIndex,
  players: snapshotPlayers(state.players.players),
});

const seatInfoFromSnapshot = (player = {}, seat) => ({
  seat: Number(seat) || 0,
  playerName: String(player.name || ""),
  roleId: String(player.roleId || ""),
});

const seatRemovedEvents = (mutation, before, after, phaseIndex) => {
  if (after.players.length >= before.players.length) return [];

  const removedSeat = Number(mutation.payload);
  if (mutation.type === "players/remove" && Number.isFinite(removedSeat)) {
    return [
      {
        type: "seatRemoved",
        phaseIndex,
        seat: removedSeat + 1,
        seatInfo: seatInfoFromSnapshot(
          before.players[removedSeat],
          removedSeat + 1,
        ),
      },
    ];
  }

  const events = [];
  for (
    let index = after.players.length;
    index < before.players.length;
    index++
  ) {
    events.push({
      type: "seatRemoved",
      phaseIndex,
      seat: index + 1,
      seatInfo: seatInfoFromSnapshot(before.players[index], index + 1),
    });
  }
  return events;
};

const seatAddedEvents = (before, after, phaseIndex) => {
  if (after.players.length <= before.players.length) return [];

  const events = [];
  for (
    let index = before.players.length;
    index < after.players.length;
    index++
  ) {
    events.push({
      type: "seatAdded",
      phaseIndex,
      seat: index + 1,
      seatInfo: seatInfoFromSnapshot(after.players[index], index + 1),
    });
  }
  return events;
};

const changedSeatEvents = (before, after, phaseIndex) => {
  const events = [];
  const comparableSeats = Math.min(before.players.length, after.players.length);

  for (let index = 0; index < comparableSeats; index++) {
    const previous = before.players[index];
    const current = after.players[index];
    const seat = index + 1;

    if (previous.roleId !== current.roleId) {
      events.push({
        type: "roleChanged",
        phaseIndex,
        seat,
        seatInfo: seatInfoFromSnapshot(current, seat),
        fromRoleId: previous.roleId,
        toRoleId: current.roleId,
      });
    }

    const reminders = reminderDiff(previous.reminders, current.reminders);
    reminders.added.forEach((reminder) => {
      events.push({
        type: "reminderAdded",
        phaseIndex,
        seat,
        seatInfo: seatInfoFromSnapshot(current, seat),
        reminder,
      });
    });
    reminders.removed
      .filter((reminder) => !isCustomReminder(reminder))
      .forEach((reminder) => {
        events.push({
          type: "reminderRemoved",
          phaseIndex,
          seat,
          seatInfo: seatInfoFromSnapshot(current, seat),
          reminder,
        });
      });

    if (previous.isDead !== current.isDead) {
      events.push({
        type: "deathChanged",
        phaseIndex,
        seat,
        seatInfo: seatInfoFromSnapshot(current, seat),
        isDead: current.isDead,
      });
    }
  }

  return events;
};

const eventsFromPlayerMutation = (mutation, before, after) => {
  const phaseIndex = after.phaseIndex;
  return [
    ...seatAddedEvents(before, after, phaseIndex),
    ...seatRemovedEvents(mutation, before, after, phaseIndex),
    ...changedSeatEvents(before, after, phaseIndex),
  ];
};

const roleCatalogForEvents = (state, getters, events = [], before, after) => {
  const catalog = roleCatalogForCurrentSetup(state, getters);
  const snapshots = [...before.players, ...after.players];
  const addRoleId = (roleId = "") => {
    const snapshot = snapshots.find((player) => player.roleId === roleId);
    addRoleIdToCatalog(
      catalog,
      state,
      getters,
      roleId,
      snapshot && snapshot.role,
    );
  };

  events.forEach((event = {}) => {
    if (event.fromRoleId) addRoleId(event.fromRoleId);
    if (event.toRoleId) addRoleId(event.toRoleId);
    if (event.seatInfo && event.seatInfo.roleId) addRoleId(event.seatInfo.roleId);
    if (event.reminder && event.reminder.role) addRoleId(event.reminder.role);
    const vote = event.vote || {};
    ["nominatorSeatInfo", "nomineeSeatInfo"].forEach((key) => {
      if (vote[key] && vote[key].roleId) addRoleId(vote[key].roleId);
    });
    if (Array.isArray(vote.votedSeatInfos)) {
      vote.votedSeatInfos.forEach((seatInfo = {}) => addRoleId(seatInfo.roleId));
    }
  });

  return catalog;
};

const eventFromVote = (payload, phaseIndex) => {
  if (!payload) return null;
  return {
    type: "nomination",
    phaseIndex,
    vote: {
      nominator: payload.nominator || "",
      nominatorSeatInfo: payload.nominatorSeatInfo || null,
      nominee: payload.nominee || "",
      nomineeSeatInfo: payload.nomineeSeatInfo || null,
      type: payload.type || "",
      mode: payload.mode || "",
      votes: Number(payload.votes) || 0,
      majority: Number(payload.majority) || 0,
      votedPlayers: Array.isArray(payload.votedPlayers)
        ? payload.votedPlayers.map(String)
        : [],
      votedSeatInfos: Array.isArray(payload.votedSeatInfos)
        ? payload.votedSeatInfos
        : [],
    },
  };
};

const initialRoleSnapshots = (state) =>
  state.session.initialRoleIds.map((entry, index) => ({
    seat: Number(entry.seat) || index + 1,
    playerName: String(
      (state.players.players[(Number(entry.seat) || index + 1) - 1] || {})
        .name || "",
    ),
    roleId: String(entry.roleId || ""),
  }));

const bluffSnapshots = (state) =>
  state.players.bluffs.map((role) => ({
    roleId: String((role && role.id) || ""),
  }));

export default function grimoireHistoryPlugin(store) {
  let previous = snapshot(store.state);

  store.subscribe((mutation, state) => {
    if (ignoredMutations.has(mutation.type)) {
      previous = snapshot(state);
      return;
    }

    if (mutation.type === "session/startStorytelling") {
      store.commit("session/initializeGrimoireHistory", {
        initialRoles: initialRoleSnapshots(state),
        bluffs: bluffSnapshots(state),
        phaseIndex: state.grimoire.phaseIndex,
        roleCatalog: roleCatalogForCurrentSetup(state, store.getters),
      });
      previous = snapshot(state);
      return;
    }

    const shouldRecord =
      !state.session.isSpectator && state.session.isStorytelling;
    if (!shouldRecord) {
      previous = snapshot(state);
      return;
    }

    if (trackedPlayerMutations.has(mutation.type)) {
      const current = snapshot(state);
      const events = eventsFromPlayerMutation(mutation, previous, current);
      if (events.length) {
        store.commit("session/appendGrimoireHistoryEvents", {
          events,
          roleCatalog: roleCatalogForEvents(
            state,
            store.getters,
            events,
            previous,
            current,
          ),
        });
      }
      previous = current;
      return;
    }

    if (
      mutation.type === "players/setBluff" ||
      mutation.type === "players/updateBluff"
    ) {
      store.commit(
        "session/mergeGrimoireHistoryRoleCatalog",
        roleCatalogForCurrentSetup(state, store.getters),
      );
      previous = snapshot(state);
      return;
    }

    if (mutation.type === "session/addVotes") {
      const event = eventFromVote(mutation.payload, state.grimoire.phaseIndex);
      if (event) {
        store.commit("session/appendGrimoireHistoryEvents", {
          events: [event],
          roleCatalog: roleCatalogForCurrentSetup(state, store.getters),
        });
      }
    }

    previous = snapshot(state);
  });
}
