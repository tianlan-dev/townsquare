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
    <button
      v-if="players.length"
      type="button"
      class="murder-scene"
      :class="{
        active: murderScene.hasBlood,
        armed: canToggleMurderScene,
      }"
      :tabindex="canToggleMurderScene ? 0 : -1"
      :aria-label="murderScene.hasBlood ? '取消夜晚血迹' : '标记夜晚死亡'"
      @click.stop="toggleMurderScene"
    >
      <span v-if="murderScene.hasBlood" class="blood-pool"></span>
    </button>
    <ul class="circle" :class="['size-' + players.length]" :style="orientation">
      <Player
        v-for="(player, index) in players"
        :key="index"
        :player="player"
        :is-active-menu="activePlayerMenu === index"
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

    <div class="role-side-panel" v-if="hasRolePanel">
      <div class="role-tabs">
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
          {{ session.isSpectator ? "不在场身份" : "恶魔的伪装身份" }}
        </button>
      </div>

      <div
        v-if="activeRolePanel === 'fabled'"
        class="panel-body fabled-panel"
        :class="{ closed: !isFabledOpen }"
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
            <button
              type="button"
              class="panel-action"
              :aria-label="isFabledOpen ? '最小化传奇角色' : '放大传奇角色'"
              @click.stop="toggleFabled"
            >
              <font-awesome-icon
                :icon="isFabledOpen ? 'window-minimize' : 'window-maximize'"
              />
            </button>
          </span>
        </h3>
        <ul>
          <li
            v-for="(role, index) in fabled"
            v-show="index === 0 || isFabledOpen"
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
        v-if="activeRolePanel === 'bluffs'"
        class="panel-body bluffs-panel"
        ref="bluffs"
        :class="{ closed: !isBluffsOpen }"
      >
        <h3>
          <span class="panel-actions">
            <button
              type="button"
              class="panel-action"
              :aria-label="
                isBluffsOpen ? '最小化恶魔伪装身份' : '放大恶魔伪装身份'
              "
              @click.stop="toggleBluffs"
            >
              <font-awesome-icon
                :icon="isBluffsOpen ? 'window-minimize' : 'window-maximize'"
              />
            </button>
          </span>
        </h3>
        <ul>
          <li
            v-for="index in bluffSize"
            :key="index"
            v-mobile-long-press-role="bluffs[index - 1]"
            @click.stop="openRoleModal(index * -1)"
            :style="isBluffsOpen ? floatingZoom : ''"
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
      return this.players.length > 0 && !this.grimoire.isPublic;
    },
    hasFabledPanel: function () {
      return this.fabled.length > 0;
    },
    hasRolePanel: function () {
      return this.hasFabledPanel || this.hasBluffsPanel;
    },
    murderScene: function () {
      return (
        this.grimoire.murderScene || {
          hasBlood: false,
        }
      );
    },
    canToggleMurderScene: function () {
      return (
        this.players.length > 0 &&
        !this.session.isSpectator &&
        this.phaseInfo.isNight
      );
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
      isBluffsOpen: true,
      isFabledOpen: true,
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
    toggleBluffs() {
      this.isBluffsOpen = !this.isBluffsOpen;
    },
    toggleFabled() {
      this.isFabledOpen = !this.isFabledOpen;
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
    toggleMurderScene() {
      if (!this.canToggleMurderScene) return;
      this.$store.commit("toggleMurderScene");
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
    nominatePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        if (from !== this.nominate) {
          this.nominate = from;
        }
      } else {
        const nomination = [this.nominate, this.players.indexOf(to)];
        this.$store.commit("session/nomination", { nomination });
        this.cancel();
      }
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

.murder-scene {
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(130px, 24vmin, 260px);
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  appearance: none;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 8;

  &.armed {
    cursor: crosshair;
    pointer-events: auto;
  }
}

.blood-pool {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 164%;
  height: 116%;
  background: url("../assets/blood-splatter.png") center / contain no-repeat;
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.48));
  opacity: 0.96;
  transform: translate(-50%, -50%) rotate(-7deg);
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

  .role-tabs {
    display: flex;
    gap: 2px;
    padding: 4px 4px 0;
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
  .panel-body.closed {
    ul li {
      width: 0 !important;
      height: 0 !important;
      .night-order {
        opacity: 0;
      }
      .token {
        border-width: 0;
      }
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
