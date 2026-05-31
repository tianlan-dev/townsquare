import Vue from "vue";
import Vuex from "vuex";
import persistence from "./persistence";
import socket from "./socket";
import players from "./modules/players";
import session from "./modules/session";
import editionJSON from "../editions.json";
import rolesJSON from "../roles.json";
import fabledJSON from "../fabled.json";
import jinxesJSON from "../hatred.json";

Vue.use(Vuex);

// helper functions
const isDesktopViewport = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(min-width: 768px)").matches;

const getRolesByEdition = (edition = editionJSON[0]) => {
  if (edition.id === "all") {
    return new Map(
      rolesJSON
        .sort((a, b) => b.team.localeCompare(a.team))
        .map((role) => [role.id, role]),
    );
  }
  return new Map(
    rolesJSON
      .filter((r) => r.edition === edition.id || edition.roles.includes(r.id))
      .sort((a, b) => b.team.localeCompare(a.team))
      .map((role) => [role.id, role]),
  );
};

const getTravelersNotInEdition = (edition = editionJSON[0]) => {
  return new Map(
    rolesJSON
      .filter(
        (r) =>
          r.team === "traveler" &&
          r.edition !== edition.id &&
          !edition.roles.includes(r.id),
      )
      .map((role) => [role.id, role]),
  );
};

const set =
  (key) =>
  ({ grimoire }, val) => {
    grimoire[key] = val;
  };

const toggle =
  (key) =>
  ({ grimoire }, val) => {
    if (val === true || val === false) {
      grimoire[key] = val;
    } else {
      grimoire[key] = !grimoire[key];
    }
  };

const phaseNames = ["夜晚", "黎明", "白天", "黄昏"];

const normalizePhaseIndex = (phaseIndex) => {
  const index = Number.parseInt(phaseIndex, 10);
  return Number.isFinite(index) && index > 0 ? index : 0;
};

const getPhaseInfo = (phaseIndex = 0) => {
  const index = normalizePhaseIndex(phaseIndex);
  const phase = index % phaseNames.length;
  const day = Math.floor(index / phaseNames.length) + 1;
  const isFirstNight = index === 0;
  return {
    index,
    day,
    phase,
    name: phaseNames[phase],
    isNight: phase === 0,
    isFirstNight,
    label: `第${day}天${phaseNames[phase]}${isFirstNight ? "(首夜)" : ""}`,
  };
};

const setPhaseIndex = (grimoire, phaseIndex) => {
  const index = normalizePhaseIndex(phaseIndex);
  const phase = getPhaseInfo(index);
  grimoire.phaseIndex = index;
  grimoire.isNight = phase.isNight;
};

const clean = (id) => id.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

// global data maps
const editionJSONbyId = new Map(
  editionJSON.map((edition) => [edition.id, edition]),
);
const rolesJSONbyId = new Map(rolesJSON.map((role) => [role.id, role]));
const fabled = new Map(fabledJSON.map((role) => [role.id, role]));

// jinxes
let jinxes = {};
try {
  jinxes = new Map(
    jinxesJSON.map(({ id, hatred }) => [
      clean(id),
      new Map(hatred.map(({ id, reason }) => [clean(id), reason])),
    ]),
  );
} catch (e) {
  // Keep the app usable if optional jinx data cannot be parsed.
}

// base definition for custom roles
const customRole = {
  id: "",
  name: "",
  image: "",
  ability: "",
  edition: "custom",
  firstNight: 0,
  firstNightReminder: "",
  otherNight: 0,
  otherNightReminder: "",
  reminders: [],
  remindersGlobal: [],
  jinxes: [],
  setup: false,
  team: "townsfolk",
  isCustom: true,
};

export default new Vuex.Store({
  modules: {
    players,
    session,
  },
  state: {
    version: "3.2.3",
    grimoire: {
      phaseIndex: 0,
      isNight: true,
      isNightOrder: true,
      isPublic: false,
      isMenuOpen: isDesktopViewport(),
      isStatic: false,
      isMuted: false,
      isImageOptIn: false,
      isForwardEvilInfo: false,
      zoom: -2,
    },
    modals: {
      edition: false,
      fabled: false,
      gameState: false,
      nightOrder: false,
      reference: false,
      reminder: false,
      role: false,
      roles: false,
      voteHistory: false,
      input: false,
    },
    edition: editionJSONbyId.get("tb"),
    selectedEditions: {
      tb: true,
      bmr: true,
      snv: true,
      exp: true,
      hdcs: true,
      syyl: true,
    },
    roles: getRolesByEdition(),
    otherTravelers: getTravelersNotInEdition(),
    fabled,
    jinxes,
    states: [],
    teamsNames: {
      townsfolk: "镇民",
      outsider: "外来者",
      minion: "爪牙",
      demon: "恶魔",
    },
    firstNight: [],
    otherNight: [],
    notifications: [],
    mobileRoleInfo: {
      role: null,
      placement: "bottom",
    },
  },
  getters: {
    /**
     * Return all custom roles, with default values and non-essential data stripped.
     * Role object keys will be replaced with a numerical index to conserve bandwidth.
     * @param roles
     * @returns {[]}
     */
    customRolesStripped: ({ roles }) => {
      const customRoles = [];
      const customKeys = Object.keys(customRole);
      const strippedProps = [
        "firstNightReminder",
        "otherNightReminder",
        "isCustom",
      ];
      roles.forEach((role) => {
        if (!role.isCustom) {
          customRoles.push({ id: role.id });
        } else {
          const strippedRole = {};
          for (let prop in role) {
            if (strippedProps.includes(prop)) {
              continue;
            }
            const value = role[prop];
            if (customKeys.includes(prop) && value !== customRole[prop]) {
              strippedRole[customKeys.indexOf(prop)] = value;
            }
          }
          customRoles.push(strippedRole);
        }
      });
      return customRoles;
    },
    rolesJSONbyId: () => rolesJSONbyId,
    phaseInfo: ({ grimoire }) => getPhaseInfo(grimoire.phaseIndex),
    phaseLabelByIndex: () => (phaseIndex) => getPhaseInfo(phaseIndex).label,
  },
  mutations: {
    setZoom: set("zoom"),
    toggleMuted: toggle("isMuted"),
    toggleMenu: toggle("isMenuOpen"),
    setMenuOpen({ grimoire }, isOpen) {
      grimoire.isMenuOpen = isOpen;
    },
    toggleNightOrder: toggle("isNightOrder"),
    toggleStatic: toggle("isStatic"),
    setPhaseIndex({ grimoire }, phaseIndex) {
      setPhaseIndex(grimoire, phaseIndex);
    },
    nextPhase({ grimoire }) {
      setPhaseIndex(grimoire, normalizePhaseIndex(grimoire.phaseIndex) + 1);
    },
    previousPhase({ grimoire }) {
      setPhaseIndex(grimoire, normalizePhaseIndex(grimoire.phaseIndex) - 1);
    },
    toggleNight({ grimoire }, val) {
      const nextIsNight =
        val === true || val === false ? val : !grimoire.isNight;
      const currentIndex = normalizePhaseIndex(grimoire.phaseIndex);
      if (nextIsNight) {
        const nightIndex =
          currentIndex % phaseNames.length === 0
            ? currentIndex
            : (Math.floor(currentIndex / phaseNames.length) + 1) *
              phaseNames.length;
        setPhaseIndex(grimoire, nightIndex);
      } else {
        const dayIndex =
          currentIndex % phaseNames.length === 0
            ? currentIndex + 1
            : currentIndex;
        setPhaseIndex(grimoire, dayIndex);
      }
    },
    toggleGrimoire: toggle("isPublic"),
    setImageOptIn: set("isImageOptIn"),
    toggleImageOptIn: toggle("isImageOptIn"),
    toggleForwardEvilInfo: toggle("isForwardEvilInfo"),
    addNotification(state, notification) {
      state.notifications.push(notification);
    },
    removeNotification(state, id) {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== id,
      );
    },
    showMobileRoleInfo(state, payload) {
      const role = payload && payload.role ? payload.role : payload;
      const placement =
        payload && payload.placement ? payload.placement : "bottom";
      state.mobileRoleInfo.role = role || null;
      state.mobileRoleInfo.placement = placement;
    },
    hideMobileRoleInfo(state) {
      state.mobileRoleInfo.role = null;
    },
    toggleModal(state, name) {
      const { modals } = state;
      state.mobileRoleInfo.role = null;
      state.mobileRoleInfo.placement = "bottom";
      if (modals.input) this.state.session.isTyping = false;
      if (name) {
        modals[name] = !modals[name];
      }
      for (let modal in modals) {
        if (modal === name) continue;
        modals[modal] = false;
      }
    },
    /**
     * Store custom roles
     * @param state
     * @param roles Array of role IDs or full role definitions
     */
    setCustomRoles(state, roles) {
      const oldRoles = Object.keys(state.session.isUseOldRole).filter(
        (key) => state.session.isUseOldRole[key] === true,
      );
      roles = roles.map((role) => {
        return oldRoles.includes(role.id)
          ? { ...role, id: role.id + "old1" }
          : role; // use role if not ticked, add old1 if ticked
      });
      const processedRoles = roles
        // replace numerical role object keys with matching key names
        .map((role) => {
          if (role[0]) {
            const customKeys = Object.keys(customRole);
            const mappedRole = {};
            for (let prop in role) {
              if (customKeys[prop]) {
                mappedRole[customKeys[prop]] = role[prop];
              }
            }
            return mappedRole;
          } else {
            return role;
          }
        })
        // clean up role.id
        .map((role) => {
          role.id = clean(role.id);
          return role;
        })
        // map existing roles to base definition or pre-populate custom roles to ensure all properties
        .map(
          (role) =>
            rolesJSONbyId.get(role.id) ||
            state.roles.get(role.id) ||
            Object.assign({}, customRole, role),
        )
        // default empty icons and placeholders, clean up firstNight / otherNight
        .map((role) => {
          if (rolesJSONbyId.get(role.id)) return role;
          role.imageAlt = // map team to generic icon
            {
              townsfolk: "good",
              outsider: "outsider",
              minion: "minion",
              demon: "evil",
              fabled: /^bootlegger\d+$/.test(role.id) ? "bootlegger" : "fabled", // 直接使用私货商人图标
              loric: /^bootlegger\d+$/.test(role.id) ? "bootlegger" : "loric",
            }[role.team] || "custom";
          role.firstNight = Math.abs(role.firstNight);
          role.otherNight = Math.abs(role.otherNight);
          return role;
        })
        // filter out roles that don't match an existing role and also don't have name/ability/team
        .filter((role) => role.name && role.ability && role.team)
        // sort by team
        .sort((a, b) => b.team.localeCompare(a.team));
      // convert to Map without Fabled
      state.roles = new Map(
        processedRoles
          .filter((role) => role.team !== "fabled" && role.team !== "loric")
          .map((role) => {
            if (role.team === "traveller") role.team = "traveler";
            return role;
          })
          .map((role) => [role.id, role]),
      );
      // update Fabled to include custom Fabled from this script
      state.fabled = new Map([
        ...processedRoles
          .filter((r) => r.team === "fabled" || r.team === "loric")
          .map((r) => [r.id, r]),
        ...fabledJSON.map((role) => [role.id, role]),
      ]);
      // update extraTravelers map to only show travelers not in this script
      state.otherTravelers = new Map(
        rolesJSON
          .filter(
            (r) => r.team === "traveler" && !roles.some((i) => i.id === r.id),
          )
          .map((role) => [role.id, role]),
      );
    },
    setSelectedEditions(state, selectedEditions) {
      state.selectedEditions = { ...selectedEditions };
      if (state.edition.id === "all") this.commit("setEdition", state.edition);
    },
    setStates(state, states) {
      state.states = states;
    },
    setTeamsNames(state, names) {
      state.teamsNames = names;
    },
    setFirstNight(state, firstNight) {
      state.firstNight = firstNight;
      this.commit("players/setFirstNight", firstNight);
    },
    setOtherNight(state, otherNight) {
      state.otherNight = otherNight;
      this.commit("players/setOtherNight", otherNight);
    },
    setEdition(state, edition) {
      if (editionJSONbyId.has(edition.id)) {
        state.edition = editionJSONbyId.get(edition.id);
        state.roles = getRolesByEdition(state.edition);
        if (state.edition.id === "all") {
          //只加载勾选了的剧本
          state.roles = new Map(
            Array.from(state.roles.entries()).filter((role) => {
              const value = role[1]; //value of the role
              return state.selectedEditions[value.edition];
            }),
          );
        }
        state.otherTravelers = getTravelersNotInEdition(state.edition);
        const fabled = Array.from(state.fabled.values()).filter((role) => {
          return role.edition === edition.id;
        });
        if (!state.session.isSpectator)
          this.commit("players/setFabled", { fabled });
      } else {
        state.edition = edition;
        if (edition.id === "custom" && edition.imageSource !== "server") {
          state.grimoire.isImageOptIn = false;
        }
      }
      // 为官方角色增加原顺序选项
      if (state.roles.get("professor")) {
        state.roles.get("professor").otherNight = state.session.isUseOldOrder
          .professor
          ? 79
          : 96;
      }
      if (state.roles.get("pithag")) {
        state.roles.get("pithag").otherNight = state.session.isUseOldOrder
          .pithag
          ? 37
          : 16;
      }
      state.modals.edition = false;
    },
  },
  actions: {},
  plugins: [persistence, socket],
});
