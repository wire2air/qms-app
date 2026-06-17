<script setup>
import { IconUpload, IconX } from '@tabler/icons-vue'
import { uploadFile } from '@/utils/uploadService.js'
import { post } from '@/api'
import { useToast } from '@shared/composables/useToast.js'

const props = defineProps({
  request: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['submitted'])

const show = defineModel({ type: Boolean, default: false })

const toast = useToast()

const selectedFile = ref(null)
const uploadedAsset = ref(null)
const uploading = ref(false)
const submitting = ref(false)

watch(show, (val) => {
  if (val) {
    selectedFile.value = null
    uploadedAsset.value = null
    uploading.value = false
    submitting.value = false
  }
})

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (file) {
    selectedFile.value = file
  }
}

function removeFile() {
  selectedFile.value = null
  uploadedAsset.value = null
}

async function onUpload() {
  if (!selectedFile.value) return
  uploading.value = true
  try {
    uploadedAsset.value = await uploadFile(selectedFile.value, 'ASSET')
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Upload failed' })
  } finally {
    uploading.value = false
  }
}

async function onSubmit() {
  if (!uploadedAsset.value || !props.request) return

  submitting.value = true

  try {
    const result = await post(`/v1/services/assetRequests/${props.request.id}/submit`, {
      assetId: uploadedAsset.value.id,
    })

    if (result.error) {
      toast.notify({ type: 'negative', message: result.error })
    } else {
      toast.notify({ type: 'positive', message: 'Asset request submitted successfully' })
      show.value = false
      emit('submitted')
    }
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to submit' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Submit Asset Request" :persistent="true">
    <div class="tw:p-4 tw:space-y-4">
      <div v-if="request" class="tw:bg-main-hover tw:rounded-lg tw:p-3 tw:space-y-1">
        <p class="tw:text-sm tw:font-medium tw:text-on-main">{{ request.title }}</p>
      </div>

      <BaseField label="Upload Document">
        <div
          v-if="selectedFile"
          class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:border tw:border-divider tw:rounded-lg"
        >
          <span class="tw:text-sm tw:text-on-main tw:flex-1 tw:truncate">{{
            selectedFile.name
          }}</span>
          <BaseButton v-if="!uploadedAsset" variant="text" iconOnly size="xs" @click="removeFile">
            <IconX :size="14" />
          </BaseButton>
        </div>
        <div v-else>
          <label
            class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-primary tw:cursor-pointer tw:hover:underline"
          >
            <IconUpload :size="14" />
            Choose File
            <input
              type="file"
              accept="image/*,application/pdf,.docx,.doc,.xlsx,.xls,.csv"
              class="tw:hidden"
              @change="onFileChange"
            />
          </label>
        </div>
        <div v-if="selectedFile && !uploadedAsset" class="tw:mt-2">
          <BaseButton :disabled="uploading" size="sm" @click="onUpload">
            <BaseSpinner v-if="uploading" size="xs" color="white" />
            <span>{{ uploading ? 'Uploading...' : 'Upload' }}</span>
          </BaseButton>
        </div>
      </BaseField>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!uploadedAsset || submitting" @click="onSubmit">
        <BaseSpinner v-if="submitting" size="sm" color="white" />
        <span>{{ submitting ? 'Submitting...' : 'Submit' }}</span>
      </BaseButton>
    </div>
  </BaseDialog>
</template>
