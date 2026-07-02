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
        <template v-if="!isJoinSessionInput">
          <div v-for="n in session.inputData.length" :key="n">
            <label>{{ session.inputData.name[n - 1] }}</label>
            <div v-if="fieldType(n) === 'gender'" class="gender-options">
              <button
                type="button"
                :class="{ active: input[n - 1] === 'female' }"
                @click="setGender(n, 'female')"
              >
                女
              </button>
              <button
                type="button"
                :class="{ active: input[n - 1] === 'male' }"
                @click="setGender(n, 'male')"
              >
                男
              </button>
            </div>
            <input
              v-else
              type="text"
              :id="'input-' + n"
              :ref="'input-' + n"
              autocomplete="off"
              @focus="typing"
              @blur="notTyping"
              v-model="input[n - 1]"
            />
          </div>
        </template>
        <div v-if="isJoinSessionInput" class="room-list">
          <div class="room-list-header">
            <div class="room-list-title">当前房间</div>
            <button
              type="button"
              class="room-list-refresh"
              :disabled="!canRefreshRooms"
              @click="refreshRoomList"
            >
              {{ refreshRoomButtonText }}
            </button>
          </div>
          <div class="room-list-controls">
            <button
              type="button"
              :class="{ active: roomSort.startsWith('id-') }"
              @click="toggleRoomSort('id')"
            >
              ID {{ roomSort === "id-desc" ? "↓" : "↑" }}
            </button>
            <button
              type="button"
              :class="{ active: roomSort.startsWith('created-') }"
              @click="toggleRoomSort('created')"
            >
              创建 {{ roomSort === "created-asc" ? "↑" : "↓" }}
            </button>
            <button
              type="button"
              :class="{ active: onlineOnly }"
              @click="onlineOnly = !onlineOnly"
            >
              仅在线
            </button>
            <button
              type="button"
              :class="{ active: roomStoryFilter === 'all' }"
              @click="roomStoryFilter = 'all'"
            >
              全部
            </button>
            <button
              type="button"
              :class="{ active: roomStoryFilter === 'storytelling' }"
              @click="roomStoryFilter = 'storytelling'"
            >
              说书中
            </button>
            <button
              type="button"
              :class="{ active: roomStoryFilter === 'preparing' }"
              @click="roomStoryFilter = 'preparing'"
            >
              准备中
            </button>
          </div>
          <div v-if="sortedRoomDetails.length" class="room-list-items">
            <div
              v-for="room in sortedRoomDetails"
              :key="room.id"
              class="room-list-row selectable"
              role="button"
              tabindex="0"
              @click="selectRoom(room)"
              @keydown.enter.prevent="selectRoom(room)"
              @keydown.space.prevent="selectRoom(room)"
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
                <span
                  :class="[
                    'room-story-status',
                    room.isStorytelling ? 'storytelling' : 'preparing',
                  ]"
                >
                  {{ room.isStorytelling ? "说书中" : "准备中" }}
                </span>
                <span v-if="room.hostOnline && room.playerCount != null">
                  配置：{{ room.playerCount }}人
                </span>
                <span v-else>配置：未知</span>
              </div>
            </div>
          </div>
          <div v-else class="room-list-empty">暂无可加入的房间</div>
        </div>
        <div class="input-actions">
          <button v-if="!isJoinSessionInput" type="submit" class="confirm">
            确认
          </button>
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
    <div v-else-if="session.inputModal === 'winner'">
      <form class="input-box winner-box" @submit.prevent tabindex="-1">
        <label>{{ session.inputData.name[0] }}</label>
        <div class="winner-actions">
          <button
            type="button"
            class="winner-good"
            ref="winnerGood"
            @click="confirmWinner('good')"
          >
            善良获胜
          </button>
          <button
            type="button"
            class="winner-evil"
            @click="confirmWinner('evil')"
          >
            邪恶获胜
          </button>
        </div>
        <div class="input-actions">
          <button type="button" @click="close" class="cancel">取消</button>
        </div>
      </form>
    </div>
    <div v-else-if="session.inputModal === 'text'">
      <form class="input-box text-box" @submit.prevent="close" tabindex="-1">
        <label>{{ session.inputData.name[0] }}</label>
        <div class="input-actions">
          <button
            v-if="session.inputData.actionLabel"
            type="button"
            @click="confirmTextAction"
          >
            {{ session.inputData.actionLabel }}
          </button>
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
      const onlineRooms = this.onlineOnly
        ? (this.session.roomDetails || []).filter((room) => room.hostOnline)
        : this.session.roomDetails || [];
      const rooms = onlineRooms.filter((room) => {
        if (this.roomStoryFilter === "storytelling") {
          return !!room.isStorytelling;
        }
        if (this.roomStoryFilter === "preparing") {
          return !room.isStorytelling;
        }
        return true;
      });
      return [...rooms].sort((a, b) => {
        if (this.roomSort === "created-desc") {
          return Number(b.createdAt || 0) - Number(a.createdAt || 0);
        }
        if (this.roomSort === "created-asc") {
          return Number(a.createdAt || 0) - Number(b.createdAt || 0);
        }
        const idOrder = String(a.id).localeCompare(String(b.id), undefined, {
          numeric: true,
        });
        return this.roomSort === "id-desc" ? -idOrder : idOrder;
      });
    },
    canRefreshRooms() {
      return this.now - this.session.roomListRefreshedAt >= 15 * 1000;
    },
    refreshRoomCooldownSeconds() {
      if (this.canRefreshRooms) return 0;
      return Math.ceil(
        (15 * 1000 - (this.now - this.session.roomListRefreshedAt)) / 1000,
      );
    },
    refreshRoomButtonText() {
      return this.canRefreshRooms
        ? "刷新"
        : `${this.refreshRoomCooldownSeconds}秒后刷新`;
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
      roomSort: "id-asc",
      onlineOnly: false,
      roomStoryFilter: "all",
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
            if (this.isJoinSessionInput) {
              this.refreshRoomList();
            } else {
              this.$refs["input-1"][0].select();
            }
          });
        } else if (this.session.inputModal === "confirm") {
          this.$nextTick(() => {
            this.$refs.confirmYes.focus();
          });
        } else if (this.session.inputModal === "winner") {
          this.$nextTick(() => {
            this.$refs.winnerGood.focus();
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
    }, 1000);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize);
    clearInterval(this.relativeTimer);
  },
  methods: {
    typing() {
      this.$store.commit("session/setTyping", true);
    },
    notTyping() {
      this.$store.commit("session/setTyping", false);
    },
    fieldType(n) {
      return this.session.inputData.types
        ? this.session.inputData.types[n - 1]
        : "text";
    },
    setGender(n, gender) {
      this.$set(this.input, n - 1, gender);
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
        case "playerProfile":
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
            if (
              this.session.inputType === "playerProfile" &&
              !["male", "female"].includes(this.input[1])
            ) {
              this.warningMessage = "请选择性别！";
              return;
            }
          }
          break;
        case "hostSession":
          {
            const numPlayers = this.input[0];
            const password = this.input[1] || "";
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
          return;
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
    confirmWinner(winnerTeam) {
      if (this.session.inputResolver) {
        this.session.inputResolver(winnerTeam);
      }
      this.close();
    },
    confirmTextAction() {
      if (this.session.inputResolver) {
        this.session.inputResolver(this.session.inputData.action || true);
      }
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
    refreshRoomList() {
      if (!this.canRefreshRooms) return;
      this.$store.commit("session/setRoomListRefreshedAt", Date.now());
      this.now = Date.now();
      this.$store.commit("session/requestRoomListRefresh");
    },
    toggleRoomSort(field) {
      const asc = `${field}-asc`;
      const desc = `${field}-desc`;
      this.roomSort = this.roomSort === asc ? desc : asc;
    },
    selectRoom(room) {
      if (!room) return;
      if (!room.hostOnline) {
        this.warningMessage = "说书人暂时离开，稍后再试。";
        return;
      }
      if (this.session.inputResolver) {
        this.session.inputResolver([room.id]);
      }
      this.close();
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

.winner-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.input-box .winner-actions button {
  min-height: 44px;
  color: white;
  font-size: 110%;
  text-shadow: 0 1px 2px black;
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

.input-box button.winner-good,
.input-box button.winner-good:hover {
  background-color: #1267d8;
}

.input-box button.winner-evil,
.input-box button.winner-evil:hover {
  background-color: #b41414;
}

.gender-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  button {
    border-radius: 8px;
    background-color: #333 !important;
    color: #fff !important;

    &.active {
      background-color: #0a65dd !important;
    }
  }
}

.warning {
  color: red;
}

.room-list {
  width: 100%;
  max-height: 440px;
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

.room-list-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.room-list-controls button {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  font-size: 0.78em;
}

.room-list-controls button.active {
  background: #0a65dd !important;
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

.room-list-row.selectable {
  cursor: pointer;
}

.room-list-row.selectable:focus,
.room-list-row.selectable:hover {
  background: rgba(255, 255, 255, 0.14);
  outline: none;
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

.room-story-status {
  padding: 2px 7px;
  border-radius: 999px;
  font-weight: bold;
  opacity: 1;
}

.room-story-status.preparing {
  color: #e6e6e6;
  background: rgba(255, 255, 255, 0.16);
}

.room-story-status.storytelling {
  color: #ffd1d1;
  background: rgba(180, 38, 38, 0.45);
}

.room-list-empty {
  color: rgba(255, 255, 255, 0.7);
  text-align: left;
}
</style>
