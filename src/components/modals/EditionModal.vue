<template>
  <Modal class="editions" v-if="modals.edition" @close="closeEdition()">
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
    <ul
      v-if="activeEditionTab === 'official'"
      class="editions official-editions"
    >
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
    </ul>
    <div v-else-if="activeEditionTab === 'custom'" class="script-browser">
      <input
        class="script-search"
        type="search"
        :value="scriptSearch"
        placeholder="搜索剧本名称或拼音"
        aria-label="搜索自定义剧本"
        @input="updateScriptSearch($event.target.value)"
        @keyup.stop=""
      />
      <div class="script-alphabet" aria-label="按剧本名称首字母跳转">
        <button
          v-for="letter in scriptAlphabet"
          :key="letter"
          type="button"
          :class="{ active: activeScriptInitial === letter }"
          :disabled="!availableScriptInitials.has(letter)"
          @click="jumpToScriptInitial(letter)"
        >
          {{ letter }}
        </button>
      </div>
      <p v-if="filteredScripts.length" class="script-count">
        共 {{ filteredScripts.length }} 个剧本
      </p>
      <div v-if="filteredScripts.length" class="script-pagination">
        <button
          type="button"
          :disabled="scriptPage === 1"
          @click="setScriptPage(scriptPage - 1)"
        >
          上一页
        </button>
        <template v-for="page in scriptPageItems">
          <button
            v-if="typeof page === 'number'"
            :key="page"
            type="button"
            :class="{ active: scriptPage === page }"
            @click="setScriptPage(page)"
          >
            {{ page }}
          </button>
          <span v-else :key="page">…</span>
        </template>
        <button
          type="button"
          :disabled="scriptPage === totalScriptPages"
          @click="setScriptPage(scriptPage + 1)"
        >
          下一页
        </button>
      </div>
      <ul class="editions">
        <li
          v-for="script in visibleScripts"
          class="edition edition-script"
          :key="script.url"
          :ref="'script-' + script.url"
          :style="scriptBackground(script)"
          @click="handleURL(script.url)"
        >
          {{ script.name }}
        </li>
      </ul>
      <p v-if="!filteredScripts.length" class="script-empty">
        没有找到匹配的剧本。
      </p>
    </div>
    <div v-else class="custom">
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
      </div>
    </div>
  </Modal>
</template>

<script>
import editionJSON from "../../editions";
import { mapMutations, mapState } from "vuex";
import { normalizePhaseBackgrounds } from "../../phaseBackgrounds";
import Modal from "./Modal";

const SCRIPT_PAGE_SIZE = 10;
const SCRIPT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function normalizeScriptText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getScriptNameData(script) {
  const normalizedName = normalizeScriptText(script.name);
  const urlName = decodeURIComponent(
    String(script.url || "")
      .split("/")
      .pop(),
  )
    .replace(/\.json(?:[?#].*)?$/i, "")
    .replace(/[-_]+/g, " ");
  const pinyinName = normalizeScriptText(
    script.pinyin || urlName || script.name,
  );
  const compactName = normalizedName.replace(/\s+/g, "");
  const compactPinyin = pinyinName.replace(/[^a-z0-9]/g, "");
  const initials = normalizeScriptText(
    script.initials ||
      urlName
        .split(" ")
        .map((part) => part[0] || "")
        .join(""),
  ).replace(/[^a-z]/g, "");
  const initialMatch = pinyinName.match(/[a-z]/);

  return {
    normalizedName,
    compactName,
    pinyinName,
    compactPinyin,
    initials,
    initial:
      /^[A-Z]$/i.test(script.initial) && script.initial
        ? script.initial.toUpperCase()
        : initialMatch
        ? initialMatch[0].toUpperCase()
        : "",
    sortKey: pinyinName.replace(/[^a-z0-9]+/g, " ").trim(),
  };
}

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
          name: "官方剧本/角色包",
        },
        {
          id: "custom",
          name: "自定义剧本",
        },
        {
          id: "upload",
          name: "上传剧本",
        },
      ],
      scripts: [],
      scriptAlphabet: SCRIPT_ALPHABET,
      scriptSearch: "",
      scriptPage: 1,
      activeScriptInitial: "",
    };
  },
  computed: {
    visibleEditions() {
      if (this.activeEditionTab === "official") {
        return this.editions;
      }
      return [];
    },
    scriptCatalog() {
      return this.scripts
        .map((script) => Object.assign({}, script, getScriptNameData(script)))
        .sort((a, b) => {
          if (!a.sortKey && b.sortKey) return 1;
          if (a.sortKey && !b.sortKey) return -1;
          return (
            a.sortKey.localeCompare(b.sortKey, "en", {
              sensitivity: "base",
              numeric: true,
            }) || a.name.localeCompare(b.name, "zh-CN")
          );
        });
    },
    filteredScripts() {
      const query = normalizeScriptText(this.scriptSearch);
      if (!query) return this.scriptCatalog;
      const compactQuery = query.replace(/\s+/g, "");
      return this.scriptCatalog.filter(
        (script) =>
          script.normalizedName.includes(query) ||
          script.compactName.includes(compactQuery) ||
          script.pinyinName.includes(query) ||
          script.compactPinyin.includes(compactQuery) ||
          script.initials.includes(compactQuery),
      );
    },
    visibleScripts() {
      if (this.activeEditionTab !== "custom") return [];
      const start = (this.scriptPage - 1) * SCRIPT_PAGE_SIZE;
      return this.filteredScripts.slice(start, start + SCRIPT_PAGE_SIZE);
    },
    totalScriptPages() {
      return Math.max(
        1,
        Math.ceil(this.filteredScripts.length / SCRIPT_PAGE_SIZE),
      );
    },
    availableScriptInitials() {
      return new Set(
        this.scriptCatalog.map((script) => script.initial).filter(Boolean),
      );
    },
    scriptPageItems() {
      const total = this.totalScriptPages;
      if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
      }

      let start = Math.max(2, this.scriptPage - 2);
      let end = Math.min(total - 1, this.scriptPage + 2);
      if (this.scriptPage <= 4) end = 6;
      if (this.scriptPage >= total - 3) start = total - 5;

      const pages = [1];
      if (start > 2) pages.push("start-ellipsis");
      for (let page = start; page <= end; page += 1) pages.push(page);
      if (end < total - 1) pages.push("end-ellipsis");
      pages.push(total);
      return pages;
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
        this.scriptPage = 1;
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
    },
    openUpload() {
      this.$refs.upload.click();
    },
    updateScriptSearch(value) {
      this.scriptSearch = value;
      this.scriptPage = 1;
      this.activeScriptInitial = "";
    },
    setScriptPage(page) {
      this.scriptPage = Math.min(
        this.totalScriptPages,
        Math.max(1, Number(page) || 1),
      );
      this.activeScriptInitial = "";
    },
    jumpToScriptInitial(letter) {
      const scriptIndex = this.scriptCatalog.findIndex(
        (script) => script.initial === letter,
      );
      if (scriptIndex < 0) return;
      const targetScript = this.scriptCatalog[scriptIndex];
      this.scriptSearch = "";
      this.scriptPage = Math.floor(scriptIndex / SCRIPT_PAGE_SIZE) + 1;
      this.activeScriptInitial = letter;
      this.$nextTick(() => {
        const targetRef = this.$refs[`script-${targetScript.url}`];
        const targetElement = Array.isArray(targetRef)
          ? targetRef[0]
          : targetRef;
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
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
  flex-wrap: wrap;
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

.script-browser {
  text-align: center;
}

.script-search {
  box-sizing: border-box;
  display: block;
  width: min(520px, calc(100% - 20px));
  margin: 0 auto 10px;
  padding: 8px 12px;
  border: 2px solid #8a7864;
  background: #111;
  color: inherit;
  font: inherit;

  &:focus {
    border-color: red;
    outline: none;
  }
}

.script-alphabet,
.script-pagination {
  align-items: center;
  justify-content: center;
  gap: 5px;

  button {
    border: 1px solid #8a7864;
    background: #111;
    color: inherit;
    cursor: pointer;
    font: inherit;

    &.active {
      color: red;
      border-color: red;
    }

    &:hover:not(:disabled) {
      color: red;
      border-color: red;
    }

    &:disabled {
      cursor: default;
      opacity: 0.3;
    }
  }
}

.script-alphabet {
  display: grid;
  grid-template-columns: repeat(26, 30px);
  width: max-content;
  max-width: 100%;
  margin: 0 auto 12px;

  button {
    width: 30px;
    height: 30px;
    padding: 0;
  }
}

.script-pagination {
  display: flex;
  flex-wrap: wrap;
  margin: 0 0 12px;

  button {
    min-width: 34px;
    padding: 5px 9px;
  }

  span {
    min-width: 18px;
  }
}

.script-empty {
  margin: 12px 0 0;
  text-align: center;
}

.script-count {
  margin: 0 0 8px;
  color: #bbb;
  font-size: 90%;
  text-align: center;
}

.script-browser > ul.editions {
  width: 100%;
  max-width: 1300px;
  padding-bottom: 60px;
  margin-right: auto;
  margin-left: auto;
}

ul.official-editions {
  width: 100%;
  max-width: 1040px;
  margin-right: auto;
  margin-left: auto;
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

@media (max-width: 1000px) {
  .script-alphabet {
    grid-template-columns: repeat(13, 30px);
  }
}

@media (max-width: 520px) {
  .script-alphabet {
    grid-template-columns: repeat(9, 30px);
  }
}

@media (max-width: 370px) {
  .script-alphabet {
    grid-template-columns: repeat(7, 30px);
  }
}
</style>
