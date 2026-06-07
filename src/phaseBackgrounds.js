export const PHASE_BACKGROUND_KEYS = ["night", "dawn", "day", "dusk"];

export const DEFAULT_PHASE_BACKGROUNDS = {
  night: "/backgrounds/night.png",
  dawn: "/backgrounds/dawn.png",
  day: "/backgrounds/day.png",
  dusk: "/backgrounds/dusk.png",
};

export const phaseBackgroundsToArray = (backgrounds = {}) =>
  PHASE_BACKGROUND_KEYS.map((key) => backgrounds[key]);

export const normalizePhaseBackgrounds = (backgrounds = {}) => {
  if (!backgrounds || typeof backgrounds !== "object") return {};
  return PHASE_BACKGROUND_KEYS.reduce((normalized, key, index) => {
    const value = Array.isArray(backgrounds)
      ? backgrounds[index]
      : backgrounds[key];
    if (typeof value === "string" && value) {
      normalized[key] = value;
    }
    return normalized;
  }, {});
};
