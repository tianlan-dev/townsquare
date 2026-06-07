<template>
  <div class="town-info">
    <div
      class="edition-logo"
      :class="['edition-' + edition.id]"
      :style="{
        backgroundImage: `url(${editionLogo})`,
      }"
    ></div>
    <div v-if="showDetails" class="bottom-right-stack">
      <div
        class="info-timer-controls"
        v-if="
          !!session.sessionId &&
          (!session.isSpectator ||
            !!session.isHostAllowed ||
            !!session.isJoinAllowed)
        "
      >
        <button
          v-if="
            !session.isSpectator &&
            (!session.isTimerRunning || session.timer <= 0)
          "
          @click="startTimer"
          class="timer-button"
        >
          开始
        </button>
        <button
          v-if="
            !session.isSpectator && session.isTimerRunning && session.timer > 0
          "
          @click="stopTimer"
          class="timer-button"
        >
          停止
        </button>
        <span class="timer-text" @click="setTimer">
          <span>计时 </span>
          <span :style="lessThanOneMinute">{{ formattedTime }}</span>
        </span>
      </div>
      <transition name="info-tooltip">
        <div v-if="isInfoTooltipOpen" class="info-tooltip">
          <div>
            <span>剧本：</span>
            <strong>{{ edition.name || "未知剧本" }}</strong>
          </div>
          <div v-if="editionVersion">
            <span>版本：</span>
            <strong>{{ editionVersion }}</strong>
          </div>
          <div v-if="editionAuthor">
            <span>作者：</span>
            <strong>{{ editionAuthor }}</strong>
          </div>
          <div>
            <span>房间号：</span>
            <strong>{{ roomLabel }}</strong>
          </div>
          <div>
            <span>说书人：</span>
            <strong>{{ storytellerName }}</strong>
          </div>
        </div>
      </transition>
      <div
        ref="infoPanel"
        class="bottom-right-panel"
        @mouseenter="showInfoTooltip"
        @mouseleave="hideInfoTooltip"
        @touchstart="startInfoLongPress"
        @touchmove="cancelInfoLongPress"
        @touchend="endInfoLongPress"
        @touchcancel="cancelInfoLongPress"
      >
        <ul class="info">
          <li class="phase">
            <span>
              {{ phaseInfo.label }}
            </span>
          </li>
          <li v-if="players.length - teams.traveler < 5">请添加更多玩家！</li>
          <li>
            <span>
              {{ players.length }}
              <font-awesome-icon class="players" icon="users" />
            </span>
            <span>
              {{ teams.alive }}
              <font-awesome-icon class="alive" icon="heartbeat" />
            </span>
            <span>
              {{ teams.votes }}
              <font-awesome-icon class="votes" icon="vote-yea" />
            </span>
          </li>
          <li v-if="players.length - teams.traveler >= 5">
            <span>
              {{ teams.townsfolk }}
              <font-awesome-icon class="townsfolk" icon="user-friends" />
            </span>
            <span>
              {{ teams.outsider }}
              <font-awesome-icon
                class="outsider"
                :icon="teams.outsider > 1 ? 'user-friends' : 'user'"
              />
            </span>
            <span>
              {{ teams.minion }}
              <font-awesome-icon
                class="minion"
                :icon="teams.minion > 1 ? 'user-friends' : 'user'"
              />
            </span>
            <span>
              {{ teams.demon }}
              <font-awesome-icon
                class="demon"
                :icon="teams.demon > 1 ? 'user-friends' : 'user'"
              />
            </span>
            <span v-if="teams.traveler">
              {{ teams.traveler }}
              <font-awesome-icon
                class="traveler"
                :icon="teams.traveler > 1 ? 'user-friends' : 'user'"
              />
            </span>
          </li>
          <li v-if="$store.state.session.isReview">复盘视角</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import gameJSON from "./../game";
import { mapGetters, mapState } from "vuex";

export default {
  props: {
    showDetails: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      isInfoTooltipOpen: false,
      infoLongPressTimer: null,
      infoTouchStartX: 0,
      infoTouchStartY: 0,
      infoTooltipOpenedAt: 0,
    };
  },
  computed: {
    teams: function () {
      const { players } = this.$store.state.players;
      const nonTravelers = this.$store.getters["players/nonTravelers"];
      const alive = players.filter((player) => player.isDead !== true).length;
      return {
        ...gameJSON[nonTravelers - 5],
        traveler: players.length - nonTravelers,
        alive,
        votes:
          alive +
          players.filter(
            (player) => player.isDead === true && player.isVoteless !== true,
          ).length,
      };
    },
    editionLogo: function () {
      if (this.edition.logo && this.shouldUseImageUrl(this.edition.logo)) {
        return this.edition.logo;
      }
      return require("../assets/editions/" + this.edition.id + ".png");
    },
    roomLabel() {
      return this.session.sessionId || "未加入房间";
    },
    storytellerName() {
      if (this.session.storytellerName) return this.session.storytellerName;
      const storyteller = this.players.find((player) => player.id === "host");
      if (storyteller && storyteller.name) return storyteller.name;
      if (!this.session.isSpectator) return this.session.playerName || "说书人";
      return "说书人";
    },
    editionVersion() {
      if (this.edition.id !== "custom") return "";
      return typeof this.edition.version === "string"
        ? this.edition.version.trim()
        : "";
    },
    editionAuthor() {
      if (this.edition.id !== "custom") return "";
      return typeof this.edition.author === "string"
        ? this.edition.author.trim()
        : "";
    },
    formattedTime() {
      const minutes = Math.floor(this.session.timer / 60);
      const seconds = Math.ceil(this.session.timer % 60);
      return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    },
    lessThanOneMinute() {
      return {
        color: this.session.timer < 60 ? "red" : "white",
      };
    },
    ...mapState(["edition", "grimoire", "session"]),
    ...mapState("players", ["players"]),
    ...mapGetters(["phaseInfo"]),
  },
  mounted() {
    document.addEventListener("touchstart", this.handleOutsideTouch, true);
  },
  beforeDestroy() {
    document.removeEventListener("touchstart", this.handleOutsideTouch, true);
    this.cancelInfoLongPress();
  },
  methods: {
    isTouchPreviewMode() {
      return (
        window.matchMedia &&
        window.matchMedia("(hover: none), (pointer: coarse)").matches
      );
    },
    showInfoTooltip() {
      if (this.isTouchPreviewMode()) return;
      this.isInfoTooltipOpen = true;
      this.infoTooltipOpenedAt = Date.now();
    },
    hideInfoTooltip() {
      this.isInfoTooltipOpen = false;
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
    async setTimer() {
      if (this.session.isSpectator || !this.session.sessionId) return;

      const input = await this.showInputModal({
        inputType: "timer",
        inputModal: "input",
        inputData: {
          name: ["输入时间（分）"],
          length: 1,
          placeholder: [""],
        },
      }).catch(() => {
        return null;
      });
      if (input === null) return;

      const timeNum = Number(input[0]);
      if (!timeNum || timeNum <= 0) return;
      this.stopTimer();
      this.startTimer(timeNum * 60);
    },
    startTimer(time = null) {
      if (this.session.isSpectator) return;
      if (typeof time != "number") time = this.session.timer;
      this.$store.commit("session/startTimer", time);
    },
    stopTimer() {
      if (this.session.isSpectator) return;
      this.$store.commit("session/stopTimer");
    },
    startInfoLongPress(event) {
      if (!this.isTouchPreviewMode() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      this.infoTouchStartX = touch.clientX;
      this.infoTouchStartY = touch.clientY;
      this.cancelInfoLongPress();
      this.infoLongPressTimer = window.setTimeout(() => {
        this.infoLongPressTimer = null;
        this.isInfoTooltipOpen = true;
        this.infoTooltipOpenedAt = Date.now();
      }, 450);
    },
    cancelInfoLongPress(event) {
      if (event && event.touches && event.touches.length === 1) {
        const touch = event.touches[0];
        const distanceX = Math.abs(touch.clientX - this.infoTouchStartX);
        const distanceY = Math.abs(touch.clientY - this.infoTouchStartY);
        if (distanceX <= 10 && distanceY <= 10) return;
      }
      if (this.infoLongPressTimer) {
        window.clearTimeout(this.infoLongPressTimer);
        this.infoLongPressTimer = null;
      }
    },
    endInfoLongPress(event) {
      if (this.infoLongPressTimer) {
        window.clearTimeout(this.infoLongPressTimer);
        this.infoLongPressTimer = null;
      } else if (this.isInfoTooltipOpen && this.isTouchPreviewMode()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    handleOutsideTouch(event) {
      if (!this.isInfoTooltipOpen) return;
      if (Date.now() - this.infoTooltipOpenedAt < 500) return;
      if (this.$refs.infoPanel && this.$refs.infoPanel.contains(event.target)) {
        return;
      }
      this.hideInfoTooltip();
    },
    shouldUseImageUrl(url) {
      if (!url || typeof url !== "string") return false;
      if (url.startsWith("data:") || url.startsWith("blob:")) return true;
      try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.origin === window.location.origin) return true;
        return (
          this.grimoire.isImageOptIn &&
          ["http:", "https:"].includes(parsed.protocol)
        );
      } catch (e) {
        return false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
@import "../vars.scss";

.bottom-right-stack {
  position: fixed;
  right: 10px;
  bottom: 10px;
  display: flex;
  width: fit-content;
  max-width: min(220px, calc(100vw - 20px));
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  font-family: "Roboto Condensed", Arial, "Noto Sans", "PingFang SC",
    "Microsoft YaHei", sans-serif;
  font-size: clamp(12px, 1.2vw, 14px);
  line-height: 1.15;
  z-index: 75;
}

.bottom-right-panel {
  width: fit-content;
  max-width: 100%;
}

.info-tooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  width: max-content;
  max-width: min(280px, calc(100vw - 20px));
  padding: 8px 10px;
  color: #fff;
  text-align: left;
  background: rgba(0, 0, 0, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  text-shadow:
    0 1px 1px black,
    0 -1px 1px black,
    1px 0 1px black,
    -1px 0 1px black;

  div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    line-height: 1.3;
    white-space: nowrap;
  }

  span {
    color: rgba(255, 255, 255, 0.68);
  }

  strong {
    max-width: min(190px, calc(100vw - 92px));
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: bold;
    white-space: nowrap;
  }
}

.info-tooltip-enter-active,
.info-tooltip-leave-active {
  transition: opacity 140ms ease;
}

.info-tooltip-enter,
.info-tooltip-leave-to {
  opacity: 0;
}

@media screen and (max-width: 767.98px) {
  .bottom-right-stack {
    max-width: min(190px, calc(100vw - 20px));
  }
}

.info-timer-controls {
  display: flex;
  width: max-content;
  max-width: 100%;
  padding: 3px 6px;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  color: white;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}

.timer-text {
  font-size: inherit;
}

.timer-button {
  padding: 1px 5px;
  color: white;
  background-color: rgba(0, 0, 0, 0.5);
  border: 1px solid white;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  line-height: 1.1;
}

.info {
  display: flex;
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  padding: 6px 8px;
  align-items: flex-end;
  align-content: flex-end;
  justify-content: flex-end;
  flex-direction: column;
  gap: 2px;
  background: rgba(0, 0, 0, 0.55);
  border: 2px solid black;
  border-radius: 8px;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.45);

  li {
    font-weight: bold;
    width: fit-content;
    max-width: 100%;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.7));
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-end;
    column-gap: 6px;
    row-gap: 1px;
    text-shadow:
      0 2px 1px black,
      0 -2px 1px black,
      2px 0 1px black,
      -2px 0 1px black;

    span {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      white-space: nowrap;
    }

    &.phase {
      width: fit-content;
    }

    svg {
      margin-right: 0;
    }

    .players {
      color: #00f700;
    }
    .alive {
      color: #ff4a50;
    }
    .votes {
      color: #fff;
    }
    .townsfolk {
      color: $townsfolk;
    }
    .outsider {
      color: $outsider;
    }
    .minion {
      color: $minion;
    }
    .demon {
      color: $demon;
    }
    .traveler {
      color: $traveler;
    }
  }
}

.edition-logo {
  position: fixed;
  left: 10px;
  top: 10px;
  width: clamp(88px, 14vw, 190px);
  height: clamp(72px, 12vw, 160px);
  background-position: center center;
  background-repeat: no-repeat;
  background-size: contain;
  pointer-events: none;
  z-index: 45;
}
</style>
