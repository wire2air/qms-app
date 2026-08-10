<script setup>
import { isAllowed } from '@/utils/currentSession.js'
import { IconMessageExclamation } from '@tabler/icons-vue'

const props = defineProps({
  documentId: {
    type: String,
    required: true,
  },
  versionId: {
    type: String,
    default: null,
  },
  dense: {
    type: Boolean,
    default: false,
  },
  reviewMode: {
    type: Boolean,
    default: false,
  },
})

const document = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [id]) => {
    return db.Document.findByPk(id)
  },
  { models: ['Document'] },
)

const currentVersion = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [id]) => {
    return id ? db.DocumentVersion.findByPk(id) : null
  },
  { models: ['DocumentVersion'] },
)

// Editable only while the SELECTED version is a working draft (DRAFT/REJECTED).
// Once submitted for review, approved, or effective, the title and everything
// else is locked. `document.statusId` is only ACTIVE/ARCHIVED, so the version
// status is what gates editing.
const canEdit = computed(
  () =>
    isAllowed(['document_control:update']) &&
    document.value?.statusId !== 'ARCHIVED' &&
    !props.reviewMode &&
    ['DRAFT', 'REJECTED'].includes(currentVersion.value?.statusId),
)

// canEdit now already encodes the version-status gate; kept as a named alias
// for the sections list, which reads it as its edit permission.
const canUpdateVersion = canEdit

const versionLabel = computed(() => {
  const v = currentVersion.value
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor}.${v.versionMinor}`
})
</script>

<template>
  <div v-if="document && currentVersion" class="tw:lg:col-span-2 tw:space-y-6">
    <!-- Document Card -->
    <div
      class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:print:border-0 tw:print:shadow-none tw:overflow-hidden"
    >
      <!-- Document Header -->
      <div
        class="tw:border-b tw:border-divider tw:bg-main-hover"
        :class="dense ? 'tw:p-4' : 'tw:p-8'"
      >
        <div
          class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:flex-wrap"
          :class="dense ? 'tw:mb-2' : 'tw:mb-4'"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <DocumentVersionStatusBadgeById :statusId="currentVersion?.statusId" />
            <DocumentPeriodicReviewBadge :document="document" :canEdit="canEdit" />
          </div>

          <span class="tw:text-secondary tw:text-sm">
            <template v-if="document.docNumber">{{ document.docNumber }} </template>v{{
              versionLabel
            }}
          </span>
        </div>
        <!-- Typography must go through inputClass — plain class lands on the
             wrapper while the inner <input> keeps its own tw:text-sm, leaving
             the document's H1 tiny. -->
        <BaseTextInput
          v-if="canEdit"
          v-model="document.title"
          :inputClass="
            dense
              ? 'tw:text-xl! tw:font-bold tw:leading-tight tw:py-2'
              : 'tw:text-3xl! tw:font-bold tw:leading-tight tw:py-2'
          "
        />
        <h2
          v-else
          class="tw:font-bold tw:text-on-sidebar tw:leading-tight"
          :class="dense ? 'tw:text-xl' : 'tw:text-3xl'"
        >
          {{ document.title }}
        </h2>
        <p
          v-if="currentVersion?.changeSummary"
          class="tw:text-secondary tw:max-w-2xl"
          :class="dense ? 'tw:mt-1 tw:text-xs' : 'tw:mt-2'"
        >
          {{ currentVersion.changeSummary }}
        </p>

        <!-- Reviewer Feedback (shown when rejected or changes requested) -->
        <div
          v-if="
            currentVersion?.rejectComment &&
            ['REJECTED', 'CHANGES_REQUESTED'].includes(currentVersion?.statusId)
          "
          class="tw:mt-4 tw:rounded-lg tw:border tw:border-red-200 tw:bg-red-50 tw:dark:bg-red-950/20 tw:dark:border-red-800 tw:p-4"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:mb-2">
            <IconMessageExclamation :size="18" class="tw:text-red-600" />
            <span class="tw:text-sm tw:font-semibold tw:text-red-700 tw:dark:text-red-400">
              Reviewer Feedback
            </span>
          </div>
          <p
            class="tw:text-sm tw:text-red-800 tw:dark:text-red-300 tw:mb-0! tw:whitespace-pre-wrap"
          >
            {{ currentVersion.rejectComment }}
          </p>
        </div>
      </div>

      <!-- Document Body Sections -->
      <div
        class="tw:prose tw:prose-slate tw:dark:prose-invert tw:max-w-none"
        :class="dense ? 'tw:p-4' : 'tw:p-8'"
      >
        <DocumentVersionSectionsList
          v-if="currentVersion"
          :documentVersionId="currentVersion.id"
          :documentId="documentId"
          :canEdit="canUpdateVersion"
          :dense="dense"
          :reviewMode="reviewMode"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure proper prose styling for document content */
.tw\:prose :deep(p) {
  margin-bottom: 1rem;
}

.tw\:prose :deep(ul),
.tw\:prose :deep(ol) {
  margin: 1rem 0;
  padding-left: 1.5rem;
}

.tw\:prose :deep(li) {
  margin-bottom: 0.5rem;
}

.tw\:prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.tw\:prose :deep(th),
.tw\:prose :deep(td) {
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  text-align: left;
}

.tw\:prose :deep(th) {
  background-color: #f8fafc;
  font-weight: 600;
}

.tw\:prose :deep(blockquote) {
  border-left: 4px solid #136dec;
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  background-color: rgba(19, 109, 236, 0.05);
  padding: 1rem;
  border-radius: 0.25rem;
}

/* Dark mode adjustments */
:deep(.dark) .tw\:prose table th,
:deep(.dark) .tw\:prose table td {
  border-color: #334155;
}

:deep(.dark) .tw\:prose table th {
  background-color: #1e293b;
}
</style>
