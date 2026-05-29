<template>
  <div class="town-info">
    <div
      class="edition-logo"
      :class="['edition-' + edition.id]"
      :style="{
        backgroundImage: `url(${editionLogo})`,
      }"
    ></div>
    <div class="bottom-right-panel">
      <div
        class="timer-controls"
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
          class="timerButton"
        >
          开始
        </button>
        <button
          v-if="
            !session.isSpectator && session.isTimerRunning && session.timer > 0
          "
          @click="stopTimer"
          class="timerButton"
        >
          停止
        </button>
        <span class="timer-text" @click="setTimer">
          <span>计时 </span>
          <span :style="lessThanOneMinute">{{ formattedTime }}</span>
        </span>
      </div>
      <ul class="info">
        <li v-if="players.length - teams.traveler < 5">请添加更多玩家！</li>
        <li>
          <span class="meta" v-if="!edition.isOfficial">
            {{ edition.name }}
            {{ edition.author ? "by " + edition.author : "" }}
          </span>
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
        <li class="phase">
          <span>
            {{ phaseInfo.label }}
          </span>
        </li>
        <li>
          <span> 房间号： </span>
          <span v-if="$store.state.session.sessionId">
            {{ this.$store.state.session.sessionId }}
          </span>
          <span v-else> 未加入房间 </span>
        </li>
        <li v-if="$store.state.session.isReview">复盘视角</li>
      </ul>
    </div>
  </div>
</template>

<script>
import gameJSON from "./../game";
import { mapGetters, mapState } from "vuex";

export default {
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
      if (
        this.edition.logo &&
        this.grimoire.isImageOptIn &&
        this.isAllowedImageUrl(this.edition.logo)
      ) {
        return this.edition.logo;
      }
      return require("../assets/editions/" + this.edition.id + ".png");
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
  methods: {
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

      const time = input[0];
      const timeNum = Number(time);
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
    isAllowedImageUrl(url) {
      if (url.startsWith("data:") || url.startsWith("blob:")) return true;
      try {
        return ["http:", "https:"].includes(
          new URL(url, window.location.origin).protocol,
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

.bottom-right-panel {
  position: fixed;
  right: 10px;
  bottom: 10px;
  display: flex;
  width: max-content;
  max-width: min(220px, calc(100vw - 20px));
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-family: "Roboto Condensed", Arial, "Noto Sans", "PingFang SC",
    "Microsoft YaHei", sans-serif;
  font-size: clamp(12px, 1.2vw, 14px);
  line-height: 1.15;
  z-index: 75;
}

@media screen and (max-width: 767.98px) {
  .bottom-right-panel {
    max-width: min(190px, calc(100vw - 20px));
  }
}

.timer-controls {
  box-sizing: border-box;
  display: flex;
  max-width: 100%;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 2px 5px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 5px;
  cursor: pointer;
}

.timer-text {
  font-size: inherit;
  white-space: nowrap;
}

.timerButton {
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 5px;
  border: 1px solid white;
  color: white;
  cursor: pointer;
  font: inherit;
  line-height: 1.1;
  padding: 1px 5px;
}

.info {
  display: flex;
  width: max-content;
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
    width: max-content;
    max-width: 100%;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.7));
    display: flex;
    flex-wrap: wrap;
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

    .meta {
      display: block;
      text-align: right;
      flex-basis: 100%;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: normal;
      white-space: nowrap;
    }

    &.phase {
      width: 100%;
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

@media screen and (max-width: 767.98px) {
  .info li .meta {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.05;
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
