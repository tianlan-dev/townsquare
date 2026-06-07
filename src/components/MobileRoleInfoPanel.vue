<template>
  <transition name="mobile-role-info">
    <div v-if="isVisible" class="mobile-role-info-backdrop">
      <section
        ref="panel"
        class="mobile-role-info-panel"
        :class="placementClass"
        role="dialog"
        aria-live="polite"
      >
        <button
          type="button"
          class="close-button"
          aria-label="关闭角色说明"
          @click="hideMobileRoleInfo"
        >
          <font-awesome-icon icon="times" />
        </button>
        <div class="role-heading">
          <strong class="role-name">{{ role.name || role.id }}</strong>
          <span v-if="teamLabel" class="role-team">{{ teamLabel }}</span>
        </div>
        <div class="role-sections">
          <section
            v-for="section in tooltipSections"
            :key="section.label || section.text"
            class="role-section"
          >
            <h4 v-if="section.label">{{ section.label }}</h4>
            <p>{{ section.text }}</p>
          </section>
        </div>
      </section>
    </div>
  </transition>
</template>

<script>
import { mapMutations, mapState } from "vuex";

const fallbackTeamLabels = {
  fabled: "传奇角色",
  loric: "传奇角色",
  traveler: "旅行者",
  firstNight: "首夜提示",
  otherNight: "其他夜提示",
};
const ROOT_OPEN_CLASS = "mobile-role-info-open";

export default {
  name: "MobileRoleInfoPanel",
  data() {
    return {
      openedAt: 0,
    };
  },
  computed: {
    role() {
      return this.mobileRoleInfo.role || {};
    },
    teamLabel() {
      return (
        this.teamsNames[this.role.team] ||
        fallbackTeamLabels[this.role.team] ||
        ""
      );
    },
    isVisible() {
      return Boolean(this.role.ability && !this.modals.input);
    },
    placementClass() {
      return this.mobileRoleInfo.placement === "top" ? "is-top" : "is-bottom";
    },
    tooltipSections() {
      if (this.role.tooltipSections && this.role.tooltipSections.length) {
        return this.role.tooltipSections;
      }
      return [{ label: "", text: this.role.ability }];
    },
    ...mapState(["mobileRoleInfo", "modals", "teamsNames"]),
  },
  mounted() {
    document.addEventListener("touchstart", this.handleOutsidePointer, true);
    document.addEventListener("mousedown", this.handleOutsidePointer, true);
  },
  beforeDestroy() {
    document.removeEventListener("touchstart", this.handleOutsidePointer, true);
    document.removeEventListener("mousedown", this.handleOutsidePointer, true);
    this.setRootOpenClass(false);
  },
  methods: {
    setRootOpenClass(isOpen) {
      document.documentElement.classList.toggle(ROOT_OPEN_CLASS, isOpen);
    },
    handleOutsidePointer(event) {
      if (!this.isVisible) return;
      if (Date.now() - this.openedAt < 500) return;
      if (this.$refs.panel && this.$refs.panel.contains(event.target)) return;
      this.hideMobileRoleInfo();
    },
    ...mapMutations(["hideMobileRoleInfo"]),
  },
  watch: {
    isVisible(isVisible) {
      if (isVisible) {
        this.openedAt = Date.now();
      }
      this.setRootOpenClass(isVisible);
    },
  },
};
</script>

<style scoped lang="scss">
.mobile-role-info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: transparent;
  pointer-events: none;
}

.mobile-role-info-panel {
  position: fixed;
  left: 12px;
  right: 12px;
  max-height: 40vh;
  overflow-y: auto;
  padding: 12px 44px 12px 14px;
  color: #fff;
  text-align: left;
  line-height: 1.35;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  pointer-events: auto;
}

.mobile-role-info-panel.is-bottom {
  bottom: calc(12px + env(safe-area-inset-bottom));
}

.mobile-role-info-panel.is-top {
  top: calc(12px + env(safe-area-inset-top));
}

.close-button {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 28px;
  height: 28px;
  padding: 0;
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
}

.role-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.role-name {
  font-size: 1rem;
}

.role-team {
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.82rem;
}

.role-sections {
  display: grid;
  gap: 8px;
}

.role-section h4 {
  margin: 0 0 3px;
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 0.78rem;
  line-height: 1.2;
  text-align: left;
}

.role-section p {
  margin: 0;
  font-size: 0.92rem;
}

.mobile-role-info-enter-active,
.mobile-role-info-leave-active {
  transition: opacity 160ms ease;
}

.mobile-role-info-enter,
.mobile-role-info-leave-to {
  opacity: 0;
}
</style>
