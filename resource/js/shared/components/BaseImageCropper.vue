<script setup>
/**
 * BaseImageCropper — crop/zoom an image before upload (logos, avatars, evidence
 * photos) on the installed `vue-advanced-cropper`. Emits the cropped result as a
 * PNG data URL on every change; exposes getResult() for an explicit "apply".
 *
 *   <BaseImageCropper :src="objectUrl" :aspectRatio="1" @change="onCrop" />
 *
 * Needs a real canvas (browser) — verify in Storybook/app, not jsdom.
 */
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

defineProps({
  // Image URL / object URL / data URL to crop.
  src: { type: String, default: '' },
  // Lock the crop box to an aspect ratio (e.g. 1 for a square avatar). null = free.
  aspectRatio: { type: Number, default: null },
  height: { type: Number, default: 320 },
})

const emit = defineEmits(['change'])

const result = ref('')
function onChange({ canvas }) {
  if (!canvas) return
  result.value = canvas.toDataURL()
  emit('change', result.value)
}

defineExpose({ getResult: () => result.value })
</script>

<template>
  <div
    class="tw:overflow-hidden tw:rounded-lg tw:border tw:border-divider tw:bg-code"
    :style="{ height: `${height}px` }"
  >
    <Cropper
      :src="src"
      :stencilProps="aspectRatio ? { aspectRatio } : {}"
      class="tw:h-full"
      @change="onChange"
    />
  </div>
</template>
