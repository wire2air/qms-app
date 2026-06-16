<script setup>
import {
  IconFile,
  IconFileText,
  IconFileTypePdf,
  IconPhoto,
  IconCircleCheck,
  IconAlertCircle,
  IconTrash,
  IconX,
} from '@tabler/icons-vue'

const props = defineProps({
  state: {
    type: String,
    required: true,
    validator: (value) => ['uploaded', 'pending', 'uploading', 'success', 'error'].includes(value),
  },
  fileName: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  progress: {
    type: Number,
    default: 0,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  fileUrl: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['remove'])

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase()
  const iconMap = {
    pdf: { icon: IconFileTypePdf, class: 'tw:bg-red-50 tw:text-red-500' },
    doc: { icon: IconFileText, class: 'tw:bg-primary/10 tw:text-primary' },
    docx: { icon: IconFileText, class: 'tw:bg-primary/10 tw:text-primary' },
    png: { icon: IconPhoto, class: 'tw:bg-amber-50 tw:text-amber-500' },
    jpg: { icon: IconPhoto, class: 'tw:bg-amber-50 tw:text-amber-500' },
    jpeg: { icon: IconPhoto, class: 'tw:bg-amber-50 tw:text-amber-500' },
  }
  return iconMap[ext] || { icon: IconFile, class: 'tw:bg-primary/10 tw:text-primary' }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const containerClass = computed(() => {
  const base = 'tw:rounded-lg tw:border'
  const cursor = props.fileUrl ? ' tw:cursor-pointer' : ''
  switch (props.state) {
    case 'uploaded':
      return `${base} tw:border-good/20 tw:bg-good/10 tw:hover:bg-good/20 tw:transition-colors${cursor}`
    case 'success':
    case 'error':
      return `${base} tw:border-divider tw:bg-sidebar tw:hover:bg-primary/5 tw:transition-colors${cursor}`
    default:
      return `${base} tw:border-divider tw:bg-sidebar${cursor}`
  }
})

const statusBadge = computed(() => {
  switch (props.state) {
    case 'uploaded':
    case 'success':
      return {
        text: props.state === 'uploaded' ? 'Uploaded' : 'Success',
        icon: IconCircleCheck,
        class: 'tw:text-good',
      }
    case 'error':
      return { text: 'Failed', icon: IconAlertCircle, class: 'tw:text-bad' }
    default:
      return null
  }
})

const deleteIcon = computed(() => (props.state === 'uploading' ? IconX : IconTrash))

const showDeleteButton = computed(() => {
  if (props.readonly) return false
  if (props.state === 'uploaded' && props.disabled) return false
  return true
})

function handleClick() {
  if (props.fileUrl) window.open(props.fileUrl, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <BaseClickableRow
    :class="containerClass"
    :disabled="!fileUrl"
    :aria-label="fileUrl ? `Open ${fileName}` : fileName"
    @click.prevent.stop="handleClick"
  >
    <!-- Uploading State with Progress Bar -->
    <div v-if="state === 'uploading'" class="tw:flex tw:flex-col tw:gap-2 tw:p-3">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
        <div class="tw:flex tw:items-center tw:gap-3 tw:overflow-hidden">
          <div
            :class="getFileIcon(fileName).class"
            class="tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:w-8 tw:h-8 tw:rounded"
          >
            <component :is="getFileIcon(fileName).icon" :size="18" />
          </div>
          <div class="tw:flex tw:flex-col tw:overflow-hidden">
            <span
              class="tw:text-xs tw:font-medium tw:text-on-sidebar tw:truncate"
              :title="fileName"
            >
              {{ fileName }}
            </span>
            <span class="tw:text-[10px] tw:text-secondary">
              {{ formatFileSize(fileSize) }} • Uploading...
            </span>
          </div>
        </div>
        <BaseButton
          v-if="showDeleteButton"
          variant="transparent"
          size="xs"
          iconOnly
          @click.stop="emit('remove')"
        >
          <component :is="deleteIcon" :size="16" />
        </BaseButton>
      </div>
      <!-- Progress Bar -->
      <div class="tw:w-full tw:bg-primary/5 tw:rounded-full tw:h-1 tw:overflow-hidden">
        <div
          class="tw:bg-primary tw:h-full tw:rounded-full tw:transition-all tw:duration-300"
          :style="{ width: `${progress}%` }"
        />
      </div>
    </div>

    <!-- All Other States -->
    <div v-else class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:p-3">
      <div class="tw:flex tw:items-center tw:gap-3 tw:overflow-hidden">
        <div
          :class="getFileIcon(fileName).class"
          class="tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:w-8 tw:h-8 tw:rounded"
        >
          <component :is="getFileIcon(fileName).icon" :size="18" />
        </div>
        <div class="tw:flex tw:flex-col tw:overflow-hidden">
          <span class="tw:text-xs tw:font-medium tw:text-on-sidebar tw:truncate" :title="fileName">
            {{ fileName }}
          </span>
          <div class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:text-[10px] tw:text-secondary tw:font-medium">
              {{ formatFileSize(fileSize) }}
            </span>
            <span
              v-if="statusBadge"
              :class="statusBadge.class"
              class="tw:text-[8px] tw:uppercase tw:font-bold tw:flex tw:items-center tw:gap-0.5"
            >
              <component :is="statusBadge.icon" :size="10" />
              {{ statusBadge.text }}
            </span>
          </div>
        </div>
      </div>
      <BaseButton
        v-if="showDeleteButton"
        variant="transparent"
        size="xs"
        iconOnly
        @click.stop="emit('remove')"
      >
        <component :is="deleteIcon" :size="16" />
      </BaseButton>
    </div>
  </BaseClickableRow>
</template>
