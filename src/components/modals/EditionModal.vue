<template>
  <Modal class="editions" v-if="modals.edition" @close="closeEdition()">
    <div v-if="!isCustom">
      <h3>选择剧本</h3>
      <ul class="editions">
        <li
          v-for="edition in editions"
          class="edition"
          :class="['edition-' + edition.id]"
          :style="{
            backgroundImage: `url(${require(
              '../../assets/editions/' + edition.id + '.png',
            )})`,
          }"
          :key="edition.id"
          @click="setHomeEdition(edition)"
        >
          {{ edition.name }}
        </li>
        <li
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
      若想玩自定义剧本，请在
      本地剧本工具中选择想玩的角色然后上传生成的"custom-list.json"文件，或提供同源本地JSON路径。

      <br />
      若想玩自定义角色，请查阅关于如何编写自定义角色定义文件的文档。
      <br />
      <b>请勿上传未知来源的自定义JSON文件！</b>
      <h3>剧本：</h3>
      <ul class="scripts">
        <li
          v-for="(script, index) in scripts"
          :key="index"
          @click="handleURL(script[1])"
        >
          {{ script[0] }}
        </li>
      </ul>
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
import Modal from "./Modal";

export default {
  components: {
    Modal,
  },
  data: function () {
    return {
      editions: editionJSON,
      isCustom: false,
      scripts: [
        ["死罪忏悔日", "/scripts/penanceday.json"],
        ["人人都该诋毁的鲶鱼11.1", "/scripts/catfishing.json"],
        ["如履薄冰（小剧本）", "/scripts/on-thin-ice.json"],
        ["逐底竞技（小剧本）", "/scripts/race-to-the-bottom.json"],
        ["失控造物（小剧本）", "/scripts/frankensteins-mayor.json"],
        ["永生之境（小剧本）", "/scripts/vigormortis-high-school.json"],
        ["无上愉悦（小剧本）", "/scripts/no_greater_joy.json"],
        ["噬脑疑局（小剧本）", "/scripts/a_lleach_of_distrust.json"],
      ],
    };
  },
  computed: mapState(["modals", "selectedEditions"]),
  methods: {
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
            this.parseRoles(roles);
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
          name: ["输入本机服务器上的custom-script.json路径"],
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
      const localUrl = this.normalizeLocalUrl(url);
      if (!localUrl) {
        await this.showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: [
              "只允许加载当前本机服务器上的JSON路径。请使用上传、剪贴板或/scripts/xxx.json。",
            ],
          },
        }).catch(() => {
          return null;
        });
        return;
      }
      const res = await fetch(localUrl);
      if (res && res.json) {
        try {
          const script = await res.json();
          this.parseRoles(script);
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
        this.parseRoles(roles);
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
    parseRoles(roles) {
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
      roles = this.localizeExternalImages(roles);
      meta = this.localizeExternalImages([meta])[0];
      this.$store.commit("setCustomRoles", roles);
      this.$store.commit(
        "setEdition",
        Object.assign({}, meta, { id: "custom" }),
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
    normalizeLocalUrl(url) {
      try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.origin !== window.location.origin) return "";
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch (e) {
        return "";
      }
    },
    localizeExternalImages(items) {
      return items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const image = item.image || item.logo;
        if (!image || typeof image !== "string") return item;
        if (image.startsWith("data:") || image.startsWith("blob:")) return item;
        let parsed;
        try {
          parsed = new URL(image, window.location.origin);
        } catch (e) {
          return item;
        }
        const isLocal = parsed.origin === window.location.origin;
        if (isLocal) return item;
        const cleanItem = Object.assign({}, item);
        delete cleanItem.image;
        delete cleanItem.logo;
        return cleanItem;
      });
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
      if (
        ["tb", "bmr", "snv", "luf", "all", "custom_ankot"].includes(edition.id)
      )
        this.$store.commit("setStates", []);
      this.setEdition(edition, this.selectedEditions);
    },
    ...mapMutations(["toggleModal", "setEdition"]),
  },
};
</script>

<style scoped lang="scss">
ul.editions .edition {
  font-family: PiratesBay, sans-serif;
  letter-spacing: 1px;
  text-align: center;
  padding-top: 15%;
  background-position: center center;
  background-size: 100% auto;
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
  .scripts {
    list-style-type: disc;
    font-size: 120%;
    cursor: pointer;
    display: block;
    width: 50%;
    text-align: left;
    margin: 10px auto;
    li:hover {
      color: red;
    }
  }
}
</style>
