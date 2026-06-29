<template>
  <div
    id="townsquare"
    class="square"
    :class="{
      public: grimoire.isPublic,
      spectator: session.isSpectator,
      vote: session.nomination,
    }"
  >
    <audio
      src="../assets/sounds/countdown.mp3"
      preload="auto"
      ref="countdownAudio"
    ></audio>
    <ul class="circle" :class="['size-' + players.length]" :style="orientation">
      <Player
        v-for="(player, index) in players"
        :key="index"
        :player="player"
        :is-active-menu="activePlayerMenu === index"
        :is-selecting-nominee="nominate > -1"
        @menu-open="activePlayerMenu = index"
        @trigger="handleTrigger(index, $event)"
        :class="{
          from: Math.max(swap, move, nominate) === index,
          swap: swap > -1,
          move: move > -1,
          nominate: nominate > -1,
        }"
      ></Player>
    </ul>

    <div
      class="role-side-panel"
      v-if="hasRolePanel"
      :class="{ closed: !isRolePanelOpen }"
    >
      <button
        type="button"
        class="role-panel-toggle"
        :aria-label="isRolePanelOpen ? '最小化角色区域' : '恢复角色区域'"
        @click.stop="toggleRolePanel"
      >
        <font-awesome-icon
          :icon="isRolePanelOpen ? 'window-minimize' : 'window-maximize'"
        />
      </button>

      <div v-if="isRolePanelOpen" class="role-tabs">
        <button
          v-if="hasFabledPanel"
          type="button"
          :class="{ active: activeRolePanel === 'fabled' }"
          @click="setRolePanel('fabled')"
        >
          传奇角色
        </button>
        <button
          v-if="hasBluffsPanel"
          type="button"
          :class="{ active: activeRolePanel === 'bluffs' }"
          @click="setRolePanel('bluffs')"
        >
          不在场伪装
        </button>
      </div>

      <div
        v-if="isRolePanelOpen && activeRolePanel === 'fabled'"
        class="panel-body fabled-panel"
      >
        <h3>
          <span class="panel-actions">
            <button
              v-if="!session.isSpectator"
              type="button"
              class="panel-action"
              aria-label="添加传奇角色"
              @click.stop="openFabledModal"
            >
              <font-awesome-icon icon="plus-circle" />
            </button>
          </span>
        </h3>
        <ul>
          <li
            v-for="(role, index) in fabled"
            :key="index"
            :class="{ 'is-storyteller-token': role.id === 'storyteller' }"
            v-mobile-long-press-role="roleInfo(role)"
            @click.stop="removeFabled(index)"
            :style="floatingZoom"
          >
            <div class="night-order current" v-if="currentNightOrder(role)">
              <em>{{ currentNightOrder(role) }}</em>
            </div>
            <Token :role="roleInfo(role)"></Token>
          </li>
        </ul>
      </div>

      <div
        v-if="isRolePanelOpen && activeRolePanel === 'bluffs'"
        class="panel-body bluffs-panel"
        ref="bluffs"
      >
        <ul>
          <li
            v-for="index in bluffSize"
            :key="index"
            v-mobile-long-press-role="bluffs[index - 1]"
            @click.stop="openRoleModal(index * -1)"
            :style="floatingZoom"
          >
            <Token :role="bluffs[index - 1]"></Token>
          </li>
        </ul>
      </div>
    </div>
    <div v-if="session.isSpectator && isRole.length > 0" class="is-role">
      <font-awesome-icon
        :icon="['custom', isRole]"
        size="4x"
        :class="{ 'is-using-wraith': session.isRole.wraith.using }"
        @click="setUsingWraith()"
      />
    </div>

    <ReminderModal :player-index="selectedPlayer"></ReminderModal>
    <RoleModal :player-index="selectedPlayer"></RoleModal>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import Player from "./Player";
import Token from "./Token";
import ReminderModal from "./modals/ReminderModal";
import RoleModal from "./modals/RoleModal";

export default {
  components: {
    Player,
    Token,
    RoleModal,
    ReminderModal,
  },
  computed: {
    ...mapGetters({ nightOrder: "players/nightOrder", phaseInfo: "phaseInfo" }),
    ...mapState(["grimoire", "roles", "session"]),
    ...mapState("players", ["players", "bluffs", "fabled"]),
    currentNightType: function () {
      if (!this.phaseInfo.isNight) return "";
      return this.phaseInfo.isFirstNight ? "first" : "other";
    },
    orientation: function () {
      const ratio = this.windowWidth / this.windowHeight;
      const unit =
        this.windowWidth > this.windowHeight
          ? "height: 100%;"
          : "height: " + ratio * 100 + "%;";
      return unit;
    },
    floatingZoom: function () {
      const ratio = this.windowWidth / this.windowHeight;
      const size = ratio > 1 ? 12 : this.windowWidth < 480 ? 4.8 : 7;
      return "height: " + size + "vh; width: " + size + "vh;";
    },
    hasBluffsPanel: function () {
      return (
        !this.grimoire.isPublic &&
        (!!this.session.sessionId || this.players.length > 0)
      );
    },
    hasFabledPanel: function () {
      return this.fabled.length > 0;
    },
    hasRolePanel: function () {
      return this.hasFabledPanel || this.hasBluffsPanel;
    },
    activeRolePanel: function () {
      if (this.rolePanel === "fabled" && this.hasFabledPanel) return "fabled";
      if (this.rolePanel === "bluffs" && this.hasBluffsPanel) return "bluffs";
      if (this.hasFabledPanel) return "fabled";
      if (this.hasBluffsPanel) return "bluffs";
      return "";
    },
    isRole: function () {
      const activeRoles = [];
      for (const roleId in this.session.isRole) {
        const roleObject = this.session.isRole[roleId];
        if (roleObject.active === true) {
          activeRoles.push(roleId);
        }
      }
      if (activeRoles.length > 1) {
        return activeRoles.slice(0, 1);
      }
      return activeRoles;
    },
  },
  data() {
    return {
      selectedPlayer: 0,
      activePlayerMenu: -1,
      bluffSize: 3,
      swap: -1,
      move: -1,
      nominate: -1,
      isRolePanelOpen: true,
      rolePanel: "fabled",
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
  },
  watch: {
    "session.isVoteInProgress": {
      handler() {
        this.$nextTick(() => {
          if (this.session.isVoteInProgress && !this.session.lockedVote) {
            if (!this.grimoire.isMuted) {
              this.$refs.countdownAudio.currentTime = 0;
              this.$refs.countdownAudio.play();
            }
          } else {
            this.$refs.countdownAudio.pause();
            this.$refs.countdownAudio.currentTime = 0;
          }
        });
      },
    },
  },
  mounted() {
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("click", this.closePlayerMenu);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("click", this.closePlayerMenu);
  },
  methods: {
    toggleRolePanel() {
      this.isRolePanelOpen = !this.isRolePanelOpen;
    },
    setRolePanel(panel) {
      this.rolePanel = panel;
    },
    currentNightOrder(role) {
      if (!this.currentNightType) return 0;
      return (this.nightOrder.get(role) || {})[this.currentNightType] || 0;
    },
    currentNightReminder(role) {
      if (this.currentNightType === "first") {
        return role.firstNightReminder;
      }
      if (this.currentNightType === "other") {
        return role.otherNightReminder;
      }
      return "";
    },
    roleInfo(role) {
      const sections = [];
      if (role.ability) {
        sections.push({
          label: "",
          text: role.ability,
        });
      }
      const nightReminder = this.currentNightReminder(role);
      if (nightReminder) {
        sections.push({
          label: this.currentNightType === "first" ? "首夜提示" : "其他夜提示",
          text: nightReminder,
        });
      }
      return {
        ...role,
        ability: sections.length
          ? sections.map(({ text }) => text).join("\n")
          : role.ability,
        tooltipSections: sections,
      };
    },
    openFabledModal() {
      if (this.session.isSpectator) return;
      this.$store.commit("toggleModal", "fabled");
    },
    removeFabled(index) {
      if (this.session.isSpectator) {
        return;
      }
      this.$store.commit("players/setFabled", { index });
    },
    closePlayerMenu() {
      this.activePlayerMenu = -1;
    },
    handleTrigger(playerIndex, [method, params]) {
      if (typeof this[method] === "function") {
        this[method](playerIndex, params);
      }
    },
    async showInputModal({ inputType, inputModal, inputData }) {
      return new Promise((resolve, reject) => {
        this.$store.commit("session/setInputResolver", resolve);
        this.$store.commit("session/setInputRejecter", reject);
        this.$store.commit("session/setInputType", inputType);
        this.$store.commit("session/setInputModal", inputModal);
        this.$store.commit("session/setInputData", inputData);
        this.$store.commit("toggleModal", "input");
      });
    },
    nominationKey(playerIndex) {
      const player = this.players[playerIndex];
      return player && player.id
        ? `player:${player.id}`
        : `seat:${playerIndex + 1}`;
    },
    nominationDayKey() {
      return String(this.phaseInfo.day);
    },
    hasNominatedToday(playerIndex) {
      const nominations =
        this.session.nominationNominatorsByDay[this.nominationDayKey()] || [];
      return nominations.includes(this.nominationKey(playerIndex));
    },
    hasBeenNominatedToday(playerIndex) {
      const nominations =
        this.session.nominationNomineesByDay[this.nominationDayKey()] || [];
      return nominations.includes(this.nominationKey(playerIndex));
    },
    async confirmNominationOverride(messages) {
      if (!messages.length) return true;
      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: messages,
          length: 1,
          placeholder: [""],
        },
      }).catch(() => null);
      return confirm === true;
    },
    handleResize() {
      this.windowWidth = window.innerWidth;
      this.windowHeight = window.innerHeight;
    },
    claimSeat(playerIndex) {
      if (!this.session.isSpectator) return;
      if (!this.session.isStorytellerOnline) return;
      if (this.session.playerId === this.players[playerIndex].id) {
        this.$store.commit("session/claimSeat", -1);
      } else {
        this.$store.commit("session/claimSeat", playerIndex);
      }
    },
    openReminderModal(playerIndex) {
      this.selectedPlayer = playerIndex;
      this.$store.commit("toggleModal", "reminder");
    },
    openRoleModal(playerIndex) {
      const player = this.players[playerIndex];
      if (this.session.isSpectator && player && player.role.team === "traveler")
        return;
      this.selectedPlayer = playerIndex;
      this.$store.commit("toggleModal", "role");
    },
    removePlayer(playerIndex) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      const { nomination } = this.session;
      if (nomination) {
        if (nomination.includes(playerIndex)) {
          // abort vote if removed player is either nominator or nominee
          this.$store.commit("session/nomination");
        } else if (nomination[0] > playerIndex || nomination[1] > playerIndex) {
          // update nomination array if removed player has lower index
          this.$store.commit("session/setNomination", [
            nomination[0] > playerIndex ? nomination[0] - 1 : nomination[0],
            nomination[1] > playerIndex ? nomination[1] - 1 : nomination[1],
          ]);
        }
      }
      this.$store.commit("players/remove", playerIndex);
    },
    clearPlayerAvatar(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      if (!player || !player.id || player.id === "host") return;
      this.$store.commit("session/requestDefaultAvatar", player);
      this.activePlayerMenu = -1;
    },
    async sendSeatTypeInfo(playerIndex) {
      if (this.session.isSpectator) return;
      const sourcePlayer = this.players[playerIndex];
      if (!sourcePlayer || !sourcePlayer.role || !sourcePlayer.role.team) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["该座位还没有分配角色，无法发送阵营信息。"],
          },
        }).catch(() => null);
        return;
      }

      const input = await this.showInputModal({
        inputType: "seatNum",
        inputModal: "input",
        inputData: {
          name: ["请输入接收信息的座位号"],
          length: 1,
          placeholder: [""],
        },
      }).catch(() => null);
      if (input === null) return;

      const targetSeat = Number(input[0]);
      const targetIndex = targetSeat - 1;
      const targetPlayer = this.players[targetIndex];
      if (
        !Number.isInteger(targetSeat) ||
        targetIndex < 0 ||
        targetIndex >= this.players.length
      ) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["座位号无效。"],
          },
        }).catch(() => null);
        return;
      }
      if (!targetPlayer || !targetPlayer.id || targetPlayer.id === "host") {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["目标座位没有玩家，无法发送。"],
          },
        }).catch(() => null);
        return;
      }

      this.$store.commit("session/distributeSeatTypeInfo", {
        val: true,
        sourceIndex: playerIndex,
        targetSeat,
      });
      setTimeout(
        (() => {
          this.$store.commit("session/distributeSeatTypeInfo", { val: false });
        }).bind(this),
        2000,
      );
      this.activePlayerMenu = -1;
    },
    swapPlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.swap = from;
      } else {
        if (this.session.nomination) {
          // update nomination if one of the involved players is swapped
          const swapTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map((nom) => {
            if (nom === this.swap) return swapTo;
            if (nom === swapTo) return this.swap;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.$store.commit("session/setNomination", updatedNomination);
          }
        }
        this.$store.commit("players/swap", [
          this.swap,
          this.players.indexOf(to),
        ]);
        this.cancel();
      }
    },
    movePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.move = from;
      } else {
        if (this.session.nomination) {
          // update nomination if it is affected by the move
          const moveTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map((nom) => {
            if (nom === this.move) return moveTo;
            if (nom > this.move && nom <= moveTo) return nom - 1;
            if (nom < this.move && nom >= moveTo) return nom + 1;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.$store.commit("session/setNomination", updatedNomination);
          }
        }
        this.$store.commit("players/move", [
          this.move,
          this.players.indexOf(to),
        ]);
        this.cancel();
      }
    },
    async nominatePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (!this.phaseInfo.isDay) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["只有白天阶段才能进行提名和投票操作。"],
          },
        }).catch(() => null);
        return;
      }
      if (to === undefined) {
        this.cancel();
        const warnings = [];
        if (this.players[from] && this.players[from].isDead) {
          warnings.push("该玩家已死亡，是否继续？");
        }
        if (this.hasNominatedToday(from)) {
          warnings.push("该玩家今天已提名，是否继续？");
        }
        if (
          from !== this.nominate &&
          (await this.confirmNominationOverride(warnings))
        ) {
          this.nominate = from;
        }
      } else {
        const nomineeIndex = this.players.indexOf(to);
        if (nomineeIndex < 0 || this.nominate < 0) return;
        const warnings = this.hasBeenNominatedToday(nomineeIndex)
          ? ["该玩家今天已被提名过，是否继续？"]
          : [];
        if (!(await this.confirmNominationOverride(warnings))) return;
        const nomination = [this.nominate, nomineeIndex];
        this.$store.commit("session/nomination", {
          nomination,
          day: this.phaseInfo.day,
        });
        this.cancel();
      }
    },
    clearNominatedByPlayer(playerIndex) {
      if (this.session.isSpectator) return;
      this.$store.commit("session/clearNominationNominator", {
        day: this.phaseInfo.day,
        key: this.nominationKey(playerIndex),
      });
    },
    clearNominatedPlayer(playerIndex) {
      if (this.session.isSpectator) return;
      this.$store.commit("session/clearNominationNominee", {
        day: this.phaseInfo.day,
        key: this.nominationKey(playerIndex),
      });
    },
    cancel() {
      this.move = -1;
      this.swap = -1;
      this.nominate = -1;
    },
    addVote(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      const vote = player.votes + 1;
      this.$store.commit("players/update", {
        player,
        property: "votes",
        value: vote,
      });
    },
    subtractVote(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      const vote = player.votes - 1;
      if (vote < 1) return;
      this.$store.commit("players/update", {
        player,
        property: "votes",
        value: vote,
      });
    },
    setStoryTeller(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      if (player.id) {
        if (player.id != "host") return;
        this.$store.commit("players/update", {
          player,
          property: "id",
          value: "",
        });
        this.$store.commit("players/update", {
          player,
          property: "name",
          value: "",
        });
        this.$store.commit("players/update", {
          player,
          property: "isVoteless",
          value: false,
        });
        this.$store.commit("players/update", {
          player,
          property: "isDead",
          value: false,
        });
      } else {
        this.$store.commit("players/update", {
          player,
          property: "id",
          value: "host",
        });
        this.$store.commit("players/update", {
          player,
          property: "name",
          value: this.session.playerName || "说书人",
        });
        this.$store.commit("players/update", {
          player,
          property: "isVoteless",
          value: true,
        });
        this.$store.commit("players/update", {
          player,
          property: "isDead",
          value: true,
        });
      }
    },
    setUsingWraith() {
      const usingWraith = this.session.isRole.wraith.using;
      this.$store.commit("session/setIsRole", {
        role: "wraith",
        property: "using",
        value: !usingWraith,
      });
    },
  },
};
</script>

<style lang="scss">
@use "sass:math";
@import "../vars.scss";

#townsquare {
  width: 100%;
  height: 100%;
  padding: clamp(44px, 5.5vmin, 64px);
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: center;
  flex-direction: row;
  position: relative;
}

.circle {
  padding: 0;
  width: 100%;
  height: 100%;
  list-style: none;
  margin: 0;

  > li {
    position: absolute;
    left: 50%;
    height: 50%;
    transform-origin: 0 100%;
    pointer-events: none;

    &:hover {
      z-index: 25 !important;
    }

    > .player {
      margin-left: -50%;
      width: 100%;
      pointer-events: all;
    }
    > .reminder {
      margin-left: -25%;
      width: 50%;
      pointer-events: all;
    }
  }
}

@mixin on-circle($item-count) {
  $angle: math.div(360, $item-count);
  $rot: 0;

  // rotation and tooltip placement
  @for $i from 1 through $item-count {
    &:nth-child(#{$i}) {
      transform: rotate($rot * 1deg);
      @if $i - 1 <= math.div($item-count, 2) {
        // first half of players
        z-index: $item-count - $i + 1;
        // open menu on the left
        .player > .menu {
          left: auto;
          right: 110%;
          margin-right: 15px;
          &:before {
            border-left-color: black;
            border-right-color: transparent;
            right: auto;
            left: 100%;
          }
        }
        .fold-enter-active,
        .fold-leave-active {
          transform-origin: right center;
        }
        .fold-enter,
        .fold-leave-to {
          transform: perspective(200px) rotateY(-90deg);
        }
        // show ability tooltip on the left
        .ability {
          right: 120%;
          left: auto;
          &:before {
            border-right-color: transparent;
            border-left-color: black;
            right: auto;
            left: 100%;
          }
        }
      } @else {
        // second half of players
        z-index: $i - 1;
      }

      > * {
        transform: rotate($rot * -1deg);
      }

      // animation cascade
      .life,
      .token,
      .shroud,
      .night-order,
      .seat {
        animation-delay: ($i - 1) * 50ms;
        transition-delay: ($i - 1) * 50ms;
      }

      // move reminders closer to the sides of the circle
      $q: math.div($item-count, 4);
      $x: $i - 1;
      @if $x < $q or ($x >= math.div($item-count, 2) and $x < $q * 3) {
        .player {
          margin-bottom: -10% + 20% * (1 - math.div($x % $q, $q));
        }
      } @else {
        .player {
          margin-bottom: -10% + 20% * math.div($x % $q, $q);
        }
      }
    }
    $rot: $rot + $angle;
  }
}

@for $i from 1 through 20 {
  .circle.size-#{$i} > li {
    @include on-circle($item-count: $i);
  }
}

/***** Demon bluffs / Fabled *******/
#townsquare > .role-side-panel {
  position: absolute;
  left: 10px;
  bottom: 10px;
  box-sizing: border-box;
  width: max-content;
  max-width: min(440px, calc(100vw - 20px));
  overflow: visible;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  border: 2px solid black;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
  transform-origin: bottom left;
  transform: scale(1);
  opacity: 1;
  transition: all 200ms ease-in-out;
  z-index: 50;

  &.closed {
    width: auto;
    min-width: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.5);
  }

  .role-panel-toggle {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 2;
    display: inline-flex;
    width: 24px;
    height: 24px;
    padding: 0;
    align-items: center;
    justify-content: center;
    color: white;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
  }

  &.closed .role-panel-toggle {
    position: static;
  }

  .role-panel-toggle:hover path {
    fill: url(#demon);
    stroke-width: 30px;
    stroke: white;
  }

  .role-tabs {
    display: flex;
    gap: 2px;
    padding: 4px 32px 0 4px;
  }

  .role-tabs button {
    flex: 1 1 auto;
    min-width: 0;
    padding: 3px 8px;
    color: rgba(255, 255, 255, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-bottom: 0;
    border-radius: 6px 6px 0 0;
    background: rgba(0, 0, 0, 0.22);
    font: inherit;
    font-size: 70%;
    line-height: 1.1;
    white-space: nowrap;
    cursor: pointer;
    text-shadow: 0 1px 2px black;
  }

  .role-tabs button.active {
    color: white;
    background: rgba(0, 0, 0, 0.72);
    border-color: rgba(255, 255, 255, 0.7);
    box-shadow: 0 -2px 8px rgba(255, 255, 255, 0.15);
  }

  .panel-body {
    position: relative;
  }

  h3 {
    margin: 3px 0.75vh 0;
    display: flex;
    align-items: center;
    align-content: center;
    justify-content: flex-end;
    span {
      flex-grow: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .panel-actions {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
      margin-left: 0.5em;
      overflow: visible;
    }
    .panel-action {
      display: inline-flex;
      width: 24px;
      height: 24px;
      padding: 0;
      align-items: center;
      justify-content: center;
      color: white;
      border: 0;
      background: transparent;
      font: inherit;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .panel-actions svg {
      cursor: pointer;
      flex-grow: 0;
      &:hover path {
        fill: url(#demon);
        stroke-width: 30px;
        stroke: white;
      }
    }
  }
  ul {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
    li {
      margin: 0 0.25%;
      display: inline-block;
      transition: all 250ms;
    }
  }
}

@media screen and (max-width: 767.98px) {
  #townsquare > .role-side-panel {
    max-width: min(190px, calc(52vw - 10px));
  }

  #townsquare > .role-side-panel .role-tabs button {
    min-height: 32px;
    padding: 5px 6px;
    font-size: 68%;
  }

  #townsquare > .role-side-panel ul {
    max-width: 100%;
    justify-content: flex-start;
    overflow: visible;
  }

  #townsquare > .role-side-panel h3 {
    font-size: 112%;
  }

  #townsquare > .role-side-panel .panel-action {
    width: 24px;
    height: 24px;
  }
}

.fabled-panel ul li .token:before {
  content: " ";
  opacity: 0;
  transition: opacity 250ms;
  background-image: url("../assets/icons/x.png");
  z-index: 2;
}

/**** Night reminders ****/
.night-order {
  position: absolute;
  width: 100%;
  cursor: pointer;
  opacity: 1;
  transition: opacity 200ms;
  display: flex;
  top: 0;
  align-items: center;
  pointer-events: none;

  &:after {
    content: " ";
    display: block;
    padding-top: 100%;
  }

  #townsquare.public & {
    opacity: 0;
    pointer-events: none;
  }

  &:hover ~ .token .ability {
    opacity: 0;
  }

  span {
    display: flex;
    position: absolute;
    padding: 5px 10px 5px 30px;
    width: 350px;
    z-index: 25;
    font-size: 70%;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 10px;
    border: 3px solid black;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
    text-align: left;
    align-items: center;
    opacity: 0;
    transition: opacity 200ms ease-in-out;

    &:before {
      transform: rotate(-90deg);
      transform-origin: center top;
      left: -98px;
      top: 50%;
      font-size: 100%;
      position: absolute;
      font-weight: bold;
      text-align: center;
      width: 200px;
    }

    &:after {
      content: " ";
      border: 10px solid transparent;
      width: 0;
      height: 0;
      position: absolute;
    }
  }

  &.first span {
    right: 120%;
    background: linear-gradient(
      to right,
      $townsfolk 0%,
      rgba(0, 0, 0, 0.5) 20%
    );
    &:before {
      content: "首夜";
    }
    &:after {
      border-left-color: $townsfolk;
      margin-left: 3px;
      left: 100%;
    }
  }

  &.other span {
    left: 120%;
    background: linear-gradient(to right, $demon 0%, rgba(0, 0, 0, 0.5) 20%);
    &:before {
      content: "其他夜";
    }
    &:after {
      right: 100%;
      margin-right: 3px;
      border-right-color: $demon;
    }
  }

  em {
    font-style: normal;
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid black;
    filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.5));
    font-weight: bold;
    opacity: 1;
    pointer-events: all;
    transition: opacity 200ms;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 3;
  }

  &.first em {
    left: -10%;
    background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, $townsfolk 100%);
  }

  &.other em {
    right: -10%;
    background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, $demon 100%);
  }

  &.current em {
    right: -14%;
    width: clamp(18px, 28%, 28px);
    height: clamp(18px, 28%, 28px);
    font-size: clamp(11px, 38%, 15px);
    border-width: 2px;
    color: #fff;
    background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, #6f6a5d 100%);
  }

  em:hover + span {
    opacity: 1;
  }

  // adjustment for fabled
  .fabled-panel &.first {
    span {
      right: auto;
      left: 40px;
      &:after {
        left: auto;
        right: 100%;
        margin-left: 0;
        margin-right: 3px;
        border-left-color: transparent;
        border-right-color: $townsfolk;
      }
    }
  }
}

@media (hover: none), (pointer: coarse) {
  .night-order.current em {
    right: -10%;
    width: 16px;
    height: 16px;
    border-width: 1px;
    font-size: 10px;
  }
}

#townsquare:not(.spectator) .fabled-panel ul li:hover .token:before {
  opacity: 1;
}

#townsquare:not(.spectator)
  .fabled-panel
  ul
  li.is-storyteller-token:hover
  .token:before {
  opacity: 0;
}

#townsquare > .is-role {
  position: absolute;
  bottom: calc(50px + 16vh);
  left: 10px;
  z-index: 50;
  text-decoration: none;
  padding: 20px 16px 20px 24px;

  display: flex;
  justify-content: center;
  align-items: center;

  background: rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  border: 3px solid black;
  opacity: 1;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.6);
    transition: background-color 0.3s;
  }

  svg {
    &.is-using-wraith {
      color: red;
    }
  }
}
</style>
