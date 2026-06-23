<template>
  <div id="controls">
    <div class="top-status-controls">
      <span
        v-show="session.sessionId"
        class="storytelling-status"
        :class="{ active: session.isStorytelling }"
      >
        {{ session.isStorytelling ? "说书中…" : "说书人准备中…" }}
      </span>
      <span
        class="review-details-summary"
        :class="{ unread: session.hasUnreadReviewDetails }"
        v-show="session.sessionId"
        @click="openReviewDetails"
        title="复盘详细"
      >
        <font-awesome-icon icon="clipboard" />
      </span>
      <span
        class="nomlog-summary"
        v-show="session.sessionId"
        @click="toggleModal('voteHistory')"
        :title="`投票记录：${session.voteHistory.length} 条`"
      >
        <font-awesome-icon icon="book-dead" />
        {{ session.voteHistory.length }}
      </span>
    </div>
    <span
      class="session"
      :class="{
        spectator: session.isSpectator,
        reconnecting: session.isReconnecting,
      }"
      v-if="
        !!session.sessionId &&
        (!session.isSpectator ||
          !!session.isHostAllowed ||
          !!session.isJoinAllowed)
      "
      @click="leaveSession"
    >
      <!-- <font-awesome-icon icon="broadcast-tower" />
      {{ session.playerCount }} -->
    </span>
    <div class="menu" :class="{ open: grimoire.isMenuOpen }" @click.stop>
      <font-awesome-icon icon="cog" @click.stop="toggleMenu" />
      <ul>
        <template v-if="!session.sessionId">
          <li class="headline">菜单</li>
          <div class="options">
            <li @click="$emit('trigger', ['uploadAvatar'])">上传头像</li>
            <li @click="useDefaultAvatar">使用默认头像</li>
            <li @click="editPlayerProfile">设置昵称/性别</li>
            <li @click="toggleStatic">
              关闭动画
              <em>
                <font-awesome-icon
                  :icon="['fas', grimoire.isStatic ? 'check-square' : 'square']"
                />
              </em>
            </li>
            <li @click="toggleMuted">
              静音
              <em>
                <font-awesome-icon
                  :icon="['fas', grimoire.isMuted ? 'check-square' : 'square']"
                />
              </em>
            </li>
            <li @click="clearLocalStorage">清空储存</li>
            <li @click="hostSession">创建房间</li>
            <li @click="joinSession">加入房间</li>
            <li @click="openRules">游戏规则</li>
            <li @click="openAbout">关于我们</li>
          </div>
        </template>

        <template v-else>
          <li class="tabs" :class="tab">
            <font-awesome-icon
              icon="book-open"
              v-if="isSessionTabVisible"
              @click="tab = 'session'"
            />
            <font-awesome-icon
              icon="theater-masks"
              @click="tab = 'characters'"
            />
            <font-awesome-icon
              icon="users"
              v-if="isPlayersTabVisible"
              @click="tab = 'players'"
            />
            <font-awesome-icon icon="question" @click="tab = 'help'" />
          </li>

          <template v-if="tab === 'session' && isSessionTabVisible">
            <!-- Session -->
            <li class="headline">
              {{ session.isSpectator ? "玩家" : "说书人" }}
            </li>
            <div class="options">
              <li
                v-if="!session.isSpectator"
                @click="previousPhase"
                :class="{
                  disabled: grimoire.phaseIndex <= 0,
                  locked: isStoryPreparation || session.isReview,
                }"
              >
                后退至前一阶段
              </li>
              <li
                v-if="!session.isSpectator"
                @click="nextPhase"
                :class="{ locked: isStoryPreparation || session.isReview }"
              >
                前进到下一阶段
              </li>
              <li @click="toggleModal('reference')">角色技能表</li>
              <li @click="toggleModal('nightOrder')">夜间顺序表</li>
              <li @click="toggleGrimoire" v-if="players.length">
                <template v-if="!grimoire.isPublic">隐藏角色</template>
                <template v-if="grimoire.isPublic">显示</template>
              </li>
              <li
                v-if="isOnlineStoryteller"
                @click="distributeAsk"
                :class="{ locked: isStoryPreparation || session.isReview }"
              >
                发送角色
              </li>
              <li
                v-if="isOnlineStoryteller"
                @click="distributeTypeAsk"
                :class="{ locked: isStoryPreparation || session.isReview }"
              >
                发送角色类型
              </li>
              <li
                v-if="isOnlineStoryteller"
                @click="distributeBluffsAsk"
                :class="{ locked: isStoryPreparation || session.isReview }"
              >
                发送伪装身份
              </li>
              <li
                v-if="isOnlineStoryteller"
                @click="distributeGrimoireAsk"
                :class="{ locked: isStoryPreparation || session.isReview }"
              >
                发送魔典
              </li>
              <li
                v-if="isOnlineStoryteller"
                @click="toggleIsReview"
                :class="{ locked: isStoryPreparation || session.isReview }"
              >
                复盘视角
                <em>
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      session.isReview ? 'check-square' : 'square',
                    ]"
                  />
                </em>
              </li>
            </div>
          </template>

          <template v-if="tab === 'players'">
            <!-- Users -->
            <li class="headline">房间和玩家</li>
            <div class="options">
              <li v-if="session.sessionId" @click="leaveSession">
                {{ session.isSpectator ? "退出房间" : "解散房间" }}
              </li>
              <li
                v-if="session.sessionId && !session.isSpectator"
                @click="showRoomPassword"
              >
                查看房间密码
              </li>
              <li
                @click="addPlayer"
                v-if="!session.isSpectator && players.length < 20"
              >
                添加座位<!--<em>[A]</em>-->
              </li>
              <li
                @click="randomizeSeatings"
                v-if="!session.isSpectator && players.length > 2"
                :class="{ locked: session.isStorytelling }"
              >
                随机座位
              </li>
              <li
                @click="clearPlayers"
                v-if="!session.isSpectator && players.length"
                :class="{ locked: session.isStorytelling }"
              >
                移除全部座位
              </li>
            </div>
          </template>

          <template v-if="tab === 'characters'">
            <!-- Characters -->
            <li class="headline">剧本和角色</li>
            <div class="options">
              <li
                v-if="!session.isSpectator"
                @click="startStorytelling"
                :class="{ active: session.isStorytelling }"
              >
                {{ session.isStorytelling ? "说书中" : "开始说书" }}
              </li>
              <li
                v-if="!session.isSpectator"
                @click="openEditionModal"
                :class="{ locked: session.isStorytelling }"
              >
                选择剧本
              </li>
              <li
                v-if="edition.id === 'all'"
                @click="selectEditionsAsk()"
                :class="{ locked: session.isStorytelling }"
              >
                <small> 选择全角色合集范围 </small>
              </li>
              <li
                @click="openRolesModal"
                v-if="!session.isSpectator && players.length > 4"
                :class="{ locked: session.isStorytelling }"
              >
                配置角色
              </li>
              <li
                v-if="!session.isSpectator"
                @click="useOldOrderAsk"
                :class="{ locked: session.isStorytelling }"
              >
                使用原夜间顺序
              </li>
              <li
                v-if="!session.isSpectator"
                @click="useOldRoleAsk"
                :class="{ locked: session.isStorytelling }"
              >
                使用原角色能力
              </li>
              <li v-if="!session.isSpectator" @click="customiseBootlegger">
                <small> 自定义私货商人 </small>
              </li>
              <li
                @click="clearRoles"
                v-if="players.length"
                :class="{ locked: isClearRecordsLocked }"
              >
                {{ session.isSpectator ? "重置全部记录" : "结束说书" }}
              </li>
            </div>
          </template>

          <template v-if="tab === 'help'">
            <!-- Help -->
            <li class="headline">帮助</li>
            <div class="options">
              <li v-if="session.sessionId" @click="copySessionUrl">复制链接</li>
              <li @click="openRules">游戏规则</li>
              <li @click="openAbout">关于我们</li>
              <li v-if="players.length">
                缩放
                <em>
                  <font-awesome-icon
                    @click.stop="setZoom(grimoire.zoom - 1)"
                    icon="search-minus"
                  />
                  {{ Math.round(100 + grimoire.zoom * 10) }}%
                  <font-awesome-icon
                    @click.stop="setZoom(grimoire.zoom + 1)"
                    icon="search-plus"
                  />
                </em>
              </li>
              <li @click="$emit('trigger', ['uploadAvatar'])">上传头像</li>
              <li @click="useDefaultAvatar">使用默认头像</li>
              <li @click="editPlayerProfile">设置昵称/性别</li>
              <li v-if="isExternalCustomEdition" @click="imageOptIn">
                <small>允许自定义图标</small>
                <em>
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      grimoire.isImageOptIn ? 'check-square' : 'square',
                    ]"
                  />
                </em>
              </li>
              <li @click="toggleStatic">
                关闭动画
                <em>
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      grimoire.isStatic ? 'check-square' : 'square',
                    ]"
                  />
                </em>
              </li>
              <li @click="toggleMuted">
                静音
                <em>
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      grimoire.isMuted ? 'check-square' : 'square',
                    ]"
                  />
                </em>
              </li>
              <li @click="clearLocalStorage">清空储存</li>
              <li v-if="!session.isSpectator" @click="toggleModal('gameState')">
                游戏状态JSON
              </li>
            </div>
          </template>
        </template>
      </ul>
    </div>

    <div v-if="selectingOldOrder" class="dialog">
      <span>
        <b>请选择想要使用原版顺序的官方角色</b>
      </span>
      <br />
      <span>
        <label>麻脸巫婆</label>
        <input
          type="checkbox"
          v-model="pendingOldOrder.pithag"
          class="checkbox"
        />
      </span>
      &emsp;
      <span>
        <label>教授</label>
        <input
          type="checkbox"
          v-model="pendingOldOrder.professor"
          class="checkbox"
        />
      </span>
      &emsp;
      <div>
        <button @click="selectOldOrder(true)">确定</button>
        <button @click="selectOldOrder(false)">取消</button>
      </div>
    </div>
    <div v-if="selectingOldRole" class="dialog">
      <span>
        <b>请选择想要使用原（旧）版能力的官方角色</b>
      </span>
      <br />
      <span>
        <label>气球驾驶员</label>
        <input
          type="checkbox"
          v-model="pendingOldRole.balloonist"
          class="checkbox"
        />
      </span>
      &emsp;
      <span>
        <label>杂技演员</label>
        <input
          type="checkbox"
          v-model="pendingOldRole.acrobat"
          class="checkbox"
        />
      </span>
      &emsp;
      <span>
        <label>小怪宝</label>
        <input
          type="checkbox"
          v-model="pendingOldRole.lilmonsta"
          class="checkbox"
        />
      </span>
      &emsp;
      <span>
        <label>炼金术士</label>
        <input
          type="checkbox"
          v-model="pendingOldRole.alchemist"
          class="checkbox"
        />
      </span>
      &emsp;
      <span>
        <label>半兽人</label>
        <input
          type="checkbox"
          v-model="pendingOldRole.lycanthrope"
          class="checkbox"
        />
      </span>
      &emsp;
      <div>
        <button @click="selectOldRole(true)">确定</button>
        <button @click="selectOldRole(false)">取消</button>
      </div>
    </div>
    <div v-if="distributing" class="dialog">
      <span>
        <label>是否同时给恶魔（疯子）发送伪装身份？</label>
        <input type="checkbox" v-model="isSendingBluff" class="checkbox" />
      </span>
      <div>
        <button @click="distributeRoles(true)">确定</button>
        <button @click="distributeRoles(false)">取消</button>
      </div>
    </div>
    <div v-if="distributingBluffs" class="dialog">
      <span>
        <label>发送伪装身份给：</label>
      </span>
      <div>
        <button @click="distributeBluffs('demon')">恶魔</button>
        <button @click="distributeBluffs('lunatic')">疯子</button>
        <button @click="distributeBluffs('minionAll')">所有爪牙</button>
        <button @click="distributeBluffs('snitch')">爪牙（告密者）</button>
        <button @click="distributeBluffs((role = null), (seat = true))">
          输入座位号
        </button>
        <button @click="distributeBluffs()">取消</button>
      </div>
    </div>
    <div v-if="distributingGrimoire" class="dialog">
      <span>
        <label>发送魔典给：</label>
      </span>
      <div>
        <button @click="distributeGrimoire('widow')">寡妇</button>
        <button @click="distributeGrimoire('spy')">间谍</button>
        <button @click="distributeGrimoire((role = null), (seat = true))">
          输入座位号
        </button>
        <button @click="distributeGrimoire()">取消</button>
      </div>
    </div>
    <div v-if="selectingEditions && edition.id === 'all'" class="dialog">
      <span>
        <b
          >请选择全角色合集的剧本范围（该功能仅对自己生效{{
            !session.isSpectator ? "，请说书人公开通知玩家" : ""
          }}）</b
        >
      </span>
      <br />
      <span>
        <label>暗流涌动</label>
        <input type="checkbox" v-model="pendingEditions.tb" class="checkbox" />
      </span>
      &emsp;
      <span>
        <label>暗月初生</label>
        <input type="checkbox" v-model="pendingEditions.bmr" class="checkbox" />
      </span>
      &emsp;
      <span>
        <label>梦殒春宵</label>
        <input type="checkbox" v-model="pendingEditions.snv" class="checkbox" />
      </span>
      &emsp;
      <span>
        <label>实验性角色</label>
        <input type="checkbox" v-model="pendingEditions.exp" class="checkbox" />
      </span>
      &emsp;
      <span>
        <label>华灯初上</label>
        <input
          type="checkbox"
          v-model="pendingEditions.hdcs"
          class="checkbox"
        />
      </span>
      &emsp;
      <span>
        <label>山雨欲来</label>
        <input
          type="checkbox"
          v-model="pendingEditions.syyl"
          class="checkbox"
        />
      </span>
      &emsp;
      <div>
        <button @click="selectEditions(true)">确定</button>
        <button @click="selectEditions(false)">取消</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapMutations, mapState } from "vuex";

export default {
  computed: {
    ...mapState([
      "grimoire",
      "session",
      "modals",
      "edition",
      "channels",
      "selectedEditions",
    ]),
    ...mapState("players", ["players"]),
    ...mapGetters(["defaultPlayerAvatar", "phaseLabelByIndex"]),
    previousPhaseLabel() {
      if (this.grimoire.phaseIndex <= 0) return "已是首夜";
      return this.phaseLabelByIndex(this.grimoire.phaseIndex - 1);
    },
    nextPhaseLabel() {
      return this.phaseLabelByIndex(this.grimoire.phaseIndex + 1);
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
    isExternalCustomEdition() {
      return (
        this.edition.id === "custom" && this.edition.imageSource !== "server"
      );
    },
    isSessionTabVisible() {
      return !!this.session.sessionId;
    },
    isPlayersTabVisible() {
      return !!this.session.sessionId;
    },
    isOnlineStoryteller() {
      return !!this.session.sessionId && !this.session.isSpectator;
    },
    isStoryConfigLocked() {
      return !this.session.isSpectator && this.session.isStorytelling;
    },
    isStoryPreparation() {
      return !this.session.isSpectator && !this.session.isStorytelling;
    },
    mustReviewBeforeEndingStorytelling() {
      return (
        !this.session.isSpectator &&
        this.session.isStorytelling &&
        !this.session.isReview
      );
    },
    isClearRecordsLocked() {
      return this.mustReviewBeforeEndingStorytelling;
    },
  },
  data() {
    return {
      tab: "session",
      timing: false,
      distributing: false,
      distributingBluffs: false,
      distributingGrimoire: false,
      distributingTypes: false,
      isSendingBluff: true,
      selectingEditions: false,
      selectingOldOrder: false,
      selectingOldRole: false,
      pendingEditions: {
        tb: true,
        bmr: true,
        snv: true,
        exp: true,
        hdcs: true,
        syyl: true,
      },
      pendingOldOrder: {
        pithag: false,
        professor: false,
      },
      pendingOldRole: {
        balloonist: false,
        acrobat: false,
        lilmonsta: false,
        alchemist: false,
        lycanthrope: false,
      },
    };
  },
  watch: {
    "session.sessionId"() {
      this.ensureVisibleTab();
    },
    "session.isSpectator"() {
      this.ensureVisibleTab();
    },
  },
  mounted() {
    this.ensureVisibleTab();
    document.addEventListener("click", this.closeMenu);
  },
  beforeDestroy() {
    document.removeEventListener("click", this.closeMenu);
  },
  methods: {
    ensureVisibleTab() {
      if (!this.session.sessionId) return;
      if (this.tab === "session" && !this.isSessionTabVisible) {
        this.tab = this.isPlayersTabVisible ? "players" : "characters";
      }
      if (this.tab === "players" && !this.isPlayersTabVisible) {
        this.tab = "characters";
      }
    },
    closeMenu() {
      if (this.grimoire.isMenuOpen) {
        this.setMenuOpen(false);
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
    requestErrorMessage(reason, fallback) {
      if (reason === "rateLimited") return "操作过于频繁，请稍后再试。";
      return fallback || reason || "操作失败，请稍后再试。";
    },
    async editPlayerProfile() {
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
      if (
        this.session.claimedSeat > -1 &&
        this.players[this.session.claimedSeat]
      ) {
        if (this.session.playerAvatarSource !== "uploaded") {
          this.$store.commit("players/update", {
            player: this.players[this.session.claimedSeat],
            property: "image",
            value: this.defaultPlayerAvatar,
          });
        }
        this.$store.commit("players/update", {
          player: this.players[this.session.claimedSeat],
          property: "name",
          value: name,
        });
        this.$store.commit("session/claimSeat", this.session.claimedSeat);
      }
      return true;
    },
    async useDefaultAvatar() {
      this.$store.commit("session/requestAvatarCleanup");
      this.$store.commit("session/setPlayerAvatarSource", "default");
      await this.$store.dispatch("refreshDefaultPlayerAvatar");
    },
    openRules() {
      window.open("/rules/", "_blank", "noopener");
    },
    openAbout() {
      window.open("/about/", "_blank", "noopener");
    },
    async ensurePlayerProfile() {
      if (this.session.playerName && this.session.playerGender) return true;
      return this.editPlayerProfile();
    },
    async hostSession() {
      if (!(await this.ensurePlayerProfile())) return;

      if (this.session.sessionId) return;
      if (this.session.rooms === null) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["网络连接不稳定，请稍等！"],
          },
        }).catch(() => {
          return null;
        });
        return;
      }

      const input = await this.showInputModal({
        inputType: "hostSession",
        inputModal: "input",
        inputData: {
          name: ["请输入玩家人数", "设置房间密码（可选）"],
          length: 2,
          placeholder: ["12", ""],
        },
      }).catch(() => {
        return null;
      });
      if (input === null) return;

      const numPlayers = Math.min(input[0], 20);
      const roomPassword = input[1] || "";
      const result = await this.$store.$liveLobby
        .createRoom({
          profile: {
            name: this.session.playerName,
            gender: this.session.playerGender,
          },
          playerCount: numPlayers,
          password: roomPassword,
        })
        .catch((error) => ({ ok: false, reason: error.message }));
      const sessionId = result.ok ? result.roomCode : "";
      if (sessionId) {
        this.$store.commit("session/clearVoteHistory", []);
        this.$store.commit("session/endStorytelling");
        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setRoomPassword", roomPassword);
        this.$store.commit("setPhaseIndex", 0);
        this.$store.commit("session/setSessionId", sessionId);
        this.$store.commit("players/clear");
        for (let i = 0; i < numPlayers; i++) {
          this.addPlayer();
        }
      } else {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: [
              this.requestErrorMessage(
                result.reason,
                result.reason || "创建房间失败，请稍后再试。",
              ),
            ],
          },
        }).catch(() => {
          return null;
        });
      }
    },
    buildSessionUrl() {
      const url = new URL(window.location.href);
      url.hash = this.session.sessionId;
      return url.href;
    },
    async copyTextToClipboard(text) {
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (e) {
          // Fall through to the textarea fallback for browsers that reject
          // Clipboard API writes outside a narrow user-gesture window.
        }
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (e) {
        copied = false;
      } finally {
        document.body.removeChild(textarea);
      }

      return copied;
    },
    showNotification(text) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.$store.commit("addNotification", { id, text });
      window.setTimeout(() => {
        this.$store.commit("removeNotification", id);
      }, 3500);
    },
    async copySessionUrl() {
      if (!this.session.sessionId) return false;
      const link = this.buildSessionUrl();
      const copied = await this.copyTextToClipboard(link);
      if (copied) {
        this.showNotification("房间链接已复制");
      } else {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: [`无法复制房间链接，请手动复制：${link}`],
          },
        }).catch(() => {
          return null;
        });
      }
      return copied;
    },
    async showRoomPassword() {
      await this.showInputModal({
        inputType: "alert",
        inputModal: "text",
        inputData: {
          name: [
            this.session.roomPassword
              ? `房间密码：${this.session.roomPassword}`
              : "该房间未设置密码。",
          ],
        },
      }).catch(() => {
        return null;
      });
    },
    distributeAsk() {
      if (this.isStoryPreparation) return;
      if (this.session.isReview) return;
      this.distributingBluffs = false;
      this.distributingGrimoire = false;
      this.distributingTypes = false;
      this.distributing = !this.distributing;
    },
    distributeRoles(confirm) {
      this.$nextTick(() => {
        document.getElementById("app").focus();
      });
      this.distributing = false;
      if (!confirm) return;
      if (this.session.isSpectator) return;
      if (this.session.isReview) return;
      this.$store.commit("session/distributeRoles", true);
      setTimeout(
        (() => {
          this.$store.commit("session/distributeRoles", false);
        }).bind(this),
        2000,
      );
      if (!this.isSendingBluff) return;
      this.$store.commit("session/distributeBluffs", {
        val: true,
        role: "demonAll",
      });
      setTimeout(
        (() => {
          this.$store.commit("session/distributeBluffs", { val: false });
        }).bind(this),
        2000,
      );
    },
    async distributeTypeAsk() {
      if (this.isStoryPreparation) return;
      if (this.session.isReview) return;
      this.distributing = false;
      this.distributingBluffs = false;
      this.distributingGrimoire = false;
      this.distributingTypes = !this.distributingTypes;

      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["确定要发送角色类型给玩家？"],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;

      if (confirm === true) {
        this.distributeTypes();
      }
    },
    distributeTypes() {
      this.distributingTypes = false;
      if (this.session.isSpectator) return;
      if (this.session.isReview) return;
      this.$store.commit("session/distributeTypes", true);
      setTimeout(
        (() => {
          this.$store.commit("session/distributeTypes", false);
        }).bind(this),
        2000,
      );
    },
    distributeBluffsAsk() {
      if (this.isStoryPreparation) return;
      if (this.session.isReview) return;
      this.distributing = false;
      this.distributingGrimoire = false;
      this.distributingTypes = false;
      this.distributingBluffs = !this.distributingBluffs;
    },
    async distributeBluffs(role = null, seat = false) {
      this.$nextTick(() => {
        document.getElementById("app").focus();
      });
      if (this.session.isReview) {
        this.distributingBluffs = false;
        return;
      }
      if (!role && !seat) {
        this.distributingBluffs = false;
        return;
      }
      let seatNum;
      if (seat) {
        const input = await this.showInputModal({
          inputType: "seatNum",
          inputModal: "input",
          inputData: {
            name: ["请输入座位号"],
            length: 1,
            placeholder: [""],
          },
        }).catch(() => {
          return null;
        });
        if (input === null) return;
        seatNum = input[0];
      }

      var roleText = "";
      switch (role) {
        case "demon":
          roleText = "恶魔";
          break;
        case "lunatic":
          roleText = "疯子";
          break;
        case "minionAll":
          roleText = "所有爪牙";
          break;
        case "snitch":
          roleText = "爪牙（告密者）";
          break;
      }
      const text = roleText ? roleText : seatNum + "号位";
      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["确定要发送伪装身份给" + text + "？"],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;
      if (confirm === true) {
        if (this.session.isSpectator) return;
        if (this.session.isReview) return;
        this.$store.commit("session/distributeBluffs", {
          val: true,
          role,
          seatNum,
        });
        setTimeout(
          (() => {
            this.$store.commit("session/distributeBluffs", { val: false });
          }).bind(this),
          2000,
        );
        this.distributingBluffs = false;
      }
    },
    distributeGrimoireAsk() {
      if (this.isStoryPreparation) return;
      if (this.session.isReview) return;
      this.distributing = false;
      this.distributingBluffs = false;
      this.distributingTypes = false;
      this.distributingGrimoire = !this.distributingGrimoire;
    },
    async distributeGrimoire(role = null, seat = false) {
      this.$nextTick(() => {
        document.getElementById("app").focus();
      });
      if (this.session.isReview) {
        this.distributingGrimoire = false;
        return;
      }
      if (!role && !seat) {
        this.distributingGrimoire = false;
        return;
      }

      let seatNum;
      if (seat) {
        const input = await this.showInputModal({
          inputType: "seatNum",
          inputModal: "input",
          inputData: {
            name: ["请输入座位号"],
            length: 1,
            placeholder: [""],
          },
        }).catch(() => {
          return null;
        });
        if (input === null) return;
        seatNum = input[0];
      }

      let roleText;
      switch (role) {
        case "widow":
          roleText = "寡妇";
          break;
        case "spy":
          roleText = "间谍";
          break;
      }
      const text = roleText ? roleText : seatNum + "号位";

      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["确定要发送魔典给" + text + "？"],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;

      if (confirm === true) {
        if (this.session.isSpectator) return;
        if (this.session.isReview) return;
        this.$store.commit("session/distributeGrimoire", {
          val: true,
          role,
          seatNum,
        });
        setTimeout(
          (() => {
            this.$store.commit("session/distributeGrimoire", { val: false });
          }).bind(this),
          2000,
        );
        this.distributingGrimoire = false;
      }
    },
    openEditionModal() {
      if (this.isStoryConfigLocked) return;
      this.toggleModal("edition");
    },
    openRolesModal() {
      if (this.isStoryConfigLocked) return;
      this.toggleModal("roles");
    },
    selectEditionsAsk() {
      if (this.isStoryConfigLocked) return;
      if (this.edition.id !== "all") return;
      this.selectingEditions = !this.selectingEditions;
      if (this.selectingEditions)
        this.pendingEditions = { ...this.selectedEditions };
    },
    selectEditions(update = false) {
      this.$nextTick(() => {
        document.getElementById("app").focus();
      });

      this.selectingEditions = false;
      if (!update) return;
      this.$store.commit("setSelectedEditions", this.pendingEditions);
    },
    async imageOptIn() {
      const popup = this.grimoire.isImageOptIn
        ? false
        : await this.showInputModal({
            inputType: "confirm",
            inputModal: "confirm",
            inputData: {
              name: [
                "确定要启用自定义游戏图标吗？木马剧本拥有者可能以此来追踪你的IP地址。",
              ],
            },
          }).catch(() => {
            return null;
          });
      if (popup === null) return;

      if (this.grimoire.isImageOptIn || popup === true) {
        this.toggleImageOptIn();
      }
    },
    async joinSession() {
      if (this.session.sessionId) return this.leaveSession();
      if (!(await this.ensurePlayerProfile())) return;

      if (this.session.rooms === null) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["网络连接不稳定，请稍等！"],
          },
        }).catch(() => {
          return null;
        });
        return;
      }
      if (Date.now() - this.session.roomListRefreshedAt >= 15 * 1000) {
        this.$store.commit("session/setRoomListRefreshedAt", Date.now());
        this.$store.commit("session/requestRoomListRefresh");
      }
      const input = await this.showInputModal({
        inputType: "joinSession",
        inputModal: "input",
        inputData: {
          name: [],
          length: 0,
          placeholder: [],
        },
      }).catch(() => {
        return null;
      });
      if (input === null) return;

      const sessionId = Number(input[0].split("#").pop()).toString();
      if (sessionId) {
        const room = this.session.roomDetails.find(
          (detail) => detail.id === sessionId,
        );
        if (room && room.hasPassword) {
          const savedPassword = this.session.savedRoomPasswords[sessionId];
          if (savedPassword) {
            this.$store.commit("session/setPendingJoinPassword", savedPassword);
          } else {
            const passwordInput = await this.showInputModal({
              inputType: "roomPassword",
              inputModal: "input",
              inputData: {
                name: ["请输入房间密码"],
                length: 1,
                placeholder: [""],
              },
            }).catch(() => {
              return null;
            });
            if (passwordInput === null) return;
            this.$store.commit(
              "session/setPendingJoinPassword",
              passwordInput[0] || "",
            );
          }
        } else {
          this.$store.commit("session/setPendingJoinPassword", "");
        }
        const result = await this.$store.$liveLobby
          .joinRoom({
            profile: {
              name: this.session.playerName,
              gender: this.session.playerGender,
            },
            roomCode: sessionId,
            password: this.session.pendingJoinPassword,
          })
          .catch((error) => ({ ok: false, reason: error.message }));
        if (result.ok) {
          this.$store.commit("session/clearVoteHistory", []);
          this.$store.commit("session/endStorytelling");
          this.$store.commit("session/setSpectator", true);
          this.$store.commit("toggleGrimoire", false);
          this.$store.commit("session/setSessionId", result.roomCode);
        } else {
          await this.showInputModal({
            inputType: "alert",
            inputModal: "text",
            inputData: {
              name: [
                this.requestErrorMessage(
                  result.reason,
                  result.reason === "password"
                    ? "房间密码错误！"
                    : "无法加入房间。",
                ),
              ],
            },
          }).catch(() => {
            return null;
          });
        }
      }
    },
    async leaveSession() {
      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["确定要离开/解散该房间吗？"],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;

      if (confirm === true) {
        const wasSpectator = this.session.isSpectator;
        if (wasSpectator) {
          this.$store.commit("session/setLeavingRoom", true);
        } else {
          this.$store.commit("session/setClosingRoom", true);
        }
        this.$store.dispatch("resetRoomState");
      }
    },
    addPlayer(stImage = null, stName = null) {
      if (this.session.isSpectator) return;
      if (this.players.length >= 20) return;

      this.$store.commit("players/add", { name: "", stImage, stName });
      if (this.session.isStorytelling) {
        this.$store.commit("session/addInitialRoleSnapshot", {
          seat: this.players.length,
          roleId: "",
        });
      }
    },
    async randomizeSeatings() {
      if (this.session.isSpectator) return;
      if (this.session.isStorytelling) return;

      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["确定要随机分配座位吗？"],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;

      if (confirm === true) {
        this.$store.dispatch("players/randomize");
      }
    },
    async clearPlayers() {
      if (this.session.isSpectator) return;
      if (this.session.isStorytelling) return;

      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["确定要移除所有座位吗？"],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;

      if (confirm === true) {
        // abort vote if in progress
        if (this.session.nomination) {
          this.$store.commit("session/nomination");
        }
        if (this.session.sessionId) {
          this.$store.commit("players/clear");
        } else {
          this.$store.commit("players/clear", true);
        }
      }
    },
    async clearRoles() {
      if (this.mustReviewBeforeEndingStorytelling) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["请先开启复盘视角，再结束说书。"],
          },
        }).catch(() => {
          return null;
        });
        return;
      }
      if (this.isClearRecordsLocked) return;

      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: [
            this.session.isSpectator
              ? "确定要重置全部记录吗？"
              : "确定要结束说书并重置全部角色吗？",
          ],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;

      if (confirm === true) {
        if (!this.session.isSpectator) {
          this.$store.commit("session/endStorytelling");
          this.$store.commit("session/clearVoteHistory", []);
          this.$store.commit("setPhaseIndex", 0);
          this.$store.commit("session/setIsReview", false);
        } else {
          this.$store.commit("session/clearReceivedReviewDetails");
        }
        this.$store.dispatch("players/clearRoles");
      }
    },
    openReviewDetails() {
      this.toggleModal("reviewDetails");
    },
    startStorytelling() {
      if (this.session.isSpectator || this.session.isStorytelling) return;
      this.$store.commit("session/startStorytelling", this.players);
    },
    async customiseBootlegger() {
      if (this.session.isSpectator) return;

      const input = await this.showInputModal({
        inputType: "bootlegger",
        inputModal: "input",
        inputData: {
          name: ["输入私货商人内容"],
          length: 1,
          placeholder: [""],
        },
      }).catch(() => {
        return null;
      });
      if (input === null) return;

      const content = input[0].trim();
      this.$store.commit("session/setBootlegger", content);
    },
    previousPhase() {
      if (this.isStoryPreparation) return;
      if (this.session.isReview) return;
      if (this.grimoire.phaseIndex <= 0) return;
      this.$store.commit("previousPhase");
      if (this.grimoire.isNight) {
        this.$store.commit("session/setMarkedPlayer", -1);
      }
    },
    nextPhase() {
      if (this.isStoryPreparation) return;
      if (this.session.isReview) return;
      this.$store.commit("nextPhase");
      if (this.grimoire.isNight) {
        this.$store.commit("session/setMarkedPlayer", -1);
      }
    },
    async toggleIsReview() {
      if (this.isStoryPreparation) return;
      if (this.isSpectator) return;
      if (this.session.isReview) return;

      const confirm = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: [
            "是否开启复盘视角？（所有玩家将看到角色，开启后只能通过结束说书重置）",
          ],
        },
      }).catch(() => {
        return null;
      });
      if (confirm === null) return;

      if (confirm === true) {
        this.distributing = false;
        this.distributingTypes = false;
        this.distributingBluffs = false;
        this.distributingGrimoire = false;
        this.$store.commit("session/startReview", {
          phaseIndex: this.grimoire.phaseIndex,
        });
      }
    },
    useOldOrderAsk() {
      if (this.isStoryConfigLocked) return;
      this.selectingOldRole = false;
      this.selectingOldOrder = !this.selectingOldOrder;
      if (this.selectingOldOrder)
        this.pendingOldOrder = { ...this.session.isUseOldOrder };
    },
    selectOldOrder(update = false) {
      this.$nextTick(() => {
        document.getElementById("app").focus();
      });
      this.selectingOldOrder = false;
      if (!update) return;
      this.$store.commit("session/setUseOldOrder", this.pendingOldOrder);
      this.$store.commit("setEdition", this.edition);
    },
    useOldRoleAsk() {
      if (this.isStoryConfigLocked) return;
      this.selectingOldOrder = false;
      this.selectingOldRole = !this.selectingOldRole;
      if (this.selectingOldRole)
        this.pendingOldRole = { ...this.session.isUseOldRole };
    },
    selectOldRole(update = false) {
      this.$nextTick(() => {
        document.getElementById("app").focus();
      });
      this.selectingOldRole = false;
      if (!update) return;
      this.$store.commit("session/setUseOldRole", this.pendingOldRole);
      if (localStorage.getItem("roles"))
        this.$store.commit("setCustomRoles", JSON.parse(localStorage.roles));
      this.$store.commit("setEdition", this.edition);
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
      if (!timeNum) return;
      if (timeNum <= 0) return;
      this.timing = true;
      this.stopTimer();
      this.startTimer(timeNum * 60);
    },
    startTimer(time = null) {
      if (this.session.isSpectator) return;
      if (typeof time != "number") time = this.session.timer;
      this.$store.commit("session/startTimer", time);
      this.timing = true;
    },
    stopTimer() {
      if (this.session.isSpectator) return;
      this.$store.commit("session/stopTimer");
      this.timing = false;
    },
    async clearLocalStorage() {
      const clear = await this.showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["确定清空所有内容吗？（将清除昵称、头像等）"],
        },
      }).catch(() => {
        return null;
      });
      if (clear === null) return;

      if (!clear) return;
      if (this.session.sessionId) {
        this.$store.commit("session/claimSeat", -1);
        if (this.session.isSpectator) {
          this.$store.commit("session/setLeavingRoom", true);
        } else {
          this.$store.commit("session/setClosingRoom", true);
          this.$store.commit("session/setRoomPassword", "");
        }
        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setSessionId", "");
      }
      localStorage.clear();
      await this.showInputModal({
        inputType: "alert",
        inputModal: "text",
        inputData: {
          name: ["清理完成，请刷新网页！"],
        },
      }).catch(() => {
        return null;
      });
      return;
    },
    ...mapMutations([
      "toggleGrimoire",
      "toggleMenu",
      "setMenuOpen",
      "setImageOptIn",
      "toggleImageOptIn",
      "toggleForwardEvilInfo",
      "toggleMuted",
      "toggleStatic",
      "setZoom",
      "toggleModal",
    ]),
  },
};
</script>

<style scoped lang="scss">
@import "../vars.scss";

// success animation
@keyframes greenToWhite {
  from {
    color: green;
  }
  to {
    color: white;
  }
}

/* width */
::-webkit-scrollbar {
  width: 5px;
}
/* Handle */
::-webkit-scrollbar-thumb {
  background: rgb(54, 54, 54);
  border-radius: 10px;
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
  background: rgb(97, 97, 97);
}

// Controls
#controls {
  position: absolute;
  right: 3px;
  top: 3px;
  text-align: right;
  padding-right: 50px;
  z-index: 75;

  svg {
    filter: drop-shadow(0 0 5px rgba(0, 0, 0, 1));
    &.success {
      animation: greenToWhite 1s normal forwards;
      animation-iteration-count: 1;
    }
  }

  > span {
    display: inline-block;
    cursor: pointer;
    z-index: 5;
    margin-top: 7px;
    margin-left: 10px;
  }

  span.session {
    color: $demon;
    &.spectator {
      color: $townsfolk;
    }
    &.reconnecting {
      animation: blink 1s infinite;
    }
  }
}

.top-status-controls {
  position: absolute;
  top: 7px;
  right: 62px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: max-content;
  max-width: calc(100vw - 92px);
  z-index: 3;

  .nomlog-summary,
  .review-details-summary {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    padding: 3px 6px;
    box-sizing: border-box;
    color: $townsfolk;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 5px;
    cursor: pointer;
    font-family: "Roboto Condensed", Arial, "Noto Sans", "PingFang SC",
      "Microsoft YaHei", sans-serif;
    font-size: clamp(12px, 1.2vw, 14px);
    line-height: 1.15;
    white-space: nowrap;
  }

  .review-details-summary {
    position: relative;

    &.unread {
      color: red;
      box-shadow: 0 0 0 1px rgba(255, 0, 0, 0.75);

      &::after {
        content: "";
        position: absolute;
        top: -3px;
        right: -3px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: red;
      }
    }
  }

  .storytelling-status {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 3px 6px;
    box-sizing: border-box;
    color: white;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 5px;
    font-family: "Roboto Condensed", Arial, "Noto Sans", "PingFang SC",
      "Microsoft YaHei", sans-serif;
    font-size: clamp(12px, 1.2vw, 14px);
    line-height: 1.15;
    white-space: nowrap;

    &.active {
      color: red;
      font-weight: bold;
    }
  }
}

@keyframes blink {
  50% {
    opacity: 0.5;
    color: gray;
  }
}

.menu {
  width: 220px;
  transform-origin: 200px 22px;
  transition: transform 500ms cubic-bezier(0.68, -0.55, 0.27, 1.55);
  transform: rotate(-90deg);
  position: absolute;
  right: 0;
  top: 0;

  &.open {
    transform: rotate(0deg);
  }

  > svg {
    cursor: pointer;
    background: rgba(0, 0, 0, 0.5);
    border: 3px solid black;
    width: 40px;
    height: 50px;
    margin-bottom: -8px;
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
    padding: 5px 5px 15px;
  }

  a {
    color: white;
    text-decoration: none;
    &:hover {
      color: red;
    }
  }

  ul {
    display: flex;
    list-style-type: none;
    padding: 0;
    margin: 0;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 0 10px black;
    border: 3px solid black;
    border-radius: 10px 0 10px 10px;

    .options {
      overflow-y: auto;
      max-height: calc(85vh - 100px); /* Adjust this value as needed */
    }

    li {
      padding: 2px 5px;
      color: white;
      text-align: left;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 30px;

      .wrap {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
      }

      .input {
        width: 45px; // Shrink the width significantly
        right: 0px;
        padding: 2px 3px; // Reduce padding
        border: 1px solid rgba(255, 255, 255, 0.3);
        // background: rgba(0, 0, 0, 0.5);
        background: white;
        color: black;
        text-align: right; // Ensure the number input content is right-aligned
        font-size: inherit; // Make it match the surrounding text font size
        line-height: inherit; // Make it match the surrounding text line height

        // Hide arrows for different browsers
        appearance: textfield; // Firefox
        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button {
          -webkit-appearance: none; // Chrome, Safari, Edge
          margin: 0; // Remove margin that might be added by default
        }
      }

      &.tabs {
        display: flex;
        padding: 0;
        svg {
          flex-grow: 1;
          flex-shrink: 0;
          height: 35px;
          border-bottom: 3px solid black;
          border-right: 3px solid black;
          padding: 5px 0;
          cursor: pointer;
          transition: color 250ms;
          &:hover {
            color: red;
          }
          &:last-child {
            border-right: 0;
          }
        }
        &.session .fa-book-open,
        &.players .fa-users,
        &.characters .fa-theater-masks,
        &.help .fa-question {
          background: linear-gradient(
            to bottom,
            $townsfolk 0%,
            rgba(0, 0, 0, 0.5) 100%
          );
        }
      }

      &:not(.headline):not(.tabs):hover {
        cursor: pointer;
        color: red;
      }

      &.disabled,
      &.disabled:hover {
        cursor: default;
        color: rgba(255, 255, 255, 0.45);
      }

      &.active,
      &.active:hover {
        cursor: default;
        color: red;
      }

      &.locked,
      &.locked:hover {
        cursor: default;
        color: rgba(255, 255, 255, 0.45);
      }

      em {
        flex-grow: 0;
        font-style: normal;
        margin-left: 10px;
        font-size: 80%;
      }
    }

    .headline {
      font-family: PiratesBay, sans-serif;
      letter-spacing: 1px;
      padding: 0 10px;
      text-align: center;
      justify-content: center;
      background: linear-gradient(
        to right,
        $townsfolk 0%,
        rgba(0, 0, 0, 0.5) 20%,
        rgba(0, 0, 0, 0.5) 80%,
        $demon 100%
      );
    }
  }
}

.dialog {
  background-color: #000;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 5px;
  text-align: center;
}

.dialog .checkbox {
  width: 20px;
  height: 20px;
}
</style>
