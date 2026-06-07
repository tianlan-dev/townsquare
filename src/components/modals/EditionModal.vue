<template>
  <Modal class="editions" v-if="modals.edition" @close="closeEdition()">
    <div v-if="!isCustom">
      <h3>选择剧本</h3>
      <div class="edition-tabs">
        <button
          v-for="tab in editionTabs"
          :key="tab.id"
          type="button"
          :class="{ active: activeEditionTab === tab.id }"
          @click="activeEditionTab = tab.id"
        >
          {{ tab.name }}
        </button>
      </div>
      <ul class="editions">
        <li
          v-for="edition in visibleEditions"
          class="edition"
          :class="['edition-' + edition.id]"
          :style="editionBackground(edition)"
          :key="edition.id"
          @click="setHomeEdition(edition)"
        >
          {{ edition.name }}
        </li>
        <li
          v-for="script in visibleScripts"
          class="edition edition-script"
          :key="script.url"
          :style="scriptBackground(script)"
          @click="handleURL(script.url)"
        >
          {{ script.name }}
        </li>
        <li
          v-if="activeEditionTab === 'custom'"
          class="edition edition-custom"
          @click="isCustom = true"
          :style="{
            backgroundImage: `url(${require('../../assets/editions/custom.png')})`,
          }"
        >
          自定义剧本/角色
        </li>
      </ul>
    </div>
    <div class="custom" v-else>
      <h3>加载自定义剧本/角色</h3>
      若想玩自定义剧本，请提供JSON路径/互联网URL。
      <br />
      <b>请勿上传未知来源的自定义JSON文件！</b>
      <input
        type="file"
        ref="upload"
        accept="application/json"
        @change="handleUpload"
      />
      <div class="button-group">
        <div class="button" @click="openUpload">
          <font-awesome-icon icon="file-upload" /> 上传JSON
        </div>
        <div class="button" @click="promptURL">
          <font-awesome-icon icon="link" /> 输入URL
        </div>
        <div class="button" @click="readFromClipboard">
          <font-awesome-icon icon="clipboard" /> 使用剪贴板中的JSON
        </div>
        <div class="button" @click="isCustom = false">
          <font-awesome-icon icon="undo" /> 返回
        </div>
      </div>
    </div>
  </Modal>
</template>

<script>
import editionJSON from "../../editions";
import { mapMutations, mapState } from "vuex";
import { normalizePhaseBackgrounds } from "../../phaseBackgrounds";
import Modal from "./Modal";

export default {
  components: {
    Modal,
  },
  data: function () {
    return {
      editions: editionJSON,
      activeEditionTab: "official",
      editionTabs: [
        {
          id: "official",
          name: "官方剧本",
        },
        {
          id: "packs",
          name: "角色包",
        },
        {
          id: "custom",
          name: "自定义剧本",
        },
      ],
      isCustom: false,
      scripts: [],
    };
  },
  computed: {
    visibleEditions() {
      if (this.activeEditionTab === "official") {
        return this.editions.filter((edition) => !edition.isRolePak);
      }
      if (this.activeEditionTab === "packs") {
        return this.editions.filter((edition) => edition.isRolePak);
      }
      return [];
    },
    visibleScripts() {
      return this.activeEditionTab === "custom" ? this.scripts : [];
    },
    ...mapState(["modals", "selectedEditions"]),
  },
  mounted() {
    this.loadScripts();
  },
  methods: {
    async loadScripts() {
      try {
        const res = await fetch("/scripts");
        if (!res.ok) return;
        this.scripts = await res.json();
      } catch (e) {
        this.scripts = [];
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
    closeEdition() {
      this.toggleModal("edition");
      this.isCustom = false;
    },
    openUpload() {
      this.$refs.upload.click();
    },
    async handleUpload() {
      const file = this.$refs.upload.files[0];
      if (file && file.size) {
        const reader = new FileReader();
        reader.addEventListener("load", async () => {
          try {
            const roles = JSON.parse(reader.result);
            this.parseRoles(roles, "", "external");
            this.parseStates(roles);
          } catch (e) {
            await this.showInputModal({
              inputType: "alert",
              inputModal: "text",
              inputData: {
                name: ["读取剧本错误：自定义剧本内容不是有效的JSON文件！"],
              },
            }).catch(() => {
              return null;
            });
            return;
          }
          this.$refs.upload.value = "";
        });
        reader.readAsText(file);
      }
    },
    async promptURL() {
      const input = await this.showInputModal({
        inputType: "json",
        inputModal: "input",
        inputData: {
          name: ["输入custom-script.json路径或互联网URL"],
          length: 1,
          placeholder: [""],
        },
      }).catch(() => {
        return null;
      });
      if (input === null) return;

      const url = input[0];
      if (url) {
        this.handleURL(url);
      }
    },
    async handleURL(url) {
      const scriptUrl = this.normalizeScriptUrl(url);
      if (!scriptUrl) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: [
              "只允许加载HTTP(S) URL或当前本机服务器上的JSON路径。请使用上传、剪贴板、/scripts/xxx.json或https://...。",
            ],
          },
        }).catch(() => {
          return null;
        });
        return;
      }
      let res;
      try {
        res = await fetch(scriptUrl);
      } catch (e) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: [
              "读取剧本错误：无法加载该URL。请确认链接可访问且允许跨域读取。",
            ],
          },
        }).catch(() => {
          return null;
        });
        return;
      }
      if (res && res.json) {
        try {
          const script = await res.json();
          this.parseRoles(
            script,
            scriptUrl,
            this.isServerScriptUrl(scriptUrl) ? "server" : "external",
          );
          this.parseStates(script);
        } catch (e) {
          await this.showInputModal({
            inputType: "alert",
            inputModal: "text",
            inputData: {
              name: ["读取剧本错误：URL内容不是有效的JSON文件！"],
            },
          }).catch(() => {
            return null;
          });
          return;
        }
      }
    },
    async readFromClipboard() {
      const text = await navigator.clipboard.readText();
      try {
        const roles = JSON.parse(text);
        this.parseRoles(roles, "", "external");
        this.parseStates(roles);
      } catch (e) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["读取剧本错误：剪贴板内容不是有效的JSON文件！"],
          },
        }).catch(() => {
          return null;
        });
        return;
      }
    },
    parseRoles(roles, sourceUrl = "", imageSource = "external") {
      if (!roles || !roles.length) return;
      roles = roles.map((role) =>
        typeof role === "string" ? { id: role } : role,
      );
      const metaIndex = roles.findIndex(({ id }) => id === "_meta");
      let meta = {};
      if (metaIndex > -1) {
        meta = roles.splice(metaIndex, 1).pop();
      }
      if (meta.bootlegger) {
        for (let i = 0; i < meta.bootlegger.length; i++) {
          roles.push({
            id: `bootlegger${i}`,
            reminders: [],
            setup: false,
            name: `私货商人${i + 1}`,
            team: "fabled",
            ability: meta.bootlegger[i],
          });
        }
      }
      roles = this.sanitizeImageUrls(roles, sourceUrl);
      meta = this.sanitizeImageUrls([meta], sourceUrl)[0];
      meta = this.sanitizePlayerAvatars(meta, sourceUrl);
      meta = this.sanitizePhaseBackgrounds(meta, sourceUrl);
      if (imageSource === "external") {
        this.$store.commit("setImageOptIn", false);
      }
      this.$store.commit("setCustomRoles", roles);
      this.$store.commit(
        "setEdition",
        Object.assign({}, meta, { id: "custom", imageSource }),
      );
      // check for fabled and set those too, if present
      if (roles.some((role) => this.$store.state.fabled.has(role.id || role))) {
        const fabled = [];
        roles.forEach((role) => {
          if (
            this.$store.state.fabled.has(role.id || role) &&
            (!meta.bootlegger || role.id !== "bootlegger")
          ) {
            fabled.push(this.$store.state.fabled.get(role.id || role));
          }
        });
        this.$store.commit("players/setFabled", { fabled });
      }
      this.isCustom = false;
    },
    normalizeScriptUrl(url) {
      try {
        const parsed = new URL(url, window.location.origin);
        if (!["http:", "https:"].includes(parsed.protocol)) return "";
        if (parsed.origin === window.location.origin) {
          return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        return parsed.href;
      } catch (e) {
        return "";
      }
    },
    isServerScriptUrl(url) {
      try {
        const parsed = new URL(url, window.location.origin);
        return (
          parsed.origin === window.location.origin &&
          parsed.pathname.startsWith("/scripts/")
        );
      } catch (e) {
        return false;
      }
    },
    resolveImageUrl(image, sourceUrl = "") {
      if (!image || typeof image !== "string") return "";
      if (image.startsWith("data:") || image.startsWith("blob:")) return image;
      try {
        const baseUrl = sourceUrl
          ? new URL(sourceUrl, window.location.origin).href
          : window.location.origin;
        return new URL(image, baseUrl).href;
      } catch (e) {
        return "";
      }
    },
    sanitizeImageUrls(items, sourceUrl = "") {
      return items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const image = item.image || item.logo;
        if (!image || typeof image !== "string") return item;
        if (image.startsWith("data:") || image.startsWith("blob:")) return item;
        const parsed = this.resolveImageUrl(image, sourceUrl);
        if (!parsed) return item;
        const protocol = new URL(parsed).protocol;
        if (["http:", "https:"].includes(protocol)) {
          const cleanItem = Object.assign({}, item);
          if (item.image) cleanItem.image = parsed;
          if (item.logo) cleanItem.logo = parsed;
          return cleanItem;
        }
        const cleanItem = Object.assign({}, item);
        delete cleanItem.image;
        delete cleanItem.logo;
        return cleanItem;
      });
    },
    sanitizePlayerAvatars(meta, sourceUrl = "") {
      if (
        !meta ||
        typeof meta !== "object" ||
        !meta.playerAvatars ||
        typeof meta.playerAvatars !== "object"
      ) {
        return meta;
      }
      const playerAvatars = {};
      ["male", "female"].forEach((gender) => {
        const image = meta.playerAvatars[gender];
        if (!image || typeof image !== "string") return;
        if (image.startsWith("data:") || image.startsWith("blob:")) {
          playerAvatars[gender] = image;
          return;
        }
        const parsed = this.resolveImageUrl(image, sourceUrl);
        if (!parsed) return;
        const protocol = new URL(parsed).protocol;
        if (["http:", "https:"].includes(protocol)) {
          playerAvatars[gender] = parsed;
        }
      });
      const cleanMeta = Object.assign({}, meta);
      if (Object.keys(playerAvatars).length) {
        cleanMeta.playerAvatars = playerAvatars;
      } else {
        delete cleanMeta.playerAvatars;
      }
      return cleanMeta;
    },
    sanitizePhaseBackgrounds(meta, sourceUrl = "") {
      if (
        !meta ||
        typeof meta !== "object" ||
        !meta.phaseBackgrounds ||
        typeof meta.phaseBackgrounds !== "object"
      ) {
        return meta;
      }
      const phaseBackgrounds = {};
      Object.entries(normalizePhaseBackgrounds(meta.phaseBackgrounds)).forEach(
        ([phase, image]) => {
          if (image.startsWith("data:") || image.startsWith("blob:")) {
            phaseBackgrounds[phase] = image;
            return;
          }
          const parsed = this.resolveImageUrl(image, sourceUrl);
          if (!parsed) return;
          const protocol = new URL(parsed).protocol;
          if (["http:", "https:"].includes(protocol)) {
            phaseBackgrounds[phase] = parsed;
          }
        },
      );
      const cleanMeta = Object.assign({}, meta);
      if (Object.keys(phaseBackgrounds).length) {
        cleanMeta.phaseBackgrounds = phaseBackgrounds;
      } else {
        delete cleanMeta.phaseBackgrounds;
      }
      return cleanMeta;
    },
    parseStates(roles) {
      if (!roles || !roles.length) return;
      roles = roles.map((role) =>
        typeof role === "string" ? { id: role } : role,
      );
      const metaIndex = roles.findIndex(({ id }) => id === "_meta");
      let meta = {};
      if (metaIndex > -1) {
        meta = roles.splice(metaIndex, 1).pop();
      }
      //状态
      const states = [];
      if (meta.state) {
        meta.state.forEach((state) => {
          states.push({ [state.stateName]: state.stateDescription });
        });
      } else if (meta.status) {
        meta.status.forEach((state) => {
          states.push({ [state.name]: state.skill });
        });
      }
      this.$store.commit("setStates", states);
      // 角色类型名字
      const names = {
        townsfolk: meta.townsfolksName ? meta.townsfolksName : "镇民",
        outsider: meta.outsidersName ? meta.outsidersName : "外来者",
        minion: meta.minionsName ? meta.minionsName : "爪牙",
        demon: meta.demonsName ? meta.demonsName : "恶魔",
      };
      this.$store.commit("setTeamsNames", names);
      // 夜间顺序
      if (!!meta.firstNight && meta.firstNight.length > 0) {
        const firstNight = meta.firstNight.map((role) =>
          role.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""),
        );
        this.$store.commit("setFirstNight", firstNight);
      } else {
        this.$store.commit("setFirstNight", []);
      }
      if (!!meta.otherNight && meta.otherNight.length > 0) {
        const otherNight = meta.otherNight.map((role) =>
          role.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""),
        );
        this.$store.commit("setOtherNight", otherNight);
      } else {
        this.$store.commit("setOtherNight", []);
      }
    },
    setHomeEdition(edition) {
      if (["tb", "bmr", "snv", "luf", "all"].includes(edition.id))
        this.$store.commit("setStates", []);
      this.setEdition(edition, this.selectedEditions);
    },
    editionBackground(edition) {
      return {
        backgroundImage: `url(${require(
          "../../assets/editions/" + edition.id + ".png",
        )})`,
      };
    },
    scriptBackground(script) {
      return {
        backgroundImage: script.logo
          ? `url("${script.logo}")`
          : `url(${require("../../assets/editions/custom.png")})`,
      };
    },
    ...mapMutations(["toggleModal", "setEdition"]),
  },
};
</script>

<style scoped lang="scss">
.edition-tabs {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 0 0 12px;

  button {
    border: 2px solid #8a7864;
    background: #111;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 6px 14px;
    min-width: 96px;

    &.active,
    &:hover {
      color: red;
      border-color: red;
    }
  }
}

ul.editions .edition {
  font-family: PiratesBay, sans-serif;
  letter-spacing: 1px;
  text-align: center;
  padding-top: 15%;
  background-position: center center;
  background-size: 82% auto;
  background-repeat: no-repeat;
  height: 200px;
  width: 250px;
  margin: 5px;
  font-size: 120%;
  text-shadow:
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000,
    0 0 5px rgba(0, 0, 0, 0.75);
  cursor: pointer;
  &:hover {
    color: red;
  }
}

.custom {
  text-align: center;
  input[type="file"] {
    display: none;
  }
}
</style>
