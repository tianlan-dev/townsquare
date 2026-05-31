<template>
  <Modal
    v-if="modals.input"
    @close="close"
    :name="'input'"
    :type="session.inputModal"
  >
    <span v-if="!!warningMessage" class="warning">{{ warningMessage }}</span>
    <div v-if="session.inputModal === 'input'">
      <form class="input-box" @submit.prevent="confirmInput">
        <div v-for="n in session.inputData.length" :key="n">
          <label>{{ session.inputData.name[n - 1] }}</label>
          <input
            type="text"
            :id="'input-' + n"
            :ref="'input-' + n"
            autocomplete="off"
            @focus="typing"
            @blur="notTyping"
            v-model="input[n - 1]"
          />
        </div>
        <div v-if="isJoinSessionInput" class="room-list">
          <div class="room-list-header">
            <div class="room-list-title">当前房间</div>
            <button
              type="button"
              class="room-list-refresh"
              :disabled="!canRefreshRooms"
              @click="refreshRoomList"
            >
              刷新
            </button>
          </div>
          <div v-if="sortedRoomDetails.length" class="room-list-items">
            <div
              v-for="room in sortedRoomDetails"
              :key="room.id"
              class="room-list-row"
              :title="roomTimeTitle(room)"
              @mouseenter="showRoomInfo(room.id)"
              @mouseleave="hideRoomInfo"
              @touchstart="startRoomInfoPress(room.id, $event)"
              @touchmove="cancelRoomInfoPress"
              @touchend="cancelRoomInfoPress"
              @touchcancel="cancelRoomInfoPress"
            >
              <div class="room-list-main">
                <strong>{{ room.id }}</strong>
                <font-awesome-icon
                  v-if="room.hasPassword"
                  icon="lock"
                  class="room-lock"
                />
                <span>说书人：{{ room.hostName || "说书人" }}</span>
                <span
                  :class="[
                    'room-status',
                    room.hostOnline ? 'online' : 'offline',
                  ]"
                >
                  {{ room.hostOnline ? "在线" : "离线" }}
                </span>
                <span v-if="room.hostOnline && room.playerCount">
                  配置：{{ room.playerCount }}人
                </span>
                <span v-else>配置：未知</span>
              </div>
              <div
                v-if="activeRoomInfoId === room.id"
                class="room-info-popover"
              >
                <span>创建 {{ formatRelative(room.createdAt) }}</span>
                <span>响应 {{ formatRelative(room.lastHostHeartbeat) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="room-list-empty">暂无可加入的房间</div>
        </div>
        <div class="input-actions">
          <button type="submit" class="confirm">确认</button>
          <button type="button" @click="close">取消</button>
        </div>
      </form>
    </div>
    <div v-else-if="session.inputModal === 'confirm'">
      <form
        class="input-box confirm-box"
        @submit.prevent="confirmYes"
        tabindex="-1"
      >
        <label>{{ session.inputData.name[0] }}</label>
        <div class="input-actions">
          <button type="submit" class="confirm" ref="confirmYes">确认</button>
          <button type="button" @click="close" class="cancel">取消</button>
        </div>
      </form>
    </div>
    <div v-else-if="session.inputModal === 'text'">
      <form class="input-box text-box" @submit.prevent="close" tabindex="-1">
        <label>{{ session.inputData.name[0] }}</label>
        <div class="input-actions">
          <button type="submit" class="confirm" ref="confirmClose">关闭</button>
        </div>
      </form>
    </div>
  </Modal>
</template>

<script>
import { mapMutations, mapState } from "vuex";
import Modal from "./Modal";

export default {
  components: { Modal },
  computed: {
    ...mapState(["modals", "grimoire", "session"]),
    ...mapState("players", ["players"]),
    isJoinSessionInput() {
      return (
        this.session.inputModal === "input" &&
        this.session.inputType === "joinSession"
      );
    },
    sortedRoomDetails() {
      return [...(this.session.roomDetails || [])].sort((a, b) =>
        String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
      );
    },
    canRefreshRooms() {
      return this.now - this.session.roomListRefreshedAt >= 15 * 1000;
    },
  },
  data() {
    return {
      input: [""],
      confirm: false,
      warningMessage: "",
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      now: Date.now(),
      relativeTimer: null,
      activeRoomInfoId: "",
      roomInfoPressTimer: null,
    };
  },
  created() {
    if (
      this.session &&
      this.session.inputData &&
      this.session.inputData.placeholder
    ) {
      this.input = [...this.session.inputData.placeholder];
    }
  },
  watch: {
    "session.inputData.placeholder": {
      handler(placeholder) {
        if (Array.isArray(placeholder) && placeholder.length > 0) {
          this.input = [...placeholder];
        }
      },
      immediate: true,
    },
    "modals.input": function (isOpen) {
      if (isOpen) {
        if (this.session.inputModal === "input") {
          this.$nextTick(() => {
            this.$refs["input-1"][0].select();
          });
        } else if (this.session.inputModal === "confirm") {
          this.$nextTick(() => {
            this.$refs.confirmYes.focus();
          });
        } else if (this.session.inputModal === "text") {
          this.$nextTick(() => {
            this.$refs.confirmClose.focus();
          });
        }
      }
    },
  },
  mounted() {
    window.addEventListener("resize", this.handleResize);
    this.relativeTimer = setInterval(() => {
      this.now = Date.now();
    }, 60 * 1000);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize);
    clearInterval(this.relativeTimer);
    this.cancelRoomInfoPress();
  },
  methods: {
    typing() {
      this.$store.commit("session/setTyping", true);
    },
    notTyping() {
      this.$store.commit("session/setTyping", false);
    },
    confirmInput() {
      const allowEmpty = ["bootlegger", "hostSession"];
      if (
        this.session.inputModal === "input" &&
        !allowEmpty.includes(this.session.inputType) &&
        (this.input.length <= 0 || this.input.some((item) => item === ""))
      ) {
        this.close();
        return;
      }
      switch (this.session.inputType) {
        case "changeName":
          {
            if (
              this.input[0].trim() === "" ||
              this.input[0].trim() === "空座位" ||
              this.input[0].trim() === "说书人"
            ) {
              this.warningMessage = "昵称非法！";
              this.$nextTick(() => {
                this.$refs["input-1"][0].select();
              });
              return;
            }
          }
          break;
        case "hostSession":
          {
            const sessionId = this.input[0];
            const numPlayers = this.input[1];
            const password = this.input[2] || "";
            if (
              !Number(sessionId) ||
              Number(sessionId) < 0 ||
              Number(sessionId) >= 10000
            ) {
              this.warningMessage = "请输入大于0小于10000的数字！";
              return;
            }
            if (this.session.rooms.includes(Number(sessionId).toString())) {
              this.warningMessage = `房间"${sessionId}"已经存在说书人！`;
              return;
            }
            if (!Number(numPlayers) || numPlayers <= 0) {
              this.warningMessage = "请输入正确人数！";
              return;
            }
            if (password.length > 6) {
              this.warningMessage = "密码最多6位！";
              return;
            }
          }
          break;
        case "joinSession":
          {
            const sessionId = this.normalizedSessionId(this.input[0]);
            if (!this.session.rooms.includes(sessionId)) {
              this.warningMessage = `房间"${sessionId}"不存在！`;
              return;
            }
            const room = this.session.roomDetails.find(
              (detail) => detail.id === sessionId,
            );
            if (room && !room.hostOnline) {
              this.warningMessage = "说书人暂时离开，稍后再试。";
              return;
            }
          }
          break;
        case "seatNum":
          {
            let seatNum = Number(this.input[0]);
            if (
              !seatNum ||
              Math.floor(seatNum) != seatNum ||
              seatNum > this.players.length
            ) {
              this.warningMessage = "无效的座位号！";
              return;
            }
          }
          break;
        case "bootlegger":
          break;
        case "timer":
          break;
        case "roomPassword":
          if ((this.input[0] || "").length > 6) {
            this.warningMessage = "密码最多6位！";
            return;
          }
          break;
        case "changeNameSt":
          if (
            this.input[0].trim() === "" ||
            this.input[0].trim() === "空座位" ||
            this.input[0].trim() === "说书人"
          ) {
            this.warningMessage = "昵称非法！";
            this.$nextTick(() => {
              this.$refs["input-1"][0].select();
            });
            return;
          }
          break;
        case "reminder":
          break;
        case "json":
          break;
      }

      if (this.session.inputResolver) {
        this.session.inputResolver(this.input);
      }

      this.close();
    },
    confirmYes() {
      this.session.inputResolver(true);
      this.close();
    },
    close() {
      if (this.session.inputResolver && this.session.inputModal === "text") {
        this.session.inputResolver(true);
      } else if (this.session.inputRejecter) {
        this.session.inputRejecter(null);
      }
      this.$store.commit("session/setTyping", false);
      this.$store.commit("session/clearInputHandlers");
      this.input = [""];
      this.warningMessage = "";

      this.toggleModal("input");

      this.$nextTick(() => {
        document.getElementById("app").focus();
      });
    },
    handleResize() {
      this.windowWidth = window.innerWidth;
      this.windowHeight = window.innerHeight;
    },
    normalizedSessionId(value) {
      const input = String(value || "").trim();
      return input.match(/^https?:\/\//i) ? input.split("#").pop() : input;
    },
    formatRelative(value) {
      const timestamp = Number(value);
      if (!timestamp) return "未知";
      const minutes = Math.floor((this.now - timestamp) / (60 * 1000));
      if (minutes >= 60) return "1小时以上";
      if (minutes <= 0) return "刚刚";
      return `${minutes}分钟前`;
    },
    roomTimeTitle(room) {
      return `创建 ${this.formatRelative(
        room.createdAt,
      )}，响应 ${this.formatRelative(room.lastHostHeartbeat)}`;
    },
    refreshRoomList() {
      if (!this.canRefreshRooms) return;
      this.$store.commit("session/setRoomListRefreshedAt", Date.now());
      this.now = Date.now();
      this.$store.commit("session/requestRoomListRefresh");
    },
    showRoomInfo(roomId) {
      this.activeRoomInfoId = roomId;
    },
    hideRoomInfo() {
      this.activeRoomInfoId = "";
      this.cancelRoomInfoPress();
    },
    startRoomInfoPress(roomId, event) {
      this.cancelRoomInfoPress();
      this.roomInfoPressTimer = setTimeout(() => {
        this.activeRoomInfoId = roomId;
        if (event && event.cancelable) event.preventDefault();
      }, 450);
    },
    cancelRoomInfoPress() {
      clearTimeout(this.roomInfoPressTimer);
      this.roomInfoPressTimer = null;
    },
    ...mapMutations(["toggleModal"]),
  },
};
</script>

<style scoped lang="scss">
@import "../../vars.scss";

.input-box {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
}

.input-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.input-box input[type="text"] {
  width: 100%;
  padding: 10px 15px;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 20px;
  height: 35px;
  box-sizing: border-box;
}

.input-box input:focus {
  outline: none;
}

.input-box button {
  padding: 8px 15px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
}

.input-box button.confirm {
  background-color: #0a65dd;
  color: white;
  transition: background-color 0.3s;
}

.input-box button.confirm:focus {
  outline: none;
}

.input-box button.confirm:hover {
  background-color: darken(#0a65dd, 10%);
}

.input-box button[type="button"] {
  background-color: #e84b20;
  color: white;
  transition: background-color 0.3s;
}

.input-box button[type="button"]:hover {
  background-color: darken(#e84b20, 10%);
}

.warning {
  color: red;
}

.room-list {
  width: 100%;
  max-height: 220px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  box-sizing: border-box;
}

.room-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.room-list-title {
  font-weight: bold;
  text-align: left;
}

.room-list-refresh {
  flex: 0 0 auto;
  padding: 4px 9px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.14) !important;
  color: #fff !important;
  font-size: 0.8em;
}

.room-list-refresh:disabled {
  cursor: default;
  opacity: 0.45;
}

.room-list-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-list-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  text-align: left;
}

.room-list-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.room-list-row strong {
  color: #fff;
}

.room-lock {
  color: #ffd76a;
  font-size: 0.8em;
}

.room-list-row span {
  font-size: 0.85em;
  opacity: 0.86;
}

.room-status {
  padding: 2px 7px;
  border-radius: 999px;
  font-weight: bold;
  opacity: 1;
}

.room-status.online {
  color: #b7ffcb;
  background: rgba(25, 135, 84, 0.35);
}

.room-status.offline {
  color: #ffd1d1;
  background: rgba(180, 38, 38, 0.35);
}

.room-info-popover {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.42);
}

.room-info-popover span {
  font-size: 0.8em;
}

.room-list-empty {
  color: rgba(255, 255, 255, 0.7);
  text-align: left;
}
</style>
