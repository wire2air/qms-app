<script setup>
import {
  IconAlertCircle,
  IconCircleCheck,
  IconClock,
  IconUpload,
  IconRefresh,
  IconFileText,
  IconCircleMinus,
} from '@tabler/icons-vue'
import { get, upload } from '@/api'

const route = useRoute()
const token = route.params.token

const assetRequest = ref(null)
const loading = ref(true)
const error = ref(null)
const expired = ref(false)

// Per-item upload state — keyed by item id.
const itemStatus = ref({}) // { [itemId]: 'idle' | 'uploading' | 'received' | 'error' }
const itemError = ref({})

async function fetchAssetRequest() {
  try {
    const data = await get(`/v1/services/public/assetRequests/${token}`, {
      loader: loading,
      showError: false,
    })
    assetRequest.value = data.assetRequest
  } catch {
    expired.value = true
  }
}

// Items from the multi-item bundle flow (Phase C). Legacy single-doc
// requests have items: [] -- the fallback single-file form below still
// applies for those.
const items = computed(() => assetRequest.value?.items ?? [])
const isBundle = computed(() => items.value.length > 0)

function labelFor(item) {
  return item.assetRequestType?.name || item.customTitle || 'Document'
}
function descFor(item) {
  return item.assetRequestType?.description || item.customDescription || ''
}

function effectiveStatus(item) {
  return itemStatus.value[item.id] || (item.statusId === 'RECEIVED' ? 'received' : 'idle')
}

async function uploadForItem(item, event) {
  const file = event.target.files?.[0]
  if (!file) return
  itemStatus.value = { ...itemStatus.value, [item.id]: 'uploading' }
  itemError.value = { ...itemError.value, [item.id]: null }
  try {
    const fd = new FormData()
    fd.append('file', file)
    await upload(`/v1/services/public/assetRequests/${token}/items/${item.id}/upload`, fd, {
      showError: false,
    })
    itemStatus.value = { ...itemStatus.value, [item.id]: 'received' }
  } catch (err) {
    itemStatus.value = { ...itemStatus.value, [item.id]: 'error' }
    itemError.value = {
      ...itemError.value,
      [item.id]: err?.response?.data?.error || err?.message || 'Upload failed',
    }
  } finally {
    // Reset the input so picking the same filename again still triggers @change.
    if (event.target) event.target.value = ''
  }
}

// ── Legacy single-file flow (only used when items[] is empty) ──
const selectedFile = ref(null)
const submitting = ref(false)
const success = ref(false)
const uploadProgress = ref(0)

function onFileSelect(e) {
  selectedFile.value = e.target.files?.[0] || null
}
function removeFile() {
  selectedFile.value = null
  uploadProgress.value = 0
}
async function onSubmitLegacy() {
  if (!selectedFile.value) return
  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('file', selectedFile.value)
    fd.append('fileType', 'ASSET')
    await upload(`/v1/services/public/assetRequests/${token}/upload`, fd, {
      showError: false,
      onUpload: (p) => {
        uploadProgress.value = Math.round((p.loaded * 100) / (p.total || 1))
      },
    })
    success.value = true
  } catch (err) {
    if (err.response?.status === 410) expired.value = true
    else error.value = err.response?.data?.error || err.message
  } finally {
    submitting.value = false
  }
}

function formatFileSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} bytes`
}

onMounted(() => {
  if (token) fetchAssetRequest()
  else {
    error.value = 'Invalid link'
    loading.value = false
  }
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:min-h-screen tw:bg-main">
    <div class="tw:flex-1 tw:flex tw:items-center tw:justify-center">
      <div class="tw:w-full tw:max-w-3xl tw:bg-sidebar tw:rounded-lg tw:shadow-lg tw:p-6 tw:m-4">
        <!-- Loading -->
        <div v-if="loading" class="tw:text-center tw:py-16">
          <BaseSpinner size="lg" class="tw:mx-auto" />
          <div class="tw:text-secondary tw:mt-4">Loading...</div>
        </div>

        <!-- Expired -->
        <div v-else-if="expired" class="tw:text-center tw:py-16">
          <IconClock :size="64" class="tw:text-warning tw:mx-auto" />
          <div class="tw:text-2xl tw:mt-4 tw:text-on-sidebar">Link Expired</div>
          <p class="tw:text-secondary tw:mt-2">
            This link has expired or has already been used.
          </p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="tw:text-center tw:py-16">
          <IconAlertCircle :size="64" class="tw:text-bad tw:mx-auto" />
          <div class="tw:text-xl tw:mt-4 tw:text-bad">{{ error }}</div>
        </div>

        <!-- Legacy single-file success -->
        <div v-else-if="success" class="tw:text-center tw:py-16">
          <IconCircleCheck :size="64" class="tw:text-good tw:mx-auto" />
          <div class="tw:text-2xl tw:mt-4 tw:text-good">Document Submitted!</div>
          <p class="tw:text-secondary tw:mt-2">Thank you.</p>
        </div>

        <!-- Loaded -->
        <div v-else-if="assetRequest">
          <div class="tw:text-2xl tw:font-bold tw:mb-2 tw:text-center tw:text-on-sidebar">
            Document Request
          </div>
          <p class="tw:text-center tw:text-secondary tw:mb-6">
            {{
              isBundle
                ? 'Please upload each of the requested documents below.'
                : 'Please upload the requested document below.'
            }}
          </p>

          <!-- Request details -->
          <div class="tw:bg-main tw:rounded-lg tw:p-4 tw:mb-6">
            <div class="tw:space-y-2 tw:text-sm">
              <div class="tw:flex tw:gap-2">
                <span class="tw:text-secondary tw:w-24 tw:shrink-0">Title</span>
                <span class="tw:text-on-sidebar tw:font-medium">{{ assetRequest.title }}</span>
              </div>
              <div v-if="assetRequest.description" class="tw:flex tw:gap-2">
                <span class="tw:text-secondary tw:w-24 tw:shrink-0">Description</span>
                <span class="tw:text-on-sidebar">{{ assetRequest.description }}</span>
              </div>
              <div v-if="assetRequest.dueDate" class="tw:flex tw:gap-2">
                <span class="tw:text-secondary tw:w-24 tw:shrink-0">Due Date</span>
                <span class="tw:text-on-sidebar">{{ assetRequest.dueDate }}</span>
              </div>
            </div>
          </div>

          <!-- Phase C: per-item table -->
          <div v-if="isBundle" class="tw:bg-main tw:rounded-lg tw:overflow-hidden">
            <table class="tw:w-full tw:text-sm">
              <thead class="tw:bg-card tw:text-secondary tw:text-xs tw:uppercase">
                <tr>
                  <th class="tw:text-left tw:px-4 tw:py-2">Document</th>
                  <th class="tw:text-right tw:px-4 tw:py-2 tw:w-44">Upload</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in items"
                  :key="item.id"
                  class="tw:border-t tw:border-divider"
                  :class="
                    item.statusId === 'SKIPPED' || effectiveStatus(item) === 'received'
                      ? 'tw:opacity-70'
                      : ''
                  "
                >
                  <td class="tw:px-4 tw:py-3">
                    <div class="tw:flex tw:items-start tw:gap-2">
                      <IconCircleCheck
                        v-if="effectiveStatus(item) === 'received'"
                        :size="16"
                        class="tw:text-good tw:mt-0.5"
                      />
                      <IconCircleMinus
                        v-else-if="item.statusId === 'SKIPPED'"
                        :size="16"
                        class="tw:text-secondary tw:mt-0.5"
                      />
                      <IconFileText v-else :size="16" class="tw:text-primary tw:mt-0.5" />
                      <div>
                        <div class="tw:text-on-sidebar tw:font-medium">{{ labelFor(item) }}</div>
                        <div v-if="descFor(item)" class="tw:text-xs tw:text-secondary tw:mt-0.5">
                          {{ descFor(item) }}
                        </div>
                        <div
                          v-if="itemError[item.id]"
                          class="tw:text-xs tw:text-bad tw:mt-0.5"
                        >
                          {{ itemError[item.id] }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="tw:px-4 tw:py-3 tw:text-right">
                    <div
                      v-if="effectiveStatus(item) === 'received'"
                      class="tw:inline-flex tw:items-center tw:gap-2 tw:justify-end"
                    >
                      <span
                        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:rounded tw:bg-green-100 tw:text-green-700 tw:px-2 tw:py-1"
                      >
                        <IconCircleCheck :size="12" />
                        Received
                      </span>
                      <label
                        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:border tw:border-divider tw:bg-sidebar tw:text-on-sidebar tw:text-xs tw:px-2 tw:py-1 tw:cursor-pointer tw:hover:bg-main"
                      >
                        <IconRefresh :size="12" />
                        Replace
                        <input
                          type="file"
                          class="tw:hidden"
                          accept="image/*,application/pdf,.docx,.doc,.xlsx,.xls,.csv"
                          @change="uploadForItem(item, $event)"
                        />
                      </label>
                    </div>
                    <span
                      v-else-if="item.statusId === 'SKIPPED'"
                      class="tw:text-xs tw:text-secondary tw:italic"
                    >
                      Skipped
                    </span>
                    <label
                      v-else
                      class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-primary tw:text-white tw:text-xs tw:px-3 tw:py-1.5 tw:cursor-pointer tw:hover:opacity-90"
                      :class="effectiveStatus(item) === 'uploading' ? 'tw:opacity-60 tw:cursor-wait' : ''"
                    >
                      <IconUpload :size="12" />
                      {{ effectiveStatus(item) === 'uploading' ? 'Uploading…' : 'Upload' }}
                      <input
                        type="file"
                        class="tw:hidden"
                        :disabled="effectiveStatus(item) === 'uploading'"
                        accept="image/*,application/pdf,.docx,.doc,.xlsx,.xls,.csv"
                        @change="uploadForItem(item, $event)"
                      />
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Legacy single-file flow (used when items[] is empty) -->
          <div v-else>
            <label class="tw:block tw:text-sm tw:font-medium tw:text-on-sidebar tw:mb-2">
              Upload Document *
            </label>
            <BaseClickableRow
              v-if="!selectedFile"
              class="tw:border-2 tw:border-dashed tw:border-gray-300 tw:rounded-lg tw:p-8 tw:text-center tw:hover:border-primary"
              aria-label="Select a file to upload"
              @click="$refs.legacyFileInput.click()"
            >
              <IconUpload :size="48" class="tw:text-secondary tw:mx-auto" />
              <p class="tw:text-secondary tw:mt-2">Click to select a file</p>
            </BaseClickableRow>
            <div
              v-else
              class="tw:border tw:rounded-lg tw:p-4 tw:flex tw:items-center tw:gap-3"
            >
              <IconFileText :size="32" class="tw:text-primary" />
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:text-on-sidebar tw:truncate">{{ selectedFile.name }}</div>
                <div class="tw:text-xs tw:text-secondary">
                  {{ formatFileSize(selectedFile.size) }}
                </div>
              </div>
              <button
                class="tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
                :disabled="submitting"
                @click="removeFile"
              >
                Remove
              </button>
            </div>
            <input
              ref="legacyFileInput"
              type="file"
              class="tw:hidden"
              accept="image/*,application/pdf,.docx,.doc,.xlsx,.xls,.csv"
              @change="onFileSelect"
            />
            <div
              v-if="submitting"
              class="tw:mt-2 tw:h-1.5 tw:bg-gray-200 tw:rounded-full tw:overflow-hidden"
            >
              <div
                class="tw:h-full tw:bg-primary tw:rounded-full tw:transition-all"
                :style="{ width: uploadProgress + '%' }"
              />
            </div>
            <div class="tw:flex tw:justify-end tw:mt-4">
              <button
                class="tw:py-2.5 tw:px-6 tw:rounded-lg tw:bg-primary tw:text-white tw:text-sm tw:cursor-pointer tw:border-0 disabled:tw:opacity-50"
                :disabled="submitting || !selectedFile"
                @click="onSubmitLegacy"
              >
                {{ submitting ? 'Submitting…' : 'Submit Document' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: empty
</route>
