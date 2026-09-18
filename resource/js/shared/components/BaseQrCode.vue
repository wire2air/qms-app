<script setup>
/**
 * BaseQrCode — render a QR code for a string (asset tags, record deep-links,
 * label printing) using the `qrcode` lib's SVG output. SVG (not canvas) so it
 * scales crisply, prints well, and is server/test-renderable. Exposed as an
 * accessible image (role="img" + aria-label).
 *
 *   <BaseQrCode :value="`${origin}/records/${record.id}`" :size="120" />
 */
import QRCode from 'qrcode'

const props = defineProps({
  value: { type: String, required: true },
  size: { type: Number, default: 160 },
  // Error-correction level: L | M | Q | H (higher = more resilient, denser).
  errorCorrectionLevel: { type: String, default: 'M' },
  margin: { type: Number, default: 1 },
})

const svg = ref('')

async function render() {
  if (!props.value) {
    svg.value = ''
    return
  }
  try {
    svg.value = await QRCode.toString(props.value, {
      type: 'svg',
      errorCorrectionLevel: props.errorCorrectionLevel,
      margin: props.margin,
      width: props.size,
    })
  } catch {
    svg.value = '' // invalid input (e.g. too long for the EC level) → render nothing
  }
}

watch(() => [props.value, props.size, props.errorCorrectionLevel, props.margin], render, {
  immediate: true,
})
</script>

<template>
  <div
    class="tw:inline-block"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="`QR code: ${value}`"
    v-html="svg"
  ></div>
</template>
