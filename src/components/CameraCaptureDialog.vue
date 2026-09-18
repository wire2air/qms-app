<script setup>
/**
 * In-app camera capture. Uses getUserMedia (rear camera on mobile/iPad via
 * facingMode:environment, webcam on desktop) → live preview → Capture → still
 * preview with Retake / Use Photo. Emits `captured` with a JPEG File.
 *
 * Why not <input capture>: that only opens the camera on some mobile browsers
 * and silently falls back to a file picker on desktop / iPad — which is exactly
 * the bug this replaces. getUserMedia works everywhere on a secure context
 * (https or localhost).
 */
import { IconCamera, IconRefresh, IconAlertTriangle } from '@tabler/icons-vue'

const emit = defineEmits(['captured'])
const show = defineModel({ type: Boolean, default: false })

const videoRef = ref(null)
const canvasRef = ref(null)
const previewUrl = ref('')
const starting = ref(false)
const error = ref('')
let stream = null

async function start() {
  starting.value = true
  error.value = ''
  previewUrl.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    await nextTick()
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play().catch(() => {})
    }
  } catch {
    error.value = 'Could not access the camera. Check the browser permission, or use Upload File instead.'
  } finally {
    starting.value = false
  }
}

function stop() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

function snap() {
  const v = videoRef.value
  const c = canvasRef.value
  if (!v || !c || !v.videoWidth) return
  c.width = v.videoWidth
  c.height = v.videoHeight
  c.getContext('2d').drawImage(v, 0, 0)
  previewUrl.value = c.toDataURL('image/jpeg', 0.9)
}

function retake() {
  previewUrl.value = ''
}

function usePhoto() {
  const c = canvasRef.value
  if (!c) return
  c.toBlob(
    (blob) => {
      if (!blob) return
      emit('captured', new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      show.value = false
    },
    'image/jpeg',
    0.9,
  )
}

watch(show, (open) => {
  if (open) start()
  else {
    stop()
    previewUrl.value = ''
    error.value = ''
  }
})
onUnmounted(stop)
</script>

<template>
  <BaseDialog v-model="show" title="Take Photo" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:items-center">
      <div
        v-if="error"
        class="tw:flex tw:items-center tw:gap-2 tw:bg-red-50 tw:text-red-700 tw:rounded-lg tw:text-sm tw:px-3 tw:py-2 tw:w-full"
      >
        <IconAlertTriangle :size="18" class="tw:shrink-0" />
        {{ error }}
      </div>

      <div
        v-if="!previewUrl"
        class="tw:w-full tw:bg-black tw:rounded tw:overflow-hidden tw:flex tw:items-center tw:justify-center tw:min-h-60"
      >
        <video ref="videoRef" autoplay playsinline muted class="tw:w-full tw:max-h-[60vh]" />
      </div>
      <img
        v-else
        :src="previewUrl"
        alt="Captured photo"
        class="tw:w-full tw:max-h-[60vh] tw:rounded tw:object-contain tw:bg-black"
      />
      <canvas ref="canvasRef" class="tw:hidden" />
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <template v-if="!previewUrl">
        <BaseButton variant="primary" :disabled="starting || !!error" @click="snap">
          <template #icon><IconCamera :size="16" /></template>
          Capture
        </BaseButton>
      </template>
      <template v-else>
        <BaseButton variant="outline" @click="retake">
          <template #icon><IconRefresh :size="16" /></template>
          Retake
        </BaseButton>
        <BaseButton variant="primary" @click="usePhoto">Use Photo</BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
