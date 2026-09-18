<script setup>
/**
 * Camera capture dialog — opens the device camera via getUserMedia (works on
 * desktop webcam + mobile), shows a live preview, and emits the captured photo
 * as a File. The editor inserts it through the normal image pipeline.
 */
import { IconCamera } from '@tabler/icons-vue'

const emit = defineEmits(['captured'])
const modelValue = defineModel({ type: Boolean, default: false })

const toast = useToast()
const videoEl = ref(null)
const ready = ref(false)
const facing = ref('environment')
let stream = null

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  ready.value = false
}

async function startStream() {
  stopStream()
  if (!navigator.mediaDevices?.getUserMedia) {
    toast.error('Camera is not supported in this browser.')
    modelValue.value = false
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing.value },
      audio: false,
    })
    await nextTick()
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
      ready.value = true
    }
  } catch {
    toast.error('Could not access the camera (permission denied or no device).')
    modelValue.value = false
  }
}

function flip() {
  facing.value = facing.value === 'environment' ? 'user' : 'environment'
  startStream()
}

function capture() {
  const v = videoEl.value
  if (!v || !ready.value) return
  const canvas = document.createElement('canvas')
  canvas.width = v.videoWidth
  canvas.height = v.videoHeight
  canvas.getContext('2d').drawImage(v, 0, 0)
  canvas.toBlob(
    (blob) => {
      if (!blob) return
      emit('captured', new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      modelValue.value = false
    },
    'image/jpeg',
    0.9,
  )
}

watch(modelValue, (open) => (open ? startStream() : stopStream()))
onBeforeUnmount(stopStream)
</script>

<template>
  <BaseDialog v-model="modelValue" title="Take Photo" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:items-center tw:gap-2">
      <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
      <video
        ref="videoEl"
        autoplay
        playsinline
        muted
        class="tw:w-full tw:max-h-[60vh] tw:rounded tw:bg-black"
      />
      <p v-if="!ready" class="tw:text-xs tw:text-secondary">Starting camera…</p>
    </div>
    <template #footer>
      <BaseButton variant="outline" @click="flip">Flip camera</BaseButton>
      <BaseButton variant="primary" :disabled="!ready" @click="capture">
        <template #icon><IconCamera :size="16" /></template>
        Capture
      </BaseButton>
    </template>
  </BaseDialog>
</template>
