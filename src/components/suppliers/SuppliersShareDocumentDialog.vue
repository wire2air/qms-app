<script setup>
const props = defineProps({
  supplierId: {
    type: String,
    required: true,
  },
})

const open = defineModel({
  type: Boolean,
  default: false,
})

const sharedDocs = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    const sds = await db.SupplierDocument.where('supplierId', supplierId).exec()
    return Promise.all(
      sds.map(async (sd) => {
        const version = await db.DocumentVersion.findByPk(sd.documentVersionId)
        const document = version ? await db.Document.findByPk(version.documentId) : null
        return { sd, version, document }
      }),
    )
  },

  { models: ['SupplierDocument', 'DocumentVersion', 'Document'], initial: [] },
)

// Only EFFECTIVE versions are shareable with suppliers — drafts /
// under-review / superseded versions are work-in-progress or historical
// and must never leak out as the controlled artifact. Replaces the
// previous `isLatest` filter, which could surface a draft simply
// because it was the newest revision.
const allLatestVersions = useLiveQuery(
  async (db) => {
    const versions = await db.DocumentVersion.where('statusId', 'EFFECTIVE').exec()
    const resolved = await Promise.all(
      versions.map(async (v) => {
        const doc = await db.Document.findByPk(v.documentId)
        if (!doc) return null
        return { id: v.id, name: `${doc.docNumber} — ${doc.title}` }
      }),
    )
    return resolved.filter(Boolean)
  },

  { models: ['DocumentVersion', 'Document'], initial: [] },
)

const selectedVersionId = ref(null)
const saving = ref(false)

const sharedVersionIds = computed(
  () => new Set(sharedDocs.value.map((e) => e.sd.documentVersionId)),
)

const availableItems = computed(() =>
  allLatestVersions.value.filter((v) => !sharedVersionIds.value.has(v.id)),
)

const selectedVersion = computed(
  () => allLatestVersions.value.find((v) => v.id === selectedVersionId.value) || null,
)

const addDoc = useLiveMutation(async (db, { supplierId, documentVersionId }) => {
  const sd = db.SupplierDocument.create({ supplierId, documentVersionId })
  await sd.save()
  return sd
})

async function handleShare() {
  if (!selectedVersionId.value) return
  saving.value = true
  try {
    await addDoc({ supplierId: props.supplierId, documentVersionId: selectedVersionId.value })
    open.value = false
  } finally {
    saving.value = false
    selectedVersionId.value = null
  }
}

watch(open, (val) => {
  if (!val) {
    selectedVersionId.value = null
  }
})
</script>

<template>
  <BaseDialog v-model="open" title="Share Document" maxWidth="sm">
    <div class="tw:p-4 tw:space-y-4">
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1 tw:ml-2">
          Select Document
        </label>
        <BaseSelectMenu v-model="selectedVersionId" :items="availableItems" :required="true">
          <template #button="scope">
            <slot name="button" v-bind="scope">
              <BaseBadge v-if="selectedVersion" class="tw:text-sm tw:font-medium" selectable="">
                {{ selectedVersion.name }}
              </BaseBadge>
              <BaseBadge v-else class="tw:text-sm tw:font-medium tw:text-placeholder" selectable>
                Choose a document
              </BaseBadge>
            </slot>
          </template>
        </BaseSelectMenu>
      </div>
    </div>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
      <BaseButton :disabled="!selectedVersionId || saving" @click="handleShare">
        <BaseSpinner v-if="saving" size="sm" color="white" />
        <span>{{ saving ? 'Sharing...' : 'Share' }}</span>
      </BaseButton>
    </div>
  </BaseDialog>
</template>
