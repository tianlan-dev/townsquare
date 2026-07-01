<template>
  <div>
    <input
      v-show="false"
      type="file"
      ref="upload"
      accept="image/*"
      @change="onFileChange"
    />

    <div
      v-if="cropping"
      class="avatar-crop-overlay"
      @click.self="closeCropping"
    >
      <section
        class="avatar-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
      >
        <button
          type="button"
          class="close-button"
          aria-label="关闭"
          @click="closeCropping"
        >
          <font-awesome-icon icon="times" />
        </button>

        <header class="crop-header">
          <span></span>
          <h2 id="avatar-crop-title">调整头像</h2>
          <span></span>
        </header>

        <div class="crop-layout">
          <div class="crop-main">
            <div class="crop-stage" :class="{ ready: isReady }">
              <img
                v-if="image"
                :src="image"
                ref="image"
                alt="待裁剪头像"
              />
            </div>
            <p class="drag-hint">
              <font-awesome-icon icon="hand-paper" />
              <span>拖动图片调整位置</span>
            </p>
          </div>

          <aside class="crop-controls">
            <div class="zoom-group">
              <label for="avatar-zoom">缩放</label>
              <div class="zoom-control">
                <button
                  type="button"
                  aria-label="缩小"
                  @click="nudgeZoom(-0.08)"
                >
                  <font-awesome-icon icon="minus" />
                </button>
                <input
                  id="avatar-zoom"
                  type="range"
                  :min="zoomMin"
                  :max="zoomMax"
                  step="0.01"
                  v-model.number="zoomValue"
                  @input="applyZoom"
                />
                <button
                  type="button"
                  aria-label="放大"
                  @click="nudgeZoom(0.08)"
                >
                  <font-awesome-icon icon="plus" />
                </button>
              </div>
            </div>
          </aside>
        </div>

        <footer class="crop-actions">
          <button type="button" class="secondary" @click="closeCropping">
            取消
          </button>
          <button type="button" class="primary" @click="sendImage">
            <font-awesome-icon icon="file-upload" />
            <span>确认上传</span>
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script>
import { mapState } from "vuex";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 0.86;
const ZOOM_SPAN = 4;

export default {
  data() {
    return {
      image: null,
      croppedImage: null,
      cropper: null,
      cropping: false,
      isReady: false,
      zoomMin: 0,
      zoomMax: 1,
      zoomValue: 0,
    };
  },
  computed: {
    ...mapState(["session"]),
  },
  beforeDestroy() {
    this.destroyCropper();
  },
  methods: {
    async uploadAvatar() {
      this.$refs.upload.click();
    },
    onFileChange(event) {
      const file = event.target.files[0];
      if (!file) return;

      this.destroyCropper();
      this.cropping = true;
      this.isReady = false;

      const reader = new FileReader();
      reader.onload = (e) => {
        this.image = e.target.result;
        this.$nextTick(() => {
          this.initCropper();
        });
      };
      reader.readAsDataURL(file);
    },
    initCropper() {
      if (!this.$refs.image) return;

      this.cropper = new Cropper(this.$refs.image, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: "move",
        autoCrop: true,
        autoCropArea: 0.78,
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        background: false,
        center: true,
        guides: true,
        highlight: false,
        rotatable: false,
        scalable: false,
        zoomable: true,
        wheelZoomRatio: 0.08,
        ready: () => {
          this.configureCropBox();
          this.setInitialZoom();
          this.isReady = true;
        },
        zoom: () => {
          this.syncZoomFromCropper();
        },
      });
    },
    configureCropBox() {
      if (!this.cropper) return;
      const container = this.cropper.getContainerData();
      const ratio = window.innerWidth <= 860 ? 0.58 : 0.68;
      const size = Math.round(Math.min(container.width, container.height) * ratio);
      this.cropper.setCropBoxData({
        width: size,
        height: size,
        left: container.left + (container.width - size) / 2,
        top: container.top + (container.height - size) / 2,
      });
    },
    setInitialZoom() {
      if (!this.cropper) return;
      const cropBox = this.cropper.getCropBoxData();
      const imageData = this.cropper.getImageData();
      const minZoom = Math.max(
        cropBox.width / imageData.naturalWidth,
        cropBox.height / imageData.naturalHeight,
      );
      this.zoomMin = Number(minZoom.toFixed(2));
      this.zoomMax = Number(Math.max(minZoom * ZOOM_SPAN, minZoom + 1).toFixed(2));
      this.zoomValue = this.zoomMin;
      this.cropper.zoomTo(this.zoomValue);
    },
    syncZoomFromCropper() {
      if (!this.cropper) return;
      const imageData = this.cropper.getImageData();
      if (!imageData.naturalWidth) return;
      const zoom = imageData.width / imageData.naturalWidth;
      const boundedZoom = Math.min(this.zoomMax, Math.max(this.zoomMin, zoom));
      this.zoomValue = Number(boundedZoom.toFixed(2));
    },
    applyZoom() {
      if (!this.cropper || !this.isReady) return;
      this.cropper.zoomTo(this.zoomValue);
    },
    nudgeZoom(delta) {
      const nextZoom = Math.min(
        this.zoomMax,
        Math.max(this.zoomMin, this.zoomValue + delta),
      );
      this.zoomValue = Number(nextZoom.toFixed(2));
      this.applyZoom();
    },
    cropImage() {
      if (!this.cropper) return "";
      const canvas = this.cropper.getCroppedCanvas({
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });
      return canvas.toDataURL("image/webp", OUTPUT_QUALITY);
    },
    sendImage() {
      const croppedImage = this.cropImage();
      if (!croppedImage) return;

      this.croppedImage = croppedImage;
      this.$store.commit("session/setPlayerAvatarSource", "uploaded");
      if (this.session.sessionId) {
        this.$store.commit("session/setPlayerAvatar", croppedImage);
      } else {
        this.$store.commit("session/updatePlayerAvatar", croppedImage);
      }
      this.closeCropping();
    },
    destroyCropper() {
      if (this.cropper) {
        this.cropper.destroy();
      }
      this.cropper = null;
    },
    closeCropping() {
      this.destroyCropper();
      this.cropping = false;
      this.isReady = false;
      if (this.$refs.upload) {
        this.$refs.upload.value = "";
      }
      this.image = null;
      this.croppedImage = null;
      this.zoomMin = 0;
      this.zoomMax = 1;
      this.zoomValue = 0;
    },
  },
};
</script>

<style scoped>
.avatar-crop-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(8px, 2vh, 24px);
  background: rgba(6, 5, 4, 0.78);
  backdrop-filter: blur(6px);
}

.avatar-crop-modal {
  position: relative;
  width: min(920px, calc(100vw - 16px));
  max-height: calc(100dvh - 16px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #382417;
  background:
    linear-gradient(rgba(255, 248, 229, 0.9), rgba(241, 225, 192, 0.92)),
    radial-gradient(circle at top left, rgba(139, 22, 20, 0.12), transparent 34%),
    #efe0bf;
  border: 2px solid rgba(82, 49, 28, 0.72);
  border-radius: 8px;
  box-shadow:
    0 30px 90px rgba(0, 0, 0, 0.55),
    inset 0 0 0 4px rgba(255, 247, 224, 0.52),
    inset 0 0 0 6px rgba(98, 58, 31, 0.18);
}

.avatar-crop-modal::before,
.avatar-crop-modal::after {
  content: "";
  position: absolute;
  inset: 10px;
  pointer-events: none;
  border: 1px solid rgba(111, 68, 38, 0.28);
  border-radius: 5px;
}

.avatar-crop-modal::after {
  inset: 18px;
  border-color: rgba(111, 68, 38, 0.13);
}

.close-button {
  position: absolute;
  top: 26px;
  right: 26px;
  z-index: 3;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff7df;
  background: #7b1f18;
  border: 1px solid rgba(255, 234, 190, 0.5);
  border-radius: 50%;
  box-shadow: 0 8px 18px rgba(74, 15, 12, 0.38);
  cursor: pointer;
}

.crop-header {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 26px;
  padding: clamp(18px, 3vh, 34px) 86px clamp(10px, 1.8vh, 18px);
  flex: 0 0 auto;
}

.crop-header span {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(128, 77, 45, 0.38),
    rgba(128, 77, 45, 0.72)
  );
}

.crop-header span:last-child {
  transform: scaleX(-1);
}

.crop-header h2 {
  margin: 0;
  color: #7b1f18;
  font-size: clamp(22px, 3vh, 28px);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0;
}

.crop-layout {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(8px, 1.5vh, 18px);
  padding: clamp(4px, 1vh, 10px) 64px clamp(10px, 2vh, 24px);
  overflow: visible;
  flex: 1 1 auto;
  min-height: 0;
}

.crop-main {
  min-width: 0;
}

.crop-stage {
  position: relative;
  height: clamp(150px, calc(100dvh - 320px), 460px);
  min-height: 0;
  overflow: hidden;
  background: #21140f;
  border: 1px solid rgba(65, 37, 22, 0.38);
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgba(255, 246, 221, 0.12);
}

.crop-stage img {
  display: block;
  max-width: 100%;
}

.crop-stage ::v-deep .cropper-container {
  width: 100% !important;
  height: 100% !important;
}

.crop-stage ::v-deep .cropper-view-box {
  border-radius: 50%;
  outline: none;
  box-shadow: 0 0 0 2px rgba(255, 248, 230, 0.88);
}

.crop-stage ::v-deep .cropper-face {
  border-radius: 50%;
  background: transparent;
}

.crop-stage ::v-deep .cropper-line,
.crop-stage ::v-deep .cropper-point {
  display: none;
}

.crop-stage ::v-deep .cropper-dashed {
  border-color: rgba(255, 248, 230, 0.68);
}

.drag-hint {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin: clamp(6px, 1.3vh, 14px) 0 0;
  color: rgba(75, 48, 31, 0.78);
  font-size: 16px;
  line-height: 1.4;
}

.crop-controls {
  display: block;
  width: min(520px, 100%);
  margin: 0 auto;
  min-width: 0;
}

.zoom-group label {
  display: block;
  margin: 0 0 12px;
  color: #382417;
  font-size: 18px;
  line-height: 1.25;
  font-weight: 800;
  letter-spacing: 0;
}

.zoom-control {
  display: grid;
  grid-template-columns: 42px 1fr 42px;
  gap: 14px;
  align-items: center;
}

.zoom-control button {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #4a2d1d;
  background: rgba(255, 248, 229, 0.55);
  border: 1px solid rgba(104, 66, 42, 0.42);
  border-radius: 6px;
  cursor: pointer;
}

.zoom-control input {
  width: 100%;
  accent-color: #8f201c;
  cursor: pointer;
}

.crop-actions {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  gap: 26px;
  padding: clamp(12px, 2vh, 24px) 52px clamp(14px, 2.4vh, 30px);
  border-top: 1px solid rgba(128, 77, 45, 0.22);
  flex: 0 0 auto;
}

.crop-actions button {
  min-width: 160px;
  min-height: clamp(44px, 6vh, 56px);
  padding: 0 26px;
  border-radius: 6px;
  font-size: clamp(18px, 2.6vh, 22px);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0;
  cursor: pointer;
}

.crop-actions .secondary {
  color: #3f2819;
  background: rgba(255, 248, 229, 0.42);
  border: 1px solid rgba(104, 66, 42, 0.34);
}

.crop-actions .primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #fff5d9;
  background: linear-gradient(#b12825, #861b18);
  border: 1px solid rgba(255, 221, 158, 0.58);
  box-shadow: 0 10px 22px rgba(101, 23, 19, 0.28);
}

.close-button:hover,
.zoom-control button:hover,
.crop-actions button:hover {
  filter: brightness(1.05);
}

@media (max-width: 860px) {
  .avatar-crop-overlay {
    padding: 8px;
    align-items: flex-start;
  }

  .avatar-crop-modal {
    width: min(100%, 380px);
    max-height: calc(100dvh - 16px);
  }

  .close-button {
    top: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
  }

  .crop-header {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 24px 56px 10px 22px;
  }

  .crop-header span {
    display: none;
  }

  .crop-header h2 {
    font-size: 23px;
  }

  .crop-layout {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 6px 16px 16px;
  }

  .crop-stage {
    height: clamp(180px, calc(100dvh - 300px), 280px);
    min-height: 0;
  }

  .drag-hint {
    margin-top: 10px;
    font-size: 14px;
  }

  .zoom-group label {
    margin-bottom: 8px;
    font-size: 16px;
  }

  .crop-actions {
    gap: 12px;
    padding: 14px 16px 18px;
  }

  .crop-actions button {
    min-width: 0;
    flex: 1;
    min-height: 50px;
    padding: 0 14px;
    font-size: 18px;
  }
}

@media (max-height: 680px) {
  .close-button {
    top: 14px;
    right: 18px;
    width: 34px;
    height: 34px;
  }

  .crop-header {
    padding-top: 14px;
    padding-bottom: 6px;
  }

  .crop-layout {
    padding-top: 4px;
    padding-bottom: 8px;
  }

  .crop-stage {
    height: clamp(120px, calc(100dvh - 255px), 330px);
  }

  .drag-hint {
    margin-top: 6px;
    font-size: 13px;
  }

  .zoom-group label {
    margin-bottom: 6px;
    font-size: 15px;
  }

  .zoom-control {
    grid-template-columns: 36px 1fr 36px;
    gap: 10px;
  }

  .zoom-control button {
    width: 36px;
    height: 36px;
  }

  .crop-actions {
    padding-top: 10px;
    padding-bottom: 12px;
  }

  .crop-actions button {
    min-height: 40px;
  }
}
</style>
