<script setup>
/**
 * Documents tab on the admin Supplier detail page.
 *
 * One source of truth for files we have on file for this supplier:
 *  - rows with request_id set were collected via the asset_request flow
 *    (supplier uploaded through the portal / token link).
 *  - rows with request_id null are ad-hoc — the admin attached a file
 *    the supplier sent offline (email, in-person, etc).
 *
 * Both kinds live in supplier_assets. The badge in the right column makes
 * the source visible at a glance.
 */
import {
  IconFileDescription,
  IconExternalLink,
  IconUpload,
  IconTrash,
  IconPaperclip,
  IconClipboardList,
} from '@tabler/icons-vue'
import { upload } from '@/api' // Action RPC — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  supplier: {
    type: Object,
    required: true,
  },
})

const toast = useToast()
const { confirm } = useConfirm()
const canUpdate = computed(() => isAllowed(['suppliers:update']))

const supplierAssets = useLiveQueryWithDeps(
  [() => props.supplier?.id],
  async (db, [supplierId]) => {
    if (!supplierId) return []
    const rows = await db.SupplierAsset.where('supplierId', supplierId).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['SupplierAsset'], initial: [] },
)

const documents = useLiveQueryWithDeps(
  [() => supplierAssets.value],
  async (db, [assets]) => {
    if (!assets?.length) return []
    const results = await Promise.all(
      assets.map(async (sa) => {
        const asset = sa.assetId ? await db.Asset.findByPk(sa.assetId) : null
        return { row: sa, asset }
      }),
    )
    return results
  },
  { initial: [], models: ['SupplierAsset', 'Asset'] },
)

const typeLabel = {
  certificate: 'Certificate',
  license: 'License',
  OTHER: 'Other',
}

function displayTitle(d) {
  return d.row.title || d.asset?.originalFilename || d.asset?.filename || 'Document'
}

// ─── Upload dialog ────────────────────────────────────────────────────
const showUpload = ref(false)
const uploadForm = ref({ title: '', description: '', documentType: 'OTHER', file: null })
const uploading = ref(false)
const fileInput = ref(null)

function openUpload() {
  if (!canUpdate.value) return
  uploadForm.value = { title: '', description: '', documentType: 'OTHER', file: null }
  showUpload.value = true
}

function pickFile() {
  fileInput.value?.click()
}
function onFile(e) {
  uploadForm.value.file = e.target.files?.[0] || null
}

async function submitUpload() {
  if (uploading.value) return
  if (!uploadForm.value.file) {
    toast.error('Pick a file first')
    return
  }
  if (!uploadForm.value.title.trim()) {
    toast.error('Title is required')
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', uploadForm.value.file)
    fd.append('title', uploadForm.value.title.trim())
    if (uploadForm.value.description.trim()) {
      fd.append('description', uploadForm.value.description.trim())
    }
    fd.append('documentType', uploadForm.value.documentType || 'OTHER')
    await upload(`/v1/services/suppliers/${props.supplier.id}/documents`, fd)
    toast.success('Document uploaded')
    showUpload.value = false
  } catch (err) {
    toast.error(err?.message || 'Upload failed')
  } finally {
    uploading.value = false
  }
}

async function removeDoc(d) {
  if (!canUpdate.value) return
  if (
    !(await confirm({
      title: 'Remove document',
      message: `Remove "${displayTitle(d)}" from this supplier?`,
      okLabel: 'Remove',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await d.row.delete()
    toast.success('Removed')
  } catch (err) {
    toast.error(err?.message || 'Failed to remove')
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} bytes`
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between tw:gap-3"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconFileDescription :size="20" class="tw:text-secondary" />
        </div>
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Documents</h3>
        <span
          v-if="documents.length"
          class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-gray-200 tw:text-gray-700 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-bold"
          >{{ documents.length }}</span
        >
      </div>
      <BaseButton v-if="canUpdate" variant="primary" size="sm" @click="openUpload">
        <IconUpload :size="14" />
        Upload document
      </BaseButton>
    </div>

    <div v-if="documents.length" class="tw:divide-y tw:divide-divider">
      <div
        v-for="d in documents"
        :key="d.row.id"
        class="tw:p-4 tw:flex tw:items-center tw:gap-4 tw:hover:bg-main-hover tw:transition-colors"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconFileDescription :size="20" class="tw:text-primary" />
        </div>
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <p class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
              {{ displayTitle(d) }}
            </p>
            <span
              v-if="d.row.requestId"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:rounded tw:bg-blue-50 tw:text-blue-700 tw:px-1.5 tw:py-0.5"
            >
              <IconClipboardList :size="10" />
              via request
            </span>
            <span
              v-else
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:rounded tw:bg-amber-50 tw:text-amber-700 tw:px-1.5 tw:py-0.5"
            >
              <IconPaperclip :size="10" />
              ad-hoc
            </span>
          </div>
          <p v-if="d.row.description" class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ d.row.description }}
          </p>
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ typeLabel[d.row.documentType] || d.row.documentType }}
            <span v-if="d.asset?.fileSize" class="tw:ml-1"
              >· {{ formatSize(d.asset.fileSize) }}</span
            >
            <span v-if="d.row.createdAt" class="tw:ml-1">
              · added {{ d.row.createdAt.toRelative?.() }}
            </span>
          </p>
        </div>
        <a
          v-if="d.asset?.url"
          :href="d.asset.url"
          target="_blank"
          class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-primary tw:transition-colors"
          title="Open document"
        >
          <IconExternalLink :size="16" />
        </a>
        <button
          v-if="canUpdate"
          class="tw:p-1 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
          title="Remove document"
          @click="removeDoc(d)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </div>

    <BaseEmptyState
      v-else
      :icon="IconFileDescription"
      title="No documents on file for this supplier."
      description="Upload one directly, or request it through the Asset Requests tab."
    />

    <!-- Ad-hoc upload dialog -->
    <BaseDialog v-model="showUpload" title="Upload supplier document" size="md">
      <div class="tw:p-4 tw:flex tw:flex-col tw:gap-3">
        <BaseField v-slot="{ id: fieldId }" label="Title" required>
          <BaseTextInput :id="fieldId" v-model="uploadForm.title" placeholder="e.g. ISO 9001 Certificate" />
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="Description" optional>
          <BaseTextarea
            :id="fieldId"
            v-model="uploadForm.description"
            :rows="2"
            placeholder="What is this document, what does it cover, when was it issued?"
          />
        </BaseField>
        <BaseField label="File" required>
          <BaseClickableRow
            v-if="!uploadForm.file"
            class="tw:border-2 tw:border-dashed tw:border-divider tw:rounded-lg tw:p-6 tw:text-center tw:hover:border-primary tw:transition-colors"
            aria-label="Select a file to upload"
            @click="pickFile"
          >
            <IconUpload :size="28" class="tw:text-secondary tw:mx-auto" />
            <p class="tw:text-xs tw:text-secondary tw:mt-1">Click to select a file</p>
          </BaseClickableRow>
          <div
            v-else
            class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:flex tw:items-center tw:gap-3"
          >
            <IconFileDescription :size="24" class="tw:text-primary" />
            <div class="tw:flex-1 tw:min-w-0">
              <div class="tw:text-sm tw:text-on-main tw:truncate">{{ uploadForm.file.name }}</div>
              <div class="tw:text-xs tw:text-secondary">{{ formatSize(uploadForm.file.size) }}</div>
            </div>
            <button
              class="tw:text-xs tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="uploadForm.file = null"
            >
              Remove
            </button>
          </div>
          <input
            ref="fileInput"
            type="file"
            class="tw:hidden"
            accept="image/*,application/pdf,.docx,.doc,.xlsx,.xls,.csv"
            @change="onFile"
          />
        </BaseField>
      </div>
      <template #footer>
        <BaseDialogFooter
          submitLabel="Upload"
          :loading="uploading"
          @cancel="showUpload = false"
          @submit="submitUpload"
        />
      </template>
    </BaseDialog>
  </div>
</template>
