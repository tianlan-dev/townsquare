<template>
  <div
    id="app"
    @keyup="keyup"
    tabindex="-1"
    :class="{
      night: grimoire.isNight,
      static: grimoire.isStatic,
    }"
  >
    <div
      v-for="(background, index) in phaseBackgrounds"
      :key="`${index}-${background}`"
      class="phase-background"
      :class="{ active: index === phaseInfo.phase }"
      :style="{ backgroundImage: `url('${background}')` }"
    ></div>
    <div class="backdrop"></div>
    <transition-group name="toast" tag="div" class="presence-notices">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="presence-notice"
      >
        {{ notification.text }}
      </div>
    </transition-group>
    <TownInfo
      v-if="showTownInfo"
      :show-details="!session.nomination"
    ></TownInfo>
    <transition name="blur">
      <Intro v-if="showIntro" @trigger="handleTrigger($event)"></Intro>
      <Vote v-else-if="session.nomination"></Vote>
    </transition>
    <TownSquare></TownSquare>
    <Menu ref="menu" @trigger="handleTrigger($event)"></Menu>
    <ImageCropper ref="imageCropper" />
    <EditionModal />
    <FabledModal />
    <RolesModal />
    <ReferenceModal />
    <NightOrderModal />
    <ReviewDetailsModal />
    <VoteHistoryModal />
    <GameStateModal />
    <InputModal ref="input" />
    <MobileRoleInfoPanel />
    <Gradients />
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import TownSquare from "./components/TownSquare";
import TownInfo from "./components/TownInfo";
import Menu from "./components/Menu";
import ImageCropper from "./components/ImageCropper";
import RolesModal from "./components/modals/RolesModal";
import EditionModal from "./components/modals/EditionModal";
import Intro from "./components/Intro";
import ReferenceModal from "./components/modals/ReferenceModal";
import Vote from "./components/Vote";
import Gradients from "./components/Gradients";
import NightOrderModal from "./components/modals/NightOrderModal";
import FabledModal from "@/components/modals/FabledModal";
import VoteHistoryModal from "@/components/modals/VoteHistoryModal";
import ReviewDetailsModal from "@/components/modals/ReviewDetailsModal";
import GameStateModal from "@/components/modals/GameStateModal";
import InputModal from "@/components/modals/InputModal.vue";
import MobileRoleInfoPanel from "@/components/MobileRoleInfoPanel.vue";

const touchLongPressQuery = "(hover: none), (pointer: coarse)";

export default {
  components: {
    GameStateModal,
    ReviewDetailsModal,
    VoteHistoryModal,
    FabledModal,
    NightOrderModal,
    Vote,
    ReferenceModal,
    Intro,
    TownInfo,
    TownSquare,
    Menu,
    ImageCropper,
    EditionModal,
    RolesModal,
    InputModal,
    MobileRoleInfoPanel,
    Gradients,
  },
  computed: {
    ...mapState(["grimoire", "session", "modals", "notifications"]),
    ...mapState("players", ["players"]),
    ...mapGetters(["phaseBackgrounds", "phaseInfo"]),
    isInRoom() {
      return !!this.session.sessionId;
    },
    showIntro() {
      return !this.isInRoom && !this.players.length;
    },
    showTownInfo() {
      return this.isInRoom || !!this.players.length;
    },
  },
  watch: {
    phaseBackgrounds: {
      handler(backgrounds) {
        this.preloadPhaseBackgrounds(backgrounds);
      },
      immediate: true,
    },
  },
  async mounted() {
    document.addEventListener("contextmenu", this.preventNativeLongPress);
    document.addEventListener("selectstart", this.preventNativeLongPress);
    document.addEventListener("dragstart", this.preventNativeLongPress);

    // Original socket.js logic is now here
    const pathname = window.location.pathname;
    const sessionId = window.location.hash.substr(1);

    if (pathname === "/" && sessionId && this.session.sessionId === "") {
      // Set initial session state
      if (await this.ensurePlayerProfile()) {
        const result = await this.$store.$liveLobby
          .joinRoom({
            profile: {
              name: this.session.playerName,
              gender: this.session.playerGender,
            },
            roomCode: sessionId,
          })
          .catch(() => ({ ok: false }));
        if (result.ok) {
          this.$store.commit("session/setSpectator", true);
          this.$store.commit("toggleGrimoire", false);
          this.$store.commit("session/setSessionId", result.roomCode);
        } else {
          this.$store.dispatch("resetRoomState");
        }
      } else {
        // User cancelled input, so don't join the session
        this.$store.commit("session/setSessionId", "");
      }
    } else if (
      pathname === "/" &&
      sessionId &&
      sessionId != this.session.sessionId
    ) {
      await this.showInputModal({
        inputType: "alert",
        inputModal: "text",
        inputData: {
          name: [
            `已经在房间${this.session.sessionId}中，如需换房间请退出重进！`,
          ],
        },
      }).catch(() => {
        return null;
      });
      return;
    }

    // Clear hash after processing
    window.location.hash = "";

    // You would also call your socket connection setup here if needed
    // this.setupSocketConnection();
  },
  beforeDestroy() {
    document.removeEventListener("contextmenu", this.preventNativeLongPress);
    document.removeEventListener("selectstart", this.preventNativeLongPress);
    document.removeEventListener("dragstart", this.preventNativeLongPress);
  },
  methods: {
    preventNativeLongPress(event) {
      const isTouchDevice =
        window.matchMedia && window.matchMedia(touchLongPressQuery).matches;
      if (isTouchDevice) {
        event.preventDefault();
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
    async ensurePlayerProfile() {
      if (this.session.playerName && this.session.playerGender) return true;
      const input = await this.showInputModal({
        inputType: "playerProfile",
        inputModal: "input",
        inputData: {
          name: ["输入玩家昵称", "选择性别"],
          length: 2,
          placeholder: [
            this.session.playerName || "",
            this.session.playerGender || "female",
          ],
          types: ["text", "gender"],
        },
      }).catch(() => {
        return null;
      });
      if (input === null) return false;

      const [name, gender] = input;
      this.$store.commit("session/setPlayerName", name);
      this.$store.commit("session/setPlayerGender", gender);
      await this.$store.dispatch("refreshDefaultPlayerAvatar", {
        updateSeat: false,
      });
      return true;
    },
    preloadPhaseBackgrounds(backgrounds = []) {
      backgrounds.forEach((background) => {
        const image = new Image();
        image.src = background;
      });
    },
    keyup({ key, ctrlKey, metaKey }) {
      if (ctrlKey || metaKey) return;
      if (this.session.isTyping && key != "Escape") return;
      const isInRoom = !!this.session.sessionId;
      switch (key.toLocaleLowerCase()) {
        case "m":
          this.$store.commit("toggleMenu");
          break;
        case "g":
          if (!isInRoom) return;
          this.$store.commit("toggleGrimoire");
          break;
        // case "a":
        //   this.$refs.menu.addPlayer();
        //   break;
        case "h":
          this.$refs.menu.hostSession();
          break;
        case "j":
          this.$refs.menu.joinSession();
          break;
        case "r":
          if (!isInRoom) return;
          this.$store.commit("toggleModal", "reference");
          break;
        case "n":
          if (!isInRoom) return;
          this.$store.commit("toggleModal", "nightOrder");
          break;
        case "e":
          if (!isInRoom) return;
          if (this.session.isSpectator) return;
          this.$store.commit("toggleModal", "edition");
          break;
        case "c":
          if (!isInRoom) return;
          if (this.session.isSpectator) return;
          this.$store.commit("toggleModal", "roles");
          break;
        case "f":
          if (!isInRoom) return;
          if (this.session.isSpectator) return;
          this.$store.commit("toggleModal", "fabled");
          break;
        case "v":
          if (!isInRoom) return;
          if (this.session.voteHistory.length || !this.session.isSpectator) {
            this.$store.commit("toggleModal", "voteHistory");
          }
          break;
        case "t":
          if (!isInRoom) return;
          if (this.session.isSpectator) return;
          this.$refs.menu.setTimer();
          break;
        case "escape":
          if (this.modals && this.modals.input) {
            this.$refs.input.close();
          } else {
            this.$store.commit("toggleModal");
          }
          break;
      }
    },
    handleTrigger([method]) {
      if (typeof this.$refs.menu[method] === "function") {
        this.$refs.menu[method]();
      }
      if (typeof this.$refs.imageCropper[method] === "function") {
        this.$refs.imageCropper[method]();
      }
    },
  },
};
</script>

<style lang="scss">
@import "vars";

@font-face {
  font-family: "Papyrus";
  src: url("assets/fonts/papyrus.eot"); /* IE9*/
  src:
    url("assets/fonts/papyrus.eot?#iefix") format("embedded-opentype"),
    /* IE6-IE8 */ url("assets/fonts/papyrus.woff2") format("woff2"),
    /* chrome firefox */ url("assets/fonts/papyrus.woff") format("woff"),
    /* chrome firefox */ url("assets/fonts/papyrus.ttf") format("truetype"),
    /* chrome firefox opera Safari, Android, iOS 4.2+*/
      url("assets/fonts/papyrus.svg#PapyrusW01") format("svg"); /* iOS 4.1- */
}

@font-face {
  font-family: PiratesBay;
  src: url("assets/fonts/piratesbay.ttf");
  font-display: swap;
}

html,
body {
  font-size: 1.2em;
  line-height: 1.4;
  background-color: #07111d;
  background-position: center center;
  background-size: cover;
  color: white;
  height: 100%;
  font-family: "Roboto Condensed", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  padding: 0;
  margin: 0;
  overflow: hidden;
}

@media (hover: none), (pointer: coarse) {
  html,
  body,
  #app,
  #app * {
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-user-drag: none;
    -webkit-user-select: none;
    user-select: none;
  }
}

html,
body,
#app,
#app * {
  user-select: none;
}

#app input,
#app textarea,
#app [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
}

html.mobile-role-info-open .token .ability,
html.suppress-token-ability-tooltip .token .ability,
.mobile-role-info-trigger.token .ability,
.mobile-role-info-trigger .token .ability {
  display: none !important;
  opacity: 0 !important;
}

@import "media";

* {
  box-sizing: border-box;
  position: relative;
}

a {
  color: $townsfolk;
  &:hover {
    color: $demon;
  }
}

h1,
h2,
h3,
h4,
h5 {
  margin: 0;
  text-align: center;
  font-family: PiratesBay, sans-serif;
  letter-spacing: 1px;
  font-weight: normal;
}

ul {
  list-style-type: none;
  margin: 0;
  padding: 0;
}

#app {
  height: 100%;
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: center;

  // disable all animations
  &.static *,
  &.static *:after,
  &.static *:before {
    transition: none !important;
    animation: none !important;
  }
}

.phase-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-position: center center;
  background-size: cover;
  opacity: 0;
  pointer-events: none;
  transition: opacity 900ms ease-in-out;
  transform: translateZ(0);
  will-change: opacity;
}

.phase-background.active {
  opacity: 1;
}

.presence-notices {
  position: fixed;
  top: max(14px, env(safe-area-inset-top));
  left: 50%;
  z-index: 1000;
  width: min(520px, calc(100vw - 24px));
  transform: translateX(-50%);
  pointer-events: none;
}

.presence-notice {
  position: relative;
  width: 100%;
  margin: 0 0 8px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  background: rgba(15, 18, 22, 0.88);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  color: white;
  font-size: 0.85rem;
  font-weight: bold;
  line-height: 1.35;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(6px);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.toast-enter,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.toast-move {
  transition: transform 220ms ease;
}

.blur-enter-active,
.blur-leave-active {
  transition: all 250ms;
  filter: blur(0);
}
.blur-enter,
.blur-leave-to {
  opacity: 0;
  filter: blur(20px);
}

// Buttons
.button-group {
  display: flex;
  align-items: center;
  justify-content: center;
  align-content: center;
  .button {
    margin: 5px 0;
    border-radius: 0;
    &:first-child {
      border-top-left-radius: 15px;
      border-bottom-left-radius: 15px;
    }
    &:last-child {
      border-top-right-radius: 15px;
      border-bottom-right-radius: 15px;
    }
  }
}
.button {
  padding: 0;
  border: solid 0.125em transparent;
  border-radius: 15px;
  box-shadow:
    inset 0 1px 1px #9c9c9c,
    0 0 10px #000;
  background:
    radial-gradient(at 0 -15%, rgba(#fff, 0.07) 70%, rgba(#fff, 0) 71%) 0 0/ 80%
      90% no-repeat content-box,
    linear-gradient(#4e4e4e, #040404) content-box,
    linear-gradient(#292929, #010101) border-box;
  color: white;
  font-weight: bold;
  text-shadow: 1px 1px rgba(0, 0, 0, 0.5);
  line-height: 170%;
  margin: 5px auto;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;
  &:hover {
    color: red;
  }
  &.disabled {
    color: gray;
    cursor: default;
    opacity: 0.75;
  }
  &:before,
  &:after {
    content: " ";
    display: inline-block;
    width: 10px;
    height: 10px;
  }
  &.townsfolk {
    background:
      radial-gradient(
          at 0 -15%,
          rgba(255, 255, 255, 0.07) 70%,
          rgba(255, 255, 255, 0) 71%
        )
        0 0/80% 90% no-repeat content-box,
      linear-gradient(#0031ad, rgba(5, 0, 0, 0.22)) content-box,
      linear-gradient(#292929, #001142) border-box;
    box-shadow:
      inset 0 1px 1px #002c9c,
      0 0 10px #000;
    &:hover:not(.disabled) {
      color: #008cf7;
    }
  }
  &.demon {
    background:
      radial-gradient(
          at 0 -15%,
          rgba(255, 255, 255, 0.07) 70%,
          rgba(255, 255, 255, 0) 71%
        )
        0 0/80% 90% no-repeat content-box,
      linear-gradient(#ad0000, rgba(5, 0, 0, 0.22)) content-box,
      linear-gradient(#292929, #420000) border-box;
    box-shadow:
      inset 0 1px 1px #9c0000,
      0 0 10px #000;
  }
}

/* Night phase backdrop */
#app > .backdrop {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
  pointer-events: none;
  background: black;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 1) 0%,
    rgba(1, 22, 46, 1) 50%,
    rgba(0, 39, 70, 1) 100%
  );
  opacity: 0;
  transition: opacity 1s ease-in-out;
  &:after {
    content: " ";
    display: block;
    width: 100%;
    padding-right: 2000px;
    height: 100%;
    background: url("assets/clouds.png") repeat;
    background-size: 2000px auto;
    animation: move-background 120s linear infinite;
    opacity: 0.3;
  }
}

@keyframes move-background {
  from {
    transform: translate3d(-2000px, 0px, 0px);
  }
  to {
    transform: translate3d(0px, 0px, 0px);
  }
}

#app.night > .backdrop {
  opacity: 0.5;
}

#app:focus {
  outline: none;
}
</style>
