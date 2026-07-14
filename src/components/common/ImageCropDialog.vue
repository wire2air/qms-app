<script setup>
import {
  IconPhoto,
  IconDeviceFloppy,
  IconCloudUpload,
  IconTrash,
  IconCamera,
  IconCameraRotate,
  IconArrowLeft,
} from '@tabler/icons-vue'
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const props = defineProps({
  currentImageUrl: {
    type: String,
    default: null,
  },
  title: {
    type: String,
    default: 'Edit Image',
  },
  aspectRatio: {
    type: [Number, null],
    default: 1,
  },
  maxSize: {
    type: Number,
    default: 2048, // Max width/height in pixels
  },
  initialFile: {
    type: File,
    default: null,
  },
})

const emit = defineEmits(['save', 'delete'])

const model = defineModel({ type: Boolean, default: false })

const selectedImage = ref(null)
const cropper = ref(null)
const processing = ref(false)
const fileInput = ref(null)
const sourceError = ref('')

const hasCurrentImage = computed(() => !!props.currentImageUrl)

// ── File selection (real hidden input — a detached input.click() can be
// blocked by the browser's user-activation rules, which is why "upload" could
// silently do nothing). ────────────────────────────────────────────────────
function openFilePicker() {
  sourceError.value = ''
  fileInput.value?.click()
}

function onFileChange(e) {
  const file = e.target.files?.[0]
  // Reset so picking the same file again still fires change.
  e.target.value = ''
  loadFileIntoCropper(file)
}

function loadFileIntoCropper(file) {
  if (!file) return
  if (!file.type?.startsWith('image/')) {
    sourceError.value = 'Please choose an image file.'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    sourceError.value = 'File size must be less than 10MB.'
    return
  }
  sourceError.value = ''
  const reader = new FileReader()
  reader.onload = (ev) => {
    selectedImage.value = ev.target.result
  }
  reader.readAsDataURL(file)
}

// ── Camera capture ──────────────────────────────────────────────────────────
const cameraActive = ref(false)
const videoEl = ref(null)
const mediaStream = ref(null)
const facingMode = ref('user')
const hasMultipleCameras = ref(false)

async function startCamera() {
  sourceError.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    sourceError.value = 'Camera is not available in this browser.'
    return
  }
  try {
    cameraActive.value = true
    await nextTick()
    mediaStream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode.value },
      audio: false,
    })
    if (videoEl.value) {
      videoEl.value.srcObject = mediaStream.value
      await videoEl.value.play().catch(() => {})
    }
    // Only offer the flip control when there's more than one camera.
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      hasMultipleCameras.value = devices.filter((d) => d.kind === 'videoinput').length > 1
    } catch {
      hasMultipleCameras.value = false
    }
  } catch (err) {
    cameraActive.value = false
    sourceError.value =
      err?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow access and try again.'
        : 'Could not start the camera.'
  }
}

function stopCamera() {
  if (mediaStream.value) {
    mediaStream.value.getTracks().forEach((t) => t.stop())
    mediaStream.value = null
  }
  if (videoEl.value) videoEl.value.srcObject = null
  cameraActive.value = false
}

async function flipCamera() {
  facingMode.value = facingMode.value === 'user' ? 'environment' : 'user'
  stopCamera()
  await startCamera()
}

function capturePhoto() {
  const video = videoEl.value
  if (!video || !video.videoWidth) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  selectedImage.value = canvas.toDataURL('image/jpeg', 0.92)
  stopCamera()
}

// ── Save cropped image ──────────────────────────────────────────────────────
async function save() {
  if (!cropper.value) return
  processing.value = true
  try {
    const { canvas } = cropper.value.getResult()

    // Resize if needed
    let finalCanvas = canvas
    if (canvas.width > props.maxSize || canvas.height > props.maxSize) {
      const scale = Math.min(props.maxSize / canvas.width, props.maxSize / canvas.height)
      const resizeCanvas = document.createElement('canvas')
      resizeCanvas.width = canvas.width * scale
      resizeCanvas.height = canvas.height * scale
      const ctx = resizeCanvas.getContext('2d')
      ctx.drawImage(canvas, 0, 0, resizeCanvas.width, resizeCanvas.height)
      finalCanvas = resizeCanvas
    }

    const blob = await new Promise((resolve) => {
      finalCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
    })
    const file = new File([blob], 'image.jpg', { type: 'image/jpeg' })

    emit('save', { file, blob, canvas: finalCanvas })
    selectedImage.value = null
  } catch (err) {
    console.error('Error processing image:', err)
    sourceError.value = 'Failed to process image. Please try again.'
  } finally {
    processing.value = false
  }
}

function deleteImage() {
  emit('delete')
}

function backToSource() {
  selectedImage.value = null
  sourceError.value = ''
}

function cancel() {
  stopCamera()
  selectedImage.value = null
  model.value = false
}

// When opened with a pre-selected file (e.g. from the editor toolbar), skip the
// in-dialog picker and drop straight into crop mode.
watch(
  [model, () => props.initialFile],
  ([open, file]) => {
    if (open && file) loadFileIntoCropper(file)
  },
  { immediate: true },
)

// Reset + release the camera when the dialog closes.
watch(model, (open) => {
  if (!open) {
    stopCamera()
    selectedImage.value = null
    processing.value = false
    sourceError.value = ''
  }
})

onBeforeUnmount(stopCamera)
</script>

<template>
  <BaseDialog v-model="model" :title="title">
    <div class="tw:space-y-6">
      <!-- Hidden file input (reliable click target) -->
      <input ref="fileInput" type="file" accept="image/*" class="tw:hidden" @change="onFileChange" />

      <!-- Crop mode — an image is selected -->
      <div v-if="selectedImage" class="tw:space-y-4">
        <div class="tw:h-96 tw:bg-main tw:rounded-lg tw:overflow-hidden">
          <Cropper
            ref="cropper"
            :src="selectedImage"
            :stencilProps="{ aspectRatio }"
            class="tw:h-full"
          />
        </div>
        <p class="tw:text-xs tw:text-center tw:text-secondary">
          <template v-if="aspectRatio">
            Adjust the crop area. Image will be saved as {{ aspectRatio }}:1 aspect ratio.
          </template>
          <template v-else> Adjust the crop area to fit your needs. </template>
        </p>
      </div>

      <!-- Camera mode — live preview -->
      <div v-else-if="cameraActive" class="tw:space-y-4">
        <div class="tw:h-96 tw:bg-black tw:rounded-lg tw:overflow-hidden tw:flex tw:items-center tw:justify-center">
          <video ref="videoEl" autoplay playsinline muted class="tw:h-full tw:w-full tw:object-cover"></video>
        </div>
        <p class="tw:text-xs tw:text-center tw:text-secondary">Position yourself, then capture.</p>
      </div>

      <!-- Current image preview -->
      <div v-else-if="hasCurrentImage" class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:py-4">
        <img
          :src="currentImageUrl"
          alt="Current image"
          class="tw:size-32 tw:rounded-lg tw:object-cover tw:border tw:border-divider"
        />
        <p class="tw:text-xs tw:text-secondary">Current image</p>
      </div>

      <!-- Empty state -->
      <div v-else class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:py-8">
        <div
          class="tw:size-32 tw:rounded-lg tw:bg-main tw:flex tw:items-center tw:justify-center tw:border tw:border-divider"
        >
          <IconPhoto :size="48" class="tw:text-secondary" />
        </div>
        <p class="tw:text-xs tw:text-secondary">No image selected</p>
      </div>

      <p v-if="sourceError" class="tw:text-xs tw:text-center tw:text-red-600">{{ sourceError }}</p>

      <!-- Actions -->
      <div class="tw:grid tw:grid-cols-1 tw:gap-3">
        <!-- Crop mode -->
        <template v-if="selectedImage">
          <button
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0 disabled:tw:opacity-60"
            :disabled="processing"
            @click="save"
          >
            <BaseSpinner v-if="processing" size="sm" color="white" />
            <IconDeviceFloppy v-else :size="18" />
            Save
          </button>
          <button
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:rounded-lg tw:cursor-pointer tw:hover:bg-sidebar tw:transition-colors tw:border-0"
            :disabled="processing"
            @click="backToSource"
          >
            <IconArrowLeft :size="18" /> Choose a different image
          </button>
        </template>

        <!-- Camera mode -->
        <template v-else-if="cameraActive">
          <button
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0"
            @click="capturePhoto"
          >
            <IconCamera :size="18" /> Capture
          </button>
          <button
            v-if="hasMultipleCameras"
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:rounded-lg tw:cursor-pointer tw:hover:bg-sidebar tw:transition-colors tw:border tw:border-divider"
            @click="flipCamera"
          >
            <IconCameraRotate :size="18" /> Switch camera
          </button>
          <button
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:rounded-lg tw:cursor-pointer tw:hover:bg-sidebar tw:transition-colors tw:border-0"
            @click="stopCamera"
          >
            <IconArrowLeft :size="18" /> Back
          </button>
        </template>

        <!-- Source selection (empty / current-image state) -->
        <template v-else>
          <button
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0"
            @click="openFilePicker"
          >
            <IconCloudUpload :size="18" /> Upload New Image
          </button>
          <button
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-on-main tw:bg-transparent tw:rounded-lg tw:cursor-pointer tw:hover:bg-sidebar tw:transition-colors tw:border tw:border-divider"
            @click="startCamera"
          >
            <IconCamera :size="18" /> Take Photo
          </button>
          <button
            v-if="hasCurrentImage"
            class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-bold tw:text-red-600 tw:bg-transparent tw:rounded-lg tw:cursor-pointer tw:hover:bg-red-50 tw:transition-colors tw:border tw:border-red-300"
            @click="deleteImage"
          >
            <IconTrash :size="18" /> Delete Image
          </button>
        </template>

        <button
          class="tw:flex tw:items-center tw:justify-center tw:w-full tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:rounded-lg tw:cursor-pointer tw:hover:bg-sidebar tw:transition-colors tw:border-0"
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  </BaseDialog>
</template>
