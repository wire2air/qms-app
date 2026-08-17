<script setup>
/**
 * One batch's files, with what was read off each and what happened to it.
 *
 * This view is the reason items carry their own status: on a 200-file
 * migration the useful question is never "did it work" but "which ones
 * didn't, and why". Failures show their message inline rather than behind a
 * click, and each created draft links straight through.
 */
import { IconCircleCheck, IconAlertTriangle, IconClock, IconLoader2 } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

// Holds the batch id, so the parent can open it by row click and `null` closes.
const batchId = defineModel({ type: String, default: null })

const open = computed({
  get: () => !!batchId.value,
  set: (v) => {
    if (!v) batchId.value = null
  },
})

const batch = useLiveQueryWithDeps(
  [() => batchId.value],
  async (db, [id]) => (id ? db.DocumentImportBatch.findByPk(id) : null),
  { models: ['DocumentImportBatch'], initial: null },
)

const items = useLiveQueryWithDeps(
  [() => batchId.value],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.DocumentImportItem.where('batchId', id).exec()
    return rows.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['DocumentImportItem'], initial: [] },
)

const ITEM_ICON = {
  PENDING: { icon: IconClock, class: 'tw:text-secondary' },
  PROCESSING: { icon: IconLoader2, class: 'tw:text-primary tw:animate-spin' },
  CREATED: { icon: IconCircleCheck, class: 'tw:text-emerald-600' },
  FAILED: { icon: IconAlertTriangle, class: 'tw:text-red-600' },
  CANCELLED: { icon: IconAlertTriangle, class: 'tw:text-secondary' },
}
</script>

<template>
  <BaseDialog v-model="open" :title="batch?.name || 'Import batch'" size="3xl" showClose>
    <div v-if="batch" class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:flex-wrap tw:gap-4 tw:text-sm">
        <div>
          <p class="tw:text-xs tw:text-secondary">Created</p>
          <p class="tw:font-medium tw:text-on-main">{{ batch.createdItems }}</p>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Failed</p>
          <p
            class="tw:font-medium"
            :class="batch.failedItems ? 'tw:text-red-600' : 'tw:text-on-main'"
          >
            {{ batch.failedItems }}
          </p>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Total</p>
          <p class="tw:font-medium tw:text-on-main">{{ batch.totalItems }}</p>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Template</p>
          <DocumentTemplateBadgeById
            v-if="batch.documentTemplateId"
            :documentTemplateId="batch.documentTemplateId"
          />
        </div>
      </div>

      <div class="tw:rounded-lg tw:border tw:border-divider tw:divide-y tw:divide-divider">
        <div
          v-for="item in items"
          :key="item.id"
          class="tw:flex tw:flex-col tw:gap-1 tw:px-3 tw:py-2"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <component
              :is="(ITEM_ICON[item.statusId] || ITEM_ICON.PENDING).icon"
              :size="15"
              class="tw:shrink-0"
              :class="(ITEM_ICON[item.statusId] || ITEM_ICON.PENDING).class"
            />
            <span class="tw:truncate tw:flex-1 tw:text-on-main">
              {{ item.title || item.fileName }}
            </span>

            <!-- What we read off the page. Shown even before processing, so a
                 wrong extraction is visible BEFORE 200 documents are created. -->
            <span
              v-if="item.sourceDocumentNumber"
              class="tw:shrink-0 tw:rounded tw:bg-main-hover tw:px-1.5 tw:py-0.5 tw:text-micro tw:text-secondary"
            >
              {{ item.sourceDocumentNumber }}
            </span>
            <span v-if="item.departmentName" class="tw:shrink-0 tw:text-xs tw:text-secondary">
              {{ item.departmentName }}
            </span>

            <RouterLink
              v-if="item.documentId"
              :to="getCompanyPath(`/documents/${item.documentId}`)"
              class="tw:shrink-0 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
            >
              Open draft
            </RouterLink>
          </div>

          <p v-if="item.errorMessage" class="tw:pl-6 tw:text-xs tw:text-red-600">
            {{ item.errorMessage }}
          </p>
        </div>

        <p v-if="!items.length" class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
          No files in this batch.
        </p>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="primary" @click="close">Done</BaseButton>
    </template>
  </BaseDialog>
</template>
