<template>
  <Modal
    class="review-details"
    v-if="modals.reviewDetails"
    @close="toggleModal('reviewDetails')"
  >
    <h3>复盘详细</h3>

    <div v-if="!records.length" class="empty">暂无复盘详细。</div>
    <div v-else class="review-record-layout">
      <aside class="review-records">
        <ul>
          <li
            v-for="(record, index) in records"
            :key="record.id"
            :class="{
              active: record.id === selectedReviewId,
              unread: isUnreadRecord(record),
            }"
          >
            <button
              type="button"
              class="record-select"
              @click="selectRecord(record)"
            >
              <span class="record-title">
                {{ recordTitle(record, index) }}
              </span>
              <span class="record-time">
                开始：{{ formatDateTime(record.storytellingStartedAt) }}
              </span>
              <span class="record-time">
                结束：{{ recordEndText(record) }}
              </span>
            </button>
            <button
              v-if="canDeleteRecord(record)"
              type="button"
              class="record-delete"
              title="删除这局复盘详情"
              aria-label="删除这局复盘详情"
              @click.stop="deleteRecord(record)"
            >
              <font-awesome-icon icon="trash-alt" />
            </button>
          </li>
        </ul>
      </aside>

      <div class="review-record-detail">
        <header class="record-header">
          <div>
            <h4>{{ selectedRecordTitle }}</h4>
            <p>
              {{ formatDateTime(details.storytellingStartedAt) }} -
              {{ recordEndText(details) }}
            </p>
          </div>
          <button
            v-if="canDeleteRecord(details)"
            type="button"
            class="record-delete detail-delete"
            title="删除这局复盘详情"
            aria-label="删除这局复盘详情"
            @click="deleteRecord(details)"
          >
            <font-awesome-icon icon="trash-alt" />
          </button>
        </header>

        <div v-if="!hasContent" class="empty">暂无复盘详细。</div>
        <template v-else>
          <section>
            <h4>玩家初始角色</h4>
            <ul class="initial-roles" v-if="initialRoles.length">
              <li v-for="entry in initialRoles" :key="entry.seat">
                <span class="initial-role-seat">座位{{ entry.seat }}</span>
                <span
                  class="initial-role-name role-chip"
                  :class="roleTeamClass(entry.roleId)"
                >
                  {{ roleName(entry.roleId) }}
                </span>
              </li>
            </ul>
            <div v-else class="empty-inline">无记录</div>
          </section>

          <section>
            <h4>不在场角色</h4>
            <div v-if="bluffs.length" class="bluffs">
              <span
                v-for="entry in bluffs"
                :key="entry.roleId"
                class="role-chip"
                :class="roleTeamClass(entry.roleId)"
              >
                {{ roleName(entry.roleId) }}
              </span>
            </div>
            <div v-else class="empty-inline">无记录</div>
          </section>

          <section>
            <h4>阶段变动</h4>
            <div
              class="phase-group"
              v-for="phase in phaseGroups"
              :key="phase.phaseIndex"
            >
              <h5>{{ phase.label }}</h5>
              <ul v-if="phase.events.length" class="event-list">
                <li
                  v-for="event in phase.events"
                  :key="event.id || event.order"
                  class="event-item"
                  :class="{ editable: canEditEvents }"
                >
                  <span class="event-order">{{ event.order }}</span>
                  <span class="event-text">
                    <template v-if="event.type === 'roleChanged'">
                      {{ seatText(event.seat) }}角色
                      <span
                        class="role-chip"
                        :class="roleTeamClass(event.fromRoleId)"
                      >
                        {{ roleName(event.fromRoleId) }}
                      </span>
                      <span class="role-arrow">-></span>
                      <span
                        class="role-chip"
                        :class="roleTeamClass(event.toRoleId)"
                      >
                        {{ roleName(event.toRoleId) }}
                      </span>
                    </template>
                    <template v-else>
                      {{ eventText(event) }}
                    </template>
                  </span>
                  <button
                    v-if="canEditEvents"
                    type="button"
                    class="event-delete"
                    title="删除这条记录"
                    aria-label="删除这条记录"
                    @click="removeEvent(event)"
                  >
                    <font-awesome-icon icon="trash-alt" />
                  </button>
                </li>
              </ul>
              <div v-else class="empty-inline">无事发生</div>
            </div>
          </section>
        </template>
      </div>
    </div>
  </Modal>
</template>

<script>
import Modal from "./Modal";
import { mapMutations, mapState } from "vuex";

const phaseNames = ["夜晚", "黎明", "白天", "黄昏"];

const phaseLabel = (phaseIndex) => {
  const index = Math.max(0, Number(phaseIndex) || 0);
  if (index === 0) return "首夜";
  const phase = index % phaseNames.length;
  const day = Math.floor(index / phaseNames.length) + 1;
  return `第${day}天${phaseNames[phase]}`;
};

const seatText = (seat) => `座位${Number(seat) || 0}`;

const seatFromHistoryText = (text) => {
  const match = String(text || "").match(/^(\d+)/);
  return match ? seatText(match[1]) : String(text || "");
};

const emptyReviewDetails = () => ({
  id: "",
  storytellingStartedAt: "",
  storytellingEndedAt: "",
  pushedAt: "",
  phaseIndexAtPush: 0,
  lastPhaseIndex: 0,
  roleCatalog: {},
  initialRoles: [],
  bluffs: [],
  events: [],
});

export default {
  components: {
    Modal,
  },
  data() {
    return {
      selectedReviewId: "",
    };
  },
  computed: {
    records() {
      const source = this.session.isSpectator
        ? this.session.receivedReviewDetailsRecords
        : this.session.grimoireHistoryRecords;
      return [...(source || [])].sort((a, b) =>
        this.recordSortValue(b).localeCompare(this.recordSortValue(a)),
      );
    },
    details() {
      return (
        this.records.find((record) => record.id === this.selectedReviewId) ||
        this.records[0] ||
        emptyReviewDetails()
      );
    },
    selectedRecordTitle() {
      const index = this.records.findIndex(
        (record) => record.id === this.details.id,
      );
      return this.recordTitle(this.details, index);
    },
    initialRoles() {
      return [...(this.details.initialRoles || [])].sort(
        (a, b) => Number(a.seat) - Number(b.seat),
      );
    },
    bluffs() {
      return (this.details.bluffs || []).filter((entry) => entry.roleId);
    },
    events() {
      return [...(this.details.events || [])].sort(
        (a, b) => Number(a.order) - Number(b.order),
      );
    },
    hasContent() {
      return (
        this.initialRoles.length > 0 ||
        this.bluffs.length > 0 ||
        this.events.length > 0
      );
    },
    canEditEvents() {
      return (
        !this.session.isSpectator &&
        this.session.isStorytelling &&
        !this.session.isReview &&
        this.details.id === this.session.activeGrimoireHistoryId
      );
    },
    maxPhaseIndex() {
      const eventMax = this.events.reduce(
        (max, event) => Math.max(max, Number(event.phaseIndex) || 0),
        0,
      );
      const pushedMax = Number(this.details.phaseIndexAtPush) || 0;
      const recordedMax = Number(this.details.lastPhaseIndex) || 0;
      const storytellerMax =
        !this.session.isSpectator &&
        this.details.id === this.session.activeGrimoireHistoryId
          ? Number(this.grimoire.phaseIndex) || 0
          : 0;
      return Math.max(eventMax, pushedMax, recordedMax, storytellerMax);
    },
    phaseGroups() {
      const groups = [];
      for (let phaseIndex = 0; phaseIndex <= this.maxPhaseIndex; phaseIndex++) {
        groups.push({
          phaseIndex,
          label: phaseLabel(phaseIndex),
          events: this.events.filter(
            (event) => Number(event.phaseIndex) === phaseIndex,
          ),
        });
      }
      return groups;
    },
    ...mapState(["grimoire", "session", "modals"]),
  },
  watch: {
    records() {
      this.ensureSelectedRecord();
    },
    selectedReviewId() {
      if (this.modals.reviewDetails) {
        this.markSelectedRecordRead();
      }
    },
  },
  methods: {
    seatText,
    recordSortValue(record = {}) {
      return String(
        record.pushedAt ||
          record.storytellingEndedAt ||
          record.updatedAt ||
          record.storytellingStartedAt ||
          record.createdAt ||
          "",
      );
    },
    recordTitle(record = {}, index = -1) {
      const number = index >= 0 ? this.records.length - index : "";
      return number ? `第${number}局复盘` : "复盘详情";
    },
    formatDateTime(value) {
      if (!value) return "未记录";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    recordEndText(record = {}) {
      return record.storytellingEndedAt
        ? this.formatDateTime(record.storytellingEndedAt)
        : "说书中";
    },
    isUnreadRecord(record = {}) {
      return (this.session.unreadReviewDetailsIds || []).includes(record.id);
    },
    ensureSelectedRecord() {
      if (!this.records.length) {
        this.selectedReviewId = "";
        return;
      }
      if (this.records.some((record) => record.id === this.selectedReviewId)) {
        return;
      }
      const unreadRecord = this.records.find((record) =>
        this.isUnreadRecord(record),
      );
      this.selectedReviewId = (unreadRecord || this.records[0]).id;
    },
    selectRecord(record = {}) {
      this.selectedReviewId = record.id || "";
      this.markSelectedRecordRead();
    },
    markSelectedRecordRead() {
      if (!this.session.isSpectator || !this.selectedReviewId) return;
      this.$store.commit(
        "session/markReviewDetailsRead",
        this.selectedReviewId,
      );
    },
    canDeleteRecord(record = {}) {
      if (!record.id) return false;
      if (this.session.isSpectator) return true;
      return !(
        this.session.isStorytelling &&
        record.id === this.session.activeGrimoireHistoryId
      );
    },
    deleteRecord(record = {}) {
      if (!this.canDeleteRecord(record)) return;
      const mutation = this.session.isSpectator
        ? "session/deleteReceivedReviewDetailsRecord"
        : "session/deleteGrimoireHistoryRecord";
      this.$store.commit(mutation, record.id);
      this.$nextTick(this.ensureSelectedRecord);
    },
    roleInfo(roleId) {
      if (!roleId) return null;
      const catalogRole =
        this.details.roleCatalog && this.details.roleCatalog[roleId];
      if (catalogRole) return catalogRole;
      return (
        this.$store.state.roles.get(roleId) ||
        this.$store.getters.rolesJSONbyId.get(roleId) ||
        null
      );
    },
    roleName(roleId) {
      if (!roleId) return "空";
      const role = this.roleInfo(roleId);
      return (role && role.name) || roleId;
    },
    roleTeamClass(roleId) {
      const role = this.roleInfo(roleId);
      return role && role.team ? `role-team-${role.team}` : "role-team-empty";
    },
    reminderName(reminder = {}) {
      return reminder.name || this.roleName(reminder.role);
    },
    eventText(event = {}) {
      switch (event.type) {
        case "seatAdded":
          return `添加${seatText(event.seat)}`;
        case "seatRemoved":
          return `移除${seatText(event.seat)}`;
        case "roleChanged":
          return `${seatText(event.seat)}角色 ${this.roleName(
            event.fromRoleId,
          )} -> ${this.roleName(event.toRoleId)}`;
        case "reminderAdded":
          return `${seatText(event.seat)}添加标记 ${this.reminderName(
            event.reminder,
          )}`;
        case "reminderRemoved":
          return `${seatText(event.seat)}移除标记 ${this.reminderName(
            event.reminder,
          )}`;
        case "deathChanged":
          return `${seatText(event.seat)}${event.isDead ? "死亡" : "复活"}`;
        case "nomination": {
          const vote = event.vote || {};
          const nominator = seatFromHistoryText(vote.nominator);
          const nominee = seatFromHistoryText(vote.nominee);
          return `${nominator}向${nominee}发起提名，票数 ${vote.votes || 0}/${
            vote.majority || 0
          }`;
        }
        default:
          return "未知变动";
      }
    },
    removeEvent(event) {
      this.$store.commit("session/removeGrimoireHistoryEvent", {
        id: event.id,
        order: event.order,
      });
    },
    ...mapMutations(["toggleModal"]),
  },
  mounted() {
    this.ensureSelectedRecord();
    this.markSelectedRecordRead();
  },
};
</script>

<style lang="scss" scoped>
@import "../../vars.scss";

.review-details::v-deep .modal {
  width: clamp(720px, 82vw, 1180px);
  max-width: calc(100vw - 32px);
}

.review-details::v-deep .slot {
  width: 100%;
}

h3 {
  margin: 0 40px 12px;
}

.review-record-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.review-records {
  min-width: 0;
}

.review-records ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.review-records li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  align-items: stretch;
  margin: 0;
  padding: 0;
}

.record-select {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 72px;
  padding: 9px 10px;
  color: rgba(255, 255, 255, 0.74);
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  text-align: left;
  cursor: pointer;
}

.review-records li.active .record-select {
  color: white;
  border-color: rgba(255, 255, 255, 0.46);
  background: rgba(255, 255, 255, 0.1);
}

.review-records li.unread .record-title::after {
  content: "未读";
  display: inline-flex;
  margin-left: 6px;
  padding: 1px 5px;
  color: #f8e7ac;
  border: 1px solid rgba(248, 231, 172, 0.7);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.2;
}

.record-title {
  font-weight: bold;
  line-height: 1.3;
}

.record-time {
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  line-height: 1.3;
}

.review-record-detail {
  min-width: 0;
}

.record-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
}

.record-header h4 {
  margin: 0 0 4px;
}

.record-header p {
  margin: 0;
  color: rgba(255, 255, 255, 0.58);
  line-height: 1.35;
}

section {
  margin: 14px 0;
}

h4,
h5 {
  margin: 8px 0;
}

.empty,
.empty-inline {
  color: rgba(255, 255, 255, 0.58);
}

.empty-inline {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 8px 0;
  text-align: center;
}

.initial-roles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.initial-roles li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.24);
  line-height: 1.3;
  text-align: left;
}

.initial-role-seat {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.66);
  white-space: nowrap;
}

.initial-role-name {
  flex: 0 0 auto;
  text-align: right;
}

.bluffs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 2px 7px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.24);
  font-weight: bold;
  line-height: 1.3;
  white-space: nowrap;
  text-shadow:
    0 1px 1px black,
    0 -1px 1px black,
    1px 0 1px black,
    -1px 0 1px black;
}

.role-team-townsfolk {
  color: $townsfolk;
}

.role-team-outsider {
  color: $outsider;
}

.role-team-minion {
  color: $minion;
}

.role-team-demon {
  color: $demon;
}

.role-team-traveler {
  color: $traveler;
}

.role-team-fabled {
  color: $fabled;
}

.role-team-empty {
  color: rgba(255, 255, 255, 0.58);
}

.role-arrow {
  color: rgba(255, 255, 255, 0.55);
  margin: 0 2px;
}

.phase-group {
  margin: 10px 0 14px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
}

.event-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin: 0;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  line-height: 1.45;
  text-align: left;
}

.event-item.editable {
  grid-template-columns: 34px minmax(0, 1fr) 34px;
}

.event-item:last-child {
  border-bottom: 0;
}

.event-order {
  color: rgba(255, 255, 255, 0.45);
  text-align: right;
}

.event-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.event-delete,
.record-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin: 0;
  padding: 0;
  color: rgba(255, 255, 255, 0.56);
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  cursor: pointer;
}

.detail-delete {
  flex: 0 0 auto;
}

.event-delete:hover,
.event-delete:focus,
.record-delete:hover,
.record-delete:focus {
  color: #ffb8b8;
  border-color: rgba(255, 120, 120, 0.5);
  background: rgba(120, 0, 0, 0.28);
}

@media (max-width: 760px) {
  .review-record-layout {
    grid-template-columns: 1fr;
  }

  .review-records ul {
    max-height: 220px;
    overflow: auto;
  }
}

ul {
  margin: 0;
  padding-left: 22px;
}

li {
  margin: 4px 0;
}
</style>
