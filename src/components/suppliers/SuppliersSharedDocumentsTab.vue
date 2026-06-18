<script setup>
import { IconLink, IconLinkOff, IconFilePlus, IconFileDescription } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  supplierId: {
    type: String,
    required: true,
  },
})

const canUpdate = computed(() => isAllowed(['suppliers:update']))

// ─── Live queries ─────────────────────────────────────────────────────────────

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

// ─── Share document ──────────────────────────────────────────────────────────

const showShareDialog = ref(false)

// ─── Remove document ──────────────────────────────────────────────────────────

const confirmDialog = ref(null)

function onRemoveDocument(entry) {
  confirmDialog.value = {
    title: 'Unshare Document',
    message: 'Are you sure you want to unshare this document from the supplier?',
    okLabel: 'Unshare',
    onOk: async () => {
      await entry.sd.delete()
      confirmDialog.value = null
    },
  }
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconLink :size="20" class="tw:text-secondary" />
        </div>
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Shared Documents</h3>
        <span
          v-if="sharedDocs.length"
          class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-gray-200 tw:text-gray-700 tw:px-2 tw:py-0.5 tw:text-micro tw:font-bold"
        >
          {{ sharedDocs.length }}
        </span>
      </div>
      <BaseButton v-if="canUpdate" variant="outline" @click="showShareDialog = true">
        <IconFilePlus :size="16" />
        <span>Share Document</span>
      </BaseButton>
    </div>

    <div v-if="sharedDocs.length" class="tw:divide-y tw:divide-divider">
      <div
        v-for="entry in sharedDocs"
        :key="entry.sd.id"
        class="tw:p-4 tw:flex tw:items-center tw:gap-4 tw:hover:bg-main-hover tw:transition-colors"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconFileDescription :size="20" class="tw:text-primary" />
        </div>
        <div class="tw:flex-1 tw:min-w-0">
          <p class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
            <template v-if="entry.document">
              {{ entry.document.docNumber }} — {{ entry.document.title || 'Document' }}
            </template>
            <template v-else>Document</template>
          </p>
          <div class="tw:flex tw:items-center tw:gap-2 tw:mt-0.5">
            <SupplierStatusBadgeById
              v-if="entry.document?.statusId"
              :statusId="entry.document.statusId"
            />
          </div>
        </div>
        <button
          v-if="canUpdate"
          class="tw:p-1.5 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
          title="Unshare document"
          @click="onRemoveDocument(entry)"
        >
          <IconLinkOff :size="16" />
        </button>
      </div>
    </div>

    <BaseEmptyState
      v-else
      :icon="IconLinkOff"
      title="No documents shared with this supplier."
      description="Share documents from your document management system."
    />
  </div>

  <!-- Share Document Dialog -->
  <SuppliersShareDocumentDialog v-model="showShareDialog" :supplierId="props.supplierId" />

  <BaseConfirmDialog
    v-if="confirmDialog"
    :modelValue="true"
    v-bind="confirmDialog"
    @update:modelValue="confirmDialog = null"
    @ok="confirmDialog?.onOk"
  />
</template>
