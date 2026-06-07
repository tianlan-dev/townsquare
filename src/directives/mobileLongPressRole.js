import store from "../store";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;
const CLICK_SUPPRESSION_MS = 700;
const TOUCH_QUERY = "(hover: none), (pointer: coarse)";
const DESKTOP_QUERY = "(hover: hover) and (pointer: fine)";
const SUPPRESS_ABILITY_TOOLTIP_CLASS = "suppress-token-ability-tooltip";
const TRIGGER_CLASS = "mobile-role-info-trigger";

const isTouchPreviewMode = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia(TOUCH_QUERY).matches;

const isDesktopPreviewMode = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia(DESKTOP_QUERY).matches;

const canPreviewRole = (role) => role && role.ability;

const canTouchPreview = (role) => isTouchPreviewMode() && canPreviewRole(role);

const canDesktopPreview = (state) =>
  state.allowDesktopHover &&
  isDesktopPreviewMode() &&
  canPreviewRole(state.role);

const clearTimer = (state) => {
  if (state.timer) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
};

const setAbilityTooltipSuppressed = (isSuppressed) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(
    SUPPRESS_ABILITY_TOOLTIP_CLASS,
    isSuppressed,
  );
};

const getPlacement = (el) => {
  if (typeof window === "undefined") return "bottom";
  const rect = el.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  return centerY < window.innerHeight / 2 ? "bottom" : "top";
};

const showRoleInfo = (el, role) => {
  store.commit("showMobileRoleInfo", {
    role,
    placement: getPlacement(el),
  });
};

const cancel = (state) => {
  clearTimer(state);
  state.longPressed = false;
  setAbilityTooltipSuppressed(false);
};

const disableNativeLongPress = (el, state) => {
  state.previousStyles = {
    webkitTouchCallout: el.style.webkitTouchCallout,
    webkitUserSelect: el.style.webkitUserSelect,
    userSelect: el.style.userSelect,
    touchAction: el.style.touchAction,
  };
  el.style.webkitTouchCallout = "none";
  el.style.webkitUserSelect = "none";
  el.style.userSelect = "none";
  el.style.touchAction = "manipulation";
};

const restoreNativeLongPress = (el, state) => {
  if (!state.previousStyles) return;
  el.style.webkitTouchCallout = state.previousStyles.webkitTouchCallout;
  el.style.webkitUserSelect = state.previousStyles.webkitUserSelect;
  el.style.userSelect = state.previousStyles.userSelect;
  el.style.touchAction = state.previousStyles.touchAction;
};

const installListeners = (el, state) => {
  el.classList.add(TRIGGER_CLASS);
  disableNativeLongPress(el, state);

  state.onTouchStart = (event) => {
    if (!canTouchPreview(state.role) || event.touches.length !== 1) return;

    const touch = event.touches[0];
    state.startX = touch.clientX;
    state.startY = touch.clientY;
    state.longPressed = false;
    setAbilityTooltipSuppressed(true);
    clearTimer(state);

    state.timer = window.setTimeout(() => {
      state.longPressed = true;
      state.suppressClick = true;
      showRoleInfo(el, state.role);
    }, LONG_PRESS_MS);
  };

  state.onTouchMove = (event) => {
    if (!state.timer || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const distanceX = Math.abs(touch.clientX - state.startX);
    const distanceY = Math.abs(touch.clientY - state.startY);
    if (distanceX > MOVE_TOLERANCE || distanceY > MOVE_TOLERANCE) {
      cancel(state);
    }
  };

  state.onTouchEnd = (event) => {
    clearTimer(state);

    if (state.longPressed) {
      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => {
        state.suppressClick = false;
        setAbilityTooltipSuppressed(false);
      }, CLICK_SUPPRESSION_MS);
    } else {
      setAbilityTooltipSuppressed(false);
    }

    state.longPressed = false;
  };

  state.onTouchCancel = () => {
    cancel(state);
  };

  state.onClick = (event) => {
    if (!state.suppressClick) return;
    state.suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  state.onContextMenu = (event) => {
    if (!canTouchPreview(state.role)) return;
    event.preventDefault();
  };

  state.onMouseEnter = () => {
    if (!canDesktopPreview(state)) return;
    showRoleInfo(el, state.role);
  };

  state.onMouseLeave = () => {
    if (!canDesktopPreview(state)) return;
    store.commit("hideMobileRoleInfo");
  };

  el.addEventListener("touchstart", state.onTouchStart, { passive: true });
  el.addEventListener("touchmove", state.onTouchMove, { passive: true });
  el.addEventListener("touchend", state.onTouchEnd);
  el.addEventListener("touchcancel", state.onTouchCancel, { passive: true });
  el.addEventListener("click", state.onClick, true);
  el.addEventListener("contextmenu", state.onContextMenu);
  el.addEventListener("mouseenter", state.onMouseEnter);
  el.addEventListener("mouseleave", state.onMouseLeave);
};

const uninstallListeners = (el, state) => {
  clearTimer(state);
  el.classList.remove(TRIGGER_CLASS);
  restoreNativeLongPress(el, state);
  el.removeEventListener("touchstart", state.onTouchStart);
  el.removeEventListener("touchmove", state.onTouchMove);
  el.removeEventListener("touchend", state.onTouchEnd);
  el.removeEventListener("touchcancel", state.onTouchCancel);
  el.removeEventListener("click", state.onClick, true);
  el.removeEventListener("contextmenu", state.onContextMenu);
  el.removeEventListener("mouseenter", state.onMouseEnter);
  el.removeEventListener("mouseleave", state.onMouseLeave);
};

export default {
  bind(el, binding) {
    const state = {
      role: binding.value,
      timer: null,
      startX: 0,
      startY: 0,
      longPressed: false,
      suppressClick: false,
      allowDesktopHover: !binding.modifiers.mobileOnly,
    };

    el.__mobileLongPressRole = state;
    installListeners(el, state);
  },
  update(el, binding) {
    if (el.__mobileLongPressRole) {
      el.__mobileLongPressRole.role = binding.value;
      el.__mobileLongPressRole.allowDesktopHover =
        !binding.modifiers.mobileOnly;
    }
  },
  unbind(el) {
    if (!el.__mobileLongPressRole) return;
    uninstallListeners(el, el.__mobileLongPressRole);
    delete el.__mobileLongPressRole;
  },
};
