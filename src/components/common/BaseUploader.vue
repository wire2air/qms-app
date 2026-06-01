<script setup>
import { uploadFile } from '@/utils/uploadService.js'
import { IconCloudUpload } from '@tabler/icons-vue'

const props = defineProps({
  fileType: {
    type: String,
    default: 'ASSET',
    validator: (value) =>
      ['COMPANYLOGO', 'USERAVATAR', 'EDITORIMAGE', 'ASSET', 'OPEN'].includes(value),
  },
  accept: {
    type: String,
    default: 'image/*,video/*,application/pdf,.docx,.doc',
  },
  label: {
    type: String,
    default: 'Supporting Documents',
  },
  maxSize: {
    type: Number,
    default: 100 * 1024 * 1024, // 100 MB
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: true,
  },
  required: {
    type: Boolean,
    default: false,
  },
  hideHeader: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['uploaded', 'error', 'cancel'])

// v-model for uploaded files only
const uploadedFiles = defineModel({ type: Array, default: () => [] })

const toast = useToast()

const isDragging = ref(false)
const fileInputRef = ref(null)
// files holds all selected files (pending, uploading, success, error)
const files = ref([])

const formattedMaxSize = computed(() => {
  const size = props.maxSize
  const kb = 1024
  const mb = kb * 1024
  const gb = mb * 1024

  if (size >= gb) {
    return `${(size / gb).toFixed(2)} GB`
  } else if (size >= mb) {
    return `${(size / mb).toFixed(0)} MB`
  } else if (size >= kb) {
    return `${(size / kb).toFixed(0)} KB`
  } else {
    return `${size} bytes`
  }
})

function handleClick() {
  if (props.disabled) return
  fileInputRef.value?.click()
}

function handleFileSelect(event) {
  const selectedFiles = event.target.files
  if (selectedFiles && selectedFiles.length > 0) {
    handleFiles(selectedFiles)
  }
}

function handleDragEnter(event) {
  event.preventDefault()
  if (props.disabled || props.readonly) return
  isDragging.value = true
}

function handleDragLeave(event) {
  event.preventDefault()
  isDragging.value = false
}

function handleDragOver(event) {
  event.preventDefault()
}

function handleDrop(event) {
  event.preventDefault()
  isDragging.value = false

  if (props.disabled || props.readonly) return

  const droppedFiles = event.dataTransfer.files
  if (droppedFiles && droppedFiles.length > 0) {
    handleFiles(droppedFiles)
  }
}

function handleFiles(fileList) {
  const newFiles = props.multiple ? Array.from(fileList) : [fileList[0]]

  if (props.multiple !== true) {
    files.value = [] // Clear existing files if not allowing multiple
    uploadedFiles.value = [] // Clear uploaded files in v-model as well
  }

  for (const file of newFiles) {
    // Validate file size
    if (file.size > props.maxSize) {
      toast.error(`File "${file.name}" exceeds maximum allowed size of ${formattedMaxSize.value}`)
      emit('error', new Error(`File too large: ${file.name}`))
      continue
    }

    files.value.push({
      file,
      name: file.name,
      size: file.size,
      status: 'pending', // pending, uploading, success, error
      progress: 0,
      error: null,
    })
  }

  // Reset file input
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

async function uploadAllFiles() {
  if (files.value?.length === 0) {
    return
  }

  const pendingFiles = files.value.filter((f) => f.status === 'pending')

  if (pendingFiles?.length === 0) {
    return
  }

  // Set all pending files to uploading state
  pendingFiles.forEach((fileObj) => {
    fileObj.status = 'uploading'
    fileObj.progress = 0
  })

  // Create upload promises for each file
  const uploadPromises = pendingFiles.map((fileObj) => {
    return uploadFile(fileObj.file, props.fileType, ({ progress, status, error }) => {
      fileObj.progress = progress || 0
      if (status) {
        fileObj.status = status
      }
      if (error) {
        fileObj.error = error
      }
    })
      .then((asset) => {
        fileObj.status = 'success'
        fileObj.progress = 100
        fileObj.asset = asset
        return { success: true, asset, fileObj }
      })
      .catch((error) => {
        fileObj.status = 'error'
        fileObj.error = error.message
        emit('error', { file: fileObj.name, error: error.message })
        return { success: false, error: error.message, fileObj }
      })
  })

  // Wait for all uploads to complete
  const results = await Promise.all(uploadPromises)

  // Separate successful and failed uploads
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  if (successful.length > 0) {
    // Update v-model with successfully uploaded files
    const newUploadedAssets = successful.map((r) => r.asset)
    uploadedFiles.value = [...(uploadedFiles.value ?? []), ...newUploadedAssets]

    // Remove successfully uploaded files from pending list
    const successfulFileObjs = successful.map((r) => r.fileObj)
    files.value = files.value.filter((f) => !successfulFileObjs.includes(f))

    // Emit uploaded event for each file
    successful.forEach((r) => {
      emit('uploaded', r.asset)
    })

    toast.success(`${successful.length} file(s) uploaded successfully`)
  }

  if (failed.length > 0) {
    toast.error(`${failed.length} file(s) failed to upload`)
  }
}

function removeFile(index) {
  const fileObj = files.value[index]

  // If the file was successfully uploaded, remove it from v-model too
  if (fileObj.status === 'success' && fileObj.asset) {
    uploadedFiles.value = uploadedFiles.value.filter((asset) => asset.id !== fileObj.asset.id)
  }

  files.value.splice(index, 1)
}

function removeUploadedFile(assetId) {
  uploadedFiles.value = uploadedFiles.value.filter((asset) => asset.id !== assetId)
}

function clearAll() {
  // Only clear the selected files list, don't touch uploaded files in v-model
  files.value = []
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function handleCancel() {
  clearAll()
  emit('cancel')
}

// Expose methods for manual upload
defineExpose({
  uploadAllFiles,
  clearAll,
  removeFile,
  removeUploadedFile,
})
</script>

<template>
  <!-- Main Container -->
  <div
    class="tw:w-full tw:bg-sidebar tw:shadow-sm tw:border tw:border-divider tw:rounded-xl tw:overflow-hidden"
  >
    <!-- Header -->
    <div
      v-if="!hideHeader"
      class="tw:bg-main-hover tw:px-5 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:justify-between"
    >
      <h3 class="ds-label tw:text-on-sidebar">
        {{ label }} <span v-if="required" class="tw:text-bad">*</span>
      </h3>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span
          v-if="uploadedFiles?.length > 0"
          class="tw:text-[10px] tw:font-medium tw:bg-good/10 tw:text-good tw:px-2 tw:py-0.5 tw:rounded-full"
        >
          {{ uploadedFiles?.length }} Uploaded
        </span>
        <span
          v-if="files?.length > 0"
          class="tw:text-[10px] tw:font-medium tw:bg-primary/10 tw:text-primary tw:px-2 tw:py-0.5 tw:rounded-full"
        >
          {{ files?.length }} Pending
        </span>
      </div>
    </div>

    <div v-if="readonly && uploadedFiles?.length === 0">
      <div class="tw:p-5 tw:text-center tw:text-secondary tw:bg-primary/5 tw:rounded-2xl">
        No files to display.
      </div>
    </div>

    <!-- Already-uploaded files (from v-model) — rendered above the dropzone
         so users see what's already attached before they add more. -->
    <div v-if="uploadedFiles?.length > 0" class="tw:px-5 tw:pt-5 tw:pb-3 tw:space-y-2">
      <div class="ds-label-sm tw:text-secondary tw:mb-2">Uploaded Files</div>
      <BaseFileItem
        v-for="asset in uploadedFiles"
        :key="asset.id"
        state="uploaded"
        :fileName="asset.filename || asset.name || 'Uploaded File'"
        :fileSize="asset.fileSize || 0"
        :fileUrl="asset.url"
        :readonly="readonly"
        :disabled="disabled"
        @remove="removeUploadedFile(asset.id)"
      />
    </div>

    <!-- Compact Dropzone -->
    <div v-if="!readonly" class="tw:p-5">
      <div
        class="group tw:relative tw:flex tw:flex-col tw:items-center tw:justify-center tw:w-full tw:h-32 tw:border-2 tw:border-dashed tw:rounded-lg tw:transition-all tw:cursor-pointer"
        :class="{
          'tw:border-divider tw:bg-primary/5 tw:hover:border-primary/50 tw:hover:bg-primary/5':
            !isDragging,
          'tw:border-primary tw:bg-primary/10': isDragging,
          'tw:opacity-50 tw:cursor-not-allowed': disabled,
        }"
        @click="handleClick"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @dragover="handleDragOver"
        @drop="handleDrop"
      >
        <input
          ref="fileInputRef"
          type="file"
          :accept="accept"
          :multiple="multiple"
          :disabled="disabled || readonly"
          class="tw:absolute tw:inset-0 tw:w-full tw:h-full tw:opacity-0 tw:cursor-pointer"
          @click.stop
          @change="handleFileSelect"
        />

        <div class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:pt-2 tw:pb-3">
          <IconCloudUpload
            :size="32"
            class="tw:text-primary tw:mb-2 tw:opacity-80 tw:group-hover:scale-110 tw:transition-transform"
          />
          <p class="tw:mb-1 tw:text-sm tw:text-on-main tw:font-medium">
            Drop files here or
            <span class="tw:text-primary tw:hover:underline">browse</span>
          </p>
          <p class="tw:text-[11px] tw:text-secondary">
            {{
              accept
                .split(',')
                .map((ext) => ext.trim().toUpperCase())
                .join(', ')
            }}
            (Max. {{ formattedMaxSize }})
          </p>
        </div>
      </div>
    </div>

    <!-- Pending files (just dropped, uploading) — stay below the dropzone
         since they're its transient queue. -->
    <div
      v-if="files?.length > 0"
      class="tw:space-y-3 tw:max-h-96 tw:overflow-y-auto tw:px-5 tw:pb-5"
    >
      <div class="ds-label-sm tw:text-secondary tw:mb-2">Pending Files</div>
      <BaseFileItem
        v-for="(fileObj, index) in files"
        :key="index"
        :state="fileObj.status"
        :fileName="fileObj.name"
        :fileSize="fileObj.size"
        :progress="fileObj.progress"
        :readonly="readonly"
        :disabled="disabled"
        @remove="removeFile(index)"
      />
    </div>

    <!-- Footer Action -->
    <div
      v-if="files?.length > 0"
      class="tw:px-5 tw:py-3 tw:bg-primary/5 tw:border-t tw:border-divider tw:flex tw:justify-end tw:gap-2"
    >
      <BaseButton
        variant="secondary"
        :disabled="files.some((f) => f.status === 'uploading')"
        @click="handleCancel"
      >
        Cancel
      </BaseButton>
      <BaseButton
        variant="primary"
        :disabled="files?.length === 0 || files.some((f) => f.status === 'uploading')"
        @click="uploadAllFiles"
      >
        Finalize Upload
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
/* Minimal scoped styles only for functionality that can't be achieved with Tailwind */
input[type='file'] {
  position: absolute;
  color: rgba(0, 0, 0, 0);
}
</style>
