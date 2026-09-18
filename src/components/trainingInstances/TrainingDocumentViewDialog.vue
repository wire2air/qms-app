<script setup>
const props = defineProps({
  documentId: { type: String, default: null },
  // When provided, render this specific version (pinned at training launch).
  // Otherwise fall back to the currently EFFECTIVE version.
  versionId: { type: String, default: null },
})

const model = defineModel({ type: Boolean, default: false })

const resolvedVersion = useLiveQueryWithDeps(
  [() => props.documentId, () => props.versionId],

  async (db, [docId, pinnedVersionId]) => {
    if (!docId) return null
    if (pinnedVersionId) {
      const v = await db.DocumentVersion.findByPk(pinnedVersionId)
      if (v) return v
    }
    const versions = await db.DocumentVersion.where('documentId', docId).exec()
    return versions.find((v) => v.statusId === 'EFFECTIVE') ?? null
  },
  { models: ['DocumentVersion'] },
)
</script>

<template>
  <BaseDialog v-model="model" maxWidth="3xl" :title="null">
    <div v-if="!documentId" class="tw:p-8 tw:text-center tw:text-secondary tw:text-sm">
      No document selected.
    </div>
    <div v-else-if="!resolvedVersion" class="tw:p-8 tw:text-center tw:text-secondary tw:text-sm">
      No effective (published) version found for this document.
    </div>
    <div v-else class="tw:max-h-[75vh] tw:overflow-y-auto tw:p-5">
      <DocumentsMainContentLeft
        :documentId="documentId"
        :versionId="resolvedVersion.id"
        :dense="true"
      />
    </div>
  </BaseDialog>
</template>
