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
  "session/appendGrimoireHistoryEvents",
  "session/removeGrimoireHistoryEvent",
  "session/clearGrimoireHistory",
  "session/receiveReviewDetails",
  "session/setReceivedReviewDetails",
  "session/clearReceivedReviewDetails",
  "session/markReviewDetailsRead",
  "session/startReview",
]);

const reminderKey = (reminder = {}) =>
  `${String(reminder.role || "")}\u0000${String(reminder.name || "")}`;

const normalizeReminder = (reminder = {}) => ({
  role: String(reminder.role || ""),
  name: String(reminder.name || ""),
});

const roleIdOf = (player = {}) => String((player.role && player.role.id) || "");

const snapshotPlayers = (players = []) =>
  players.map((player) => ({
    roleId: roleIdOf(player),
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

const seatRemovedEvents = (mutation, before, after, phaseIndex) => {
  if (after.players.length >= before.players.length) return [];

  const removedSeat = Number(mutation.payload);
  if (mutation.type === "players/remove" && Number.isFinite(removedSeat)) {
    return [
      {
        type: "seatRemoved",
        phaseIndex,
        seat: removedSeat + 1,
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
        reminder,
      });
    });
    reminders.removed.forEach((reminder) => {
      events.push({
        type: "reminderRemoved",
        phaseIndex,
        seat,
        reminder,
      });
    });

    if (previous.isDead !== current.isDead) {
      events.push({
        type: "deathChanged",
        phaseIndex,
        seat,
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

const eventFromVote = (payload, phaseIndex) => {
  if (!payload) return null;
  return {
    type: "nomination",
    phaseIndex,
    vote: {
      nominator: payload.nominator || "",
      nominee: payload.nominee || "",
      type: payload.type || "",
      mode: payload.mode || "",
      votes: Number(payload.votes) || 0,
      majority: Number(payload.majority) || 0,
      votedPlayers: Array.isArray(payload.votedPlayers)
        ? payload.votedPlayers.map(String)
        : [],
    },
  };
};

const initialRoleSnapshots = (state) =>
  state.session.initialRoleIds.map((entry, index) => ({
    seat: Number(entry.seat) || index + 1,
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
      });
      previous = snapshot(state);
      return;
    }

    if (mutation.type === "session/endStorytelling") {
      if (!state.session.isSpectator) {
        store.commit("session/clearGrimoireHistory");
      }
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
        store.commit("session/appendGrimoireHistoryEvents", events);
      }
      previous = current;
      return;
    }

    if (mutation.type === "session/addVotes") {
      const event = eventFromVote(mutation.payload, state.grimoire.phaseIndex);
      if (event) {
        store.commit("session/appendGrimoireHistoryEvents", [event]);
      }
    }

    previous = snapshot(state);
  });
}
