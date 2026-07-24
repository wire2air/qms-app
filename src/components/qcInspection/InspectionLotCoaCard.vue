<script setup>
/**
 * Certificate of Analysis (COA) capture for an incoming inspection lot — the #1
 * IQC record most audits expect. Holds the COA-received flag + attached COA
 * document(s). Files are uploaded via the generic asset service and their refs
 * stored in the lot's `coaAttachments` JSONB (PATCH), so no dedicated endpoint
 * is needed. Uploading a COA implies it was received.
 */
import { IconPaperclip, IconTrash, IconFile } from '@tabler/icons-vue'
import { patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { uploadFile } from '@/utils/uploadService.js'

const props = defineProps({
  lotId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})
const toast = useToast()

const lot = useLiveQueryWithDeps(
  [() => props.lotId],
  async (db, [id]) => (id ? db.InspectionLot.findByPk(id) : null),
  { models: ['InspectionLot'] },
)
const attachments = computed(() =>
  Array.isArray(lot.value?.coaAttachments) ? lot.value.coaAttachments : [],
)

// Batch-resolve the assets behind the stored refs.
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
function onPick() {
  fileInputRef.value?.click()
}

async function persist(body) {
  await patch(`/v1/services/qcInspection/lots/${props.lotId}`, body)
}

async function onFilesSelected(e) {
  const files = [...(e.target.files ?? [])]
  e.target.value = ''
  if (!files.length) return
  uploading.value = true
  try {
    const added = []
    for (const file of files) {
      const asset = await uploadFile(file, 'ASSET')
      added.push({
        assetId: asset.id,
        name: asset.originalFilename || asset.filename,
        mimeType: asset.mimeType,
      })
    }
    // Attaching a COA implies it was received.
    await persist({ coaAttachments: [...attachments.value, ...added], coaReceived: true })
  } catch (err) {
    toast.error(err?.message || 'Failed to upload COA')
  } finally {
    uploading.value = false
  }
}

async function removeOne(assetId) {
  try {
    await persist({ coaAttachments: attachments.value.filter((a) => a.assetId !== assetId) })
  } catch (err) {
    toast.error(err?.message || 'Failed to remove COA')
  }
}

async function toggleReceived(val) {
  try {
    await persist({ coaReceived: val })
  } catch (err) {
    toast.error(err?.message || 'Failed to update')
  }
}
</script>

<template>
  <BaseCard>
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseText variant="overline">Certificate of Analysis</BaseText>
        <BaseBadge
          :class="
            lot?.coaReceived
              ? 'tw:bg-green-100 tw:text-green-700'
              : 'tw:bg-amber-100 tw:text-amber-700'
          "
        >
          {{ lot?.coaReceived ? 'Received' : 'Not received' }}
        </BaseBadge>
      </div>
      <BaseButton v-if="canUpdate" variant="outline" size="sm" :disabled="uploading" @click="onPick">
        <IconPaperclip :size="16" class="tw:mr-1" />
        {{ uploading ? 'Uploading…' : 'Add COA' }}
      </BaseButton>
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept=".pdf,image/*"
        class="tw:hidden"
        @change="onFilesSelected"
      />
    </div>

    <BaseCheckbox
      v-if="canUpdate"
      :modelValue="!!lot?.coaReceived"
      class="tw:mb-3"
      @update:modelValue="toggleReceived"
    >
      COA received from supplier
    </BaseCheckbox>

    <div v-if="attachments.length" class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="att in attachments"
        :key="att.assetId"
        class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
      >
        <a
          v-if="assetsById[att.assetId]?.url"
          :href="assetsById[att.assetId].url"
          target="_blank"
          rel="noopener noreferrer"
          class="tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:text-on-main tw:hover:text-primary"
        >
          <IconFile :size="16" class="tw:shrink-0 tw:text-secondary" />
          <span class="tw:text-sm tw:font-medium tw:truncate">{{ att.name || 'COA document' }}</span>
        </a>
        <span v-else class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
          <IconFile :size="16" />
          {{ att.name || 'COA document' }}
        </span>
        <button
          v-if="canUpdate"
          class="tw:text-secondary tw:hover:text-red-600 tw:shrink-0 tw:ml-2"
          @click="removeOne(att.assetId)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">No COA attached.</div>
  </BaseCard>
</template>
