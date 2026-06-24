<script setup>
import { IconPaperclip, IconTrash, IconFile } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { upload } from '@/api'

const props = defineProps({
  complaintId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const toast = useToast()

const attachments = useLiveQueryWithDeps(
  [() => props.complaintId],
  async (db, [complaintId]) => {
    if (!complaintId) return []
    return db.CustomerComplaintAttachment.where('complaintId', complaintId).exec()
  },

  { models: ['CustomerComplaintAttachment'], initial: [] },
)

// Batch-resolve the assets behind the attachment rows.
const assetIdList = computed(() =>
  attachments.value
    .map((a) => a.assetId)
    .filter(Boolean)
    .join(','),
)
const assetsById = useLiveQueryWithDeps(
  [() => assetIdList.value],
  async (db, [csv]) => {
    if (!csv) return {}
    const wanted = new Set(csv.split(',').filter(Boolean))
    const rows = await db.Asset.where().exec()
    const map = {}
    for (const a of rows) if (wanted.has(a.id)) map[a.id] = a
    return map
  },

  { models: ['Asset'], initial: {} },
)

const uploading = ref(false)
const fileInputRef = ref(null)

function onPickFiles() {
  fileInputRef.value?.click()
}

async function onFilesSelected(event) {
  const files = [...(event.target.files ?? [])]
  event.target.value = ''
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      await upload(`/v1/services/customerComplaints/${props.complaintId}/attachments`, formData)
    }
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to upload file' })
  } finally {
    uploading.value = false
  }
}

async function handleDelete(attachment) {
  try {
    await attachment.delete()
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to remove attachment' })
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <BaseCard>
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <BaseText variant="overline">Attachments</BaseText>
      <BaseButton
        v-if="canUpdate"
        variant="outline"
        size="sm"
        :disabled="uploading"
        @click="onPickFiles"
      >
        <IconPaperclip :size="16" class="tw:mr-1" />
        {{ uploading ? 'Uploading…' : 'Add files' }}
      </BaseButton>
      <input ref="fileInputRef" type="file" multiple class="tw:hidden" @change="onFilesSelected" />
    </div>

    <div v-if="attachments.length" class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
      >
        <a
          v-if="assetsById[attachment.assetId]?.url"
          :href="assetsById[attachment.assetId].url"
          target="_blank"
          rel="noopener noreferrer"
          class="tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:text-on-main tw:hover:text-primary"
        >
          <IconFile :size="16" class="tw:shrink-0 tw:text-secondary" />
          <span class="tw:text-sm tw:font-medium tw:truncate">
            {{
              assetsById[attachment.assetId]?.originalFilename ||
              assetsById[attachment.assetId]?.filename
            }}
          </span>
          <span class="tw:text-xs tw:text-secondary tw:shrink-0">
            {{ formatSize(assetsById[attachment.assetId]?.fileSize) }}
          </span>
        </a>
        <span v-else class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
          <IconFile :size="16" />
          Loading…
        </span>
        <button
          v-if="canUpdate"
          class="tw:text-secondary tw:hover:text-red-600 tw:shrink-0 tw:ml-2"
          @click="handleDelete(attachment)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">No attachments.</div>
  </BaseCard>
</template>
