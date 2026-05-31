export const DEFAULT_PLAYER_AVATARS = {
  male: "default-townsperson-male.webp",
  female: "default-townsperson-female.webp",
};

const legacyDefaultPlayerAvatars = [
  "default.webp",
  "default-townsperson.png",
  "default-townsperson.webp",
  DEFAULT_PLAYER_AVATARS.male,
  DEFAULT_PLAYER_AVATARS.female,
];

export const normalizePlayerGender = (gender) =>
  gender === "male" || gender === "female" ? gender : "";

export const playerGenderOrDefault = (gender) =>
  normalizePlayerGender(gender) || "female";

export const avatarFilename = (avatar) =>
  String(avatar || "")
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .pop();

export const isDefaultPlayerAvatar = (avatar) =>
  legacyDefaultPlayerAvatars.includes(avatarFilename(avatar));
