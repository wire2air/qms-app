<script setup>
import { IconCamera, IconUpload, IconX, IconPhoto } from '@tabler/icons-vue'
import { uploadFile } from '@/utils/uploadService.js'

const props = defineProps({
  mode: {
    type: String,
    default: 'both',
    validator: (value) => ['both', 'camera', 'upload'].includes(value),
  },
  maxFileSize: {
    type: Number,
    default: 5 * 1024 * 1024,
  },
  placeholder: {
    type: String,
    default: 'Add Photo',
  },
  previewSize: {
    type: String,
    default: '150px',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  facingMode: {
    type: String,
    default: 'environment',
    validator: (value) => ['user', 'environment'].includes(value),
  },
  fileType: {
    type: String,
    default: 'ASSET',
  },
})

const emit = defineEmits(['error', 'capture', 'upload'])
const modelValue = defineModel({ type: [String, Object, null], default: null })

const fileInputRef = ref(null)
const videoRef = ref(null)
const canvasRef = ref(null)
const cameraDialogOpen = ref(false)
const stream = ref(null)
const previewUrl = ref(null)
const cameraError = ref(null)
const uploading = ref(false)

const displayUrl = computed(() => {
  if (modelValue.value instanceof File) {
    return URL.createObjectURL(modelValue.value)
  }
  if (typeof modelValue.value === 'string' && modelValue.value) {
    return modelValue.value
  }
  // Uploaded asset object — produced by uploadFile() and persisted as-is.
  if (modelValue.value && typeof modelValue.value === 'object' && modelValue.value.url) {
    return modelValue.value.url
  }
  return previewUrl.value
})

const hasImage = computed(() => !!displayUrl.value)

const showCameraButton = computed(
  () => ['both', 'camera'].includes(props.mode) && !props.disabled && !props.readonly,
)

const showUploadButton = computed(
  () => ['both', 'upload'].includes(props.mode) && !props.disabled && !props.readonly,
)

async function startCamera() {
  cameraError.value = null
  try {
    const constraints = {
      video: {
        facingMode: props.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }
    stream.value = await navigator.mediaDevices.getUserMedia(constraints)
    setTimeout(() => {
      if (videoRef.value) {
        videoRef.value.srcObject = stream.value
        videoRef.value.play()
      }
    }, 100)
  } catch (error) {
    cameraError.value = getCameraErrorMessage(error)
    emit('error', { type: 'camera', error })
  }
}

function getCameraErrorMessage(error) {
  if (error.name === 'NotAllowedError')
    return 'Camera access denied. Please allow camera permissions.'
  if (error.name === 'NotFoundError') return 'No camera found on this device.'
  if (error.name === 'NotReadableError') return 'Camera is already in use by another application.'
  return 'Unable to access camera. Please try again.'
}

function stopCamera() {
  if (stream.value) {
    stream.value.getTracks().forEach((track) => track.stop())
    stream.value = null
  }
}

function openCamera() {
  if (props.disabled || props.readonly) return
  cameraDialogOpen.value = true
  startCamera()
}

function closeCamera() {
  stopCamera()
  cameraDialogOpen.value = false
  cameraError.value = null
}

// Persist the chosen file to the server and store the returned asset record.
// Raw File objects can't be JSON-serialized (they stringify to "{}"), so we
// always upload before writing modelValue.
async function persistFile(file, eventName) {
  uploading.value = true
  try {
    const asset = await uploadFile(file, props.fileType)
    modelValue.value = asset
    emit(eventName, asset)
  } catch (error) {
    emit('error', { type: 'upload', error, message: error?.message || 'Upload failed' })
  } finally {
    uploading.value = false
  }
}

function capturePhoto() {
  if (!videoRef.value || !canvasRef.value) return
  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas.getContext('2d')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  canvas.toBlob(
    async (blob) => {
      if (!blob) return
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
      previewUrl.value = URL.createObjectURL(blob)
      closeCamera()
      await persistFile(file, 'capture')
    },
    'image/jpeg',
    0.9,
  )
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > props.maxFileSize) {
    emit('error', {
      type: 'fileSize',
      message: `File size exceeds ${Math.round(props.maxFileSize / 1024 / 1024)}MB limit`,
    })
    return
  }
  if (!file.type.startsWith('image/')) {
    emit('error', { type: 'fileType', message: 'Please select an image file' })
    return
  }
  previewUrl.value = URL.createObjectURL(file)
  await persistFile(file, 'upload')
}

function triggerFileInput() {
  if (props.disabled || props.readonly) return
  fileInputRef.value?.click()
}

function clearImage() {
  if (props.disabled || props.readonly) return
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = null
  modelValue.value = null
}

onBeforeUnmount(() => {
  stopCamera()
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})

defineExpose({ openCamera, triggerFileInput, clearImage, capturePhoto })
</script>

<template>
  <div :class="['tw:inline-block', disabled ? 'tw:opacity-50' : '']">
    <!-- Preview -->
    <div
      v-if="hasImage"
      class="tw:relative tw:rounded-lg tw:overflow-hidden"
      :style="{ width: previewSize, height: previewSize }"
    >
      <img :src="displayUrl" class="tw:w-full tw:h-full tw:object-cover" alt="" />
      <button
        v-if="!disabled && !readonly"
        class="tw:absolute tw:top-1 tw:right-1 tw:size-6 tw:rounded-full tw:bg-black/50 tw:flex tw:items-center tw:justify-center tw:text-white tw:hover:bg-black/70 tw:transition-colors"
        type="button"
        @click="clearImage"
      >
        <IconX :size="14" :stroke-width="2.5" />
      </button>
    </div>

    <!-- Placeholder -->
    <div
      v-else
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border-2 tw:border-dashed tw:border-gray-300 tw:bg-gray-50 tw:p-4"
      :style="{ width: previewSize, height: previewSize }"
    >
      <IconPhoto :size="32" class="tw:text-gray-400" />
      <span class="tw:text-xs tw:text-secondary tw:text-center">{{ placeholder }}</span>
      <div class="tw:flex tw:gap-2">
        <button
          v-if="showCameraButton"
          type="button"
          class="tw:size-8 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-primary tw:hover:bg-primary/10 tw:transition-colors"
          @click.stop="openCamera"
        >
          <IconCamera :size="18" />
        </button>
        <button
          v-if="showUploadButton"
          type="button"
          class="tw:size-8 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-primary tw:hover:bg-primary/10 tw:transition-colors"
          @click.stop="triggerFileInput"
        >
          <IconUpload :size="18" />
        </button>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="tw:hidden"
      @change="handleFileUpload"
    />

    <!-- Camera dialog -->
    <div
      v-if="cameraDialogOpen"
      class="tw:fixed tw:inset-0 tw:z-50 tw:bg-black/60 tw:flex tw:items-center tw:justify-center tw:p-4"
      @click.self="closeCamera"
    >
      <div class="tw:bg-white tw:rounded-xl tw:overflow-hidden tw:w-full tw:max-w-sm tw:shadow-xl">
        <!-- Video / error area -->
        <div class="tw:relative tw:bg-black">
          <div
            v-if="cameraError"
            class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:p-8 tw:text-center"
          >
            <IconCamera :size="48" class="tw:text-red-400" />
            <p class="tw:text-sm tw:text-red-600">{{ cameraError }}</p>
          </div>
          <video
            v-else
            ref="videoRef"
            class="tw:w-full tw:max-h-[60vh] tw:object-cover tw:block"
            autoplay
            playsinline
            muted
          />
          <canvas ref="canvasRef" class="tw:hidden" />
        </div>

        <!-- Actions -->
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-3 tw:p-4">
          <button
            type="button"
            class="tw:px-4 tw:py-2 tw:rounded-lg tw:text-sm tw:font-medium tw:text-secondary tw:hover:bg-gray-100 tw:transition-colors"
            @click="closeCamera"
          >
            Cancel
          </button>
          <button
            v-if="!cameraError"
            type="button"
            class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:rounded-lg tw:text-sm tw:font-medium tw:bg-primary tw:text-white tw:hover:bg-primary/90 tw:transition-colors"
            @click="capturePhoto"
          >
            <IconCamera :size="16" />
            Capture
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
