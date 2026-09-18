<script setup>
/**
 * BaseSignaturePad — a draw-to-sign canvas (e-signatures on approvals / QC
 * records) built on `signature_pad`. v-model is the signature as a PNG data URL
 * ('' when empty). Handles HiDPI scaling and exposes clear()/isEmpty().
 *
 *   <BaseSignaturePad v-model="signatureDataUrl" />
 *
 * Needs a real canvas (browser) — verify in Storybook/app, not jsdom.
 */
import SignaturePad from 'signature_pad'

const props = defineProps({
  height: { type: Number, default: 180 },
  penColor: { type: String, default: '#111827' },
  disabled: { type: Boolean, default: false },
  clearLabel: { type: String, default: 'Clear' },
})

// PNG data URL; '' when empty.
const model = defineModel({ type: String, default: '' })

const canvasRef = ref(null)
let pad
// Our last emitted value, so the model watcher can ignore the echo of our own
// endStroke and only re-render genuinely external changes (e.g. loading a saved
// record into a readonly form).
let lastEmitted = ''

// Paint a data-URL value onto the canvas (or clear when empty). Restores a saved
// signature on mount, after a resize, and on external model changes.
function render(dataUrl) {
  if (!pad) return
  if (dataUrl) pad.fromDataURL(dataUrl)
  else pad.clear()
}

// Scale the backing store to devicePixelRatio so the stroke stays crisp. A
// resize resets the buffer, so re-render the current value afterwards.
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  canvas.width = canvas.offsetWidth * ratio
  canvas.height = canvas.offsetHeight * ratio
  canvas.getContext('2d').scale(ratio, ratio)
  render(model.value)
}

function clear() {
  pad?.clear()
  lastEmitted = ''
  model.value = ''
}

onMounted(() => {
  pad = new SignaturePad(canvasRef.value, { penColor: props.penColor })
  pad.addEventListener('endStroke', () => {
    lastEmitted = pad.isEmpty() ? '' : pad.toDataURL()
    model.value = lastEmitted
  })
  resizeCanvas() // also restores an existing model value
  window.addEventListener('resize', resizeCanvas)
  if (props.disabled) pad.off()
})

watch(
  () => props.disabled,
  (d) => (d ? pad?.off() : pad?.on()),
)

// Render values set from outside (e.g. a saved record loading after mount),
// ignoring the echo of our own endStroke emit.
watch(model, (val) => {
  if (val !== lastEmitted) render(val)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas)
  pad?.off()
})

defineExpose({ clear, isEmpty: () => pad?.isEmpty() ?? true })
</script>

<template>
  <div class="tw:overflow-hidden tw:rounded-lg tw:border tw:border-divider tw:bg-white">
    <canvas
      ref="canvasRef"
      class="tw:block tw:w-full tw:touch-none"
      :class="disabled && 'tw:opacity-60'"
      :style="{ height: `${height}px` }"
    />
    <div class="tw:flex tw:items-center tw:justify-between tw:border-t tw:border-divider tw:px-3 tw:py-2">
      <span class="tw:text-caption tw:text-secondary">Sign above</span>
      <button
        type="button"
        :disabled="disabled"
        class="tw:rounded-md tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main tw:disabled:opacity-50 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
        @click="clear"
      >
        {{ clearLabel }}
      </button>
    </div>
  </div>
</template>
