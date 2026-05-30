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
      <ul class="info">
        <li v-if="players.length - teams.traveler < 5">请添加更多玩家！</li>
        <li class="edition-name" v-if="!edition.isOfficial">
          {{ edition.name }}
        </li>
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
      if (this.edition.logo && this.shouldUseImageUrl(this.edition.logo)) {
        return this.edition.logo;
      }
      return require("../assets/editions/" + this.edition.id + ".png");
    },
    ...mapState(["edition", "grimoire", "session"]),
    ...mapState("players", ["players"]),
    ...mapGetters(["phaseInfo"]),
  },
  methods: {
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

.bottom-right-panel {
  position: fixed;
  right: 10px;
  bottom: 10px;
  display: flex;
  width: fit-content;
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

    &.edition-name {
      display: block;
      text-align: right;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: normal;
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

@media screen and (max-width: 767.98px) {
  .info li.edition-name {
    max-width: min(170px, calc(100vw - 36px));
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
