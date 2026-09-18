<script setup>
/**
 * Bulk document import — the batch queue.
 *
 * A migration aid: a client onboarding onto the QMS points this at a folder of
 * their existing controlled PDFs and gets a DRAFT document per file, each with
 * the original attached, tagged `import` and its own source number.
 *
 * The batch holds the settings supplied once (site, fallback department,
 * template → approval flow, prefix). Each file is an item with its own status,
 * so a run of 200 where 3 fail says which 3 and why, and retries just those.
 */
import { IconFileImport, IconPlus, IconRefresh, IconFileTypePdf } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const toast = useToast()

// Importing IS document control — the batch exists only to create documents,
// so the permission that matters is the one for the thing being made.
const canImport = computed(() => isAllowed(['document_control:create']))

const showCreate = ref(false)
const openBatchId = ref(null)

const batches = useLiveQuery(
  async (db) => {
    const rows = await db.DocumentImportBatch.where().exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['DocumentImportBatch'], initial: [] },
)

const STATUS_CLASS = {
  DRAFT: 'tw:bg-gray-100 tw:text-gray-700',
  QUEUED: 'tw:bg-blue-100 tw:text-blue-700',
  PROCESSING: 'tw:bg-amber-100 tw:text-amber-700',
  COMPLETED: 'tw:bg-emerald-100 tw:text-emerald-700',
  COMPLETED_WITH_ERRORS: 'tw:bg-red-100 tw:text-red-700',
}
const STATUS_LABEL = {
  DRAFT: 'Draft',
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  COMPLETED_WITH_ERRORS: 'Completed with errors',
}

const columns = [
  { name: 'name', label: 'Batch', field: 'name', align: 'left' },
  { name: 'status', label: 'Status', field: 'statusId', align: 'left' },
  { name: 'progress', label: 'Progress', field: 'totalItems', align: 'left' },
  { name: 'created', label: 'Started', field: 'createdAt', align: 'left' },
]

const retrying = ref(null)

async function retryFailed(batch) {
  if (retrying.value) return
  retrying.value = batch.id
  try {
    await post(`/v1/services/documentImports/${batch.id}/retry-failed`)
    toast.success('Failed files re-queued.')
  } catch (e) {
    toast.error(e?.message || 'Could not retry this batch')
  } finally {
    retrying.value = null
  }
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconFileImport" title="Bulk Document Import">
      <template #subtitle>
        Import a folder of existing PDFs as draft documents — one batch, one set of settings.
      </template>
      <template #actions>
        <HelpButton slug="KB/documents/bulk-document-import" label="Help" :size="16" />
        <BaseButton v-if="canImport" variant="primary" size="sm" @click="showCreate = true">
          <template #icon><IconPlus :size="16" /></template>
          New import
        </BaseButton>
      </template>
    </PageHeader>

    <!-- What to expect, before the first batch. Onboarding is the only time
         most people use this page, so the guidance has to be on it rather than
         only behind the Help link. -->
    <div
      class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:p-4 tw:flex tw:flex-col tw:gap-3"
    >
      <div class="tw:flex tw:items-start tw:gap-2">
        <IconFileTypePdf :size="18" class="tw:mt-0.5 tw:shrink-0 tw:text-primary" />
        <div class="tw:flex tw:flex-col tw:gap-1">
          <p class="tw:text-sm tw:font-semibold tw:text-on-sidebar">
            One file in, one draft document out
          </p>
          <p class="tw:text-sm tw:text-secondary">
            Each file becomes a <strong>draft</strong> with the original attached, tagged
            <code class="tw:rounded tw:bg-main-hover tw:px-1">import</code> plus the document's own
            number where it prints one. Nothing is approved, numbered or made effective — you review
            and submit at your own pace.
          </p>
        </div>
      </div>

      <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-3 tw:text-sm">
        <div>
          <p class="tw:text-xs tw:font-medium tw:text-secondary">Formats</p>
          <p class="tw:text-on-sidebar">PDF, Word (.docx), Excel</p>
          <p class="tw:text-xs tw:text-secondary">
            .doc imports under its filename — this old format can't be read.
          </p>
        </div>
        <div>
          <p class="tw:text-xs tw:font-medium tw:text-secondary">Read from page one</p>
          <p class="tw:text-on-sidebar">Document number &amp; department</p>
          <p class="tw:text-xs tw:text-secondary">
            Never guessed — a document with no number simply has none.
          </p>
        </div>
        <div>
          <p class="tw:text-xs tw:font-medium tw:text-secondary">Set once per batch</p>
          <p class="tw:text-on-sidebar">Site, department, template, prefix</p>
          <p class="tw:text-xs tw:text-secondary">
            The template supplies the approval flow, so it must be published.
          </p>
        </div>
      </div>

      <p class="tw:text-xs tw:text-secondary">
        Try three or four real documents first and check what was read before importing hundreds —
        every file shows its extraction in the batch, before you press Start.
        <HelpButton
          slug="KB/documents/bulk-document-import"
          label="Read the full guide"
          :size="13"
        />
      </p>
    </div>

    <PageSection title="Batches" :icon="IconFileImport">
      <BaseEmptyState
        v-if="!batches.length"
        :icon="IconFileImport"
        title="No imports yet"
        description="Start a batch to bring a client's existing documents into the QMS as drafts."
      />
      <DataTable
        v-else
        :rows="batches"
        :columns="columns"
        @rowClick="(row) => (openBatchId = row.id)"
      >
        <template #body-cell-status="{ row }">
          <span
            class="tw:inline-flex tw:items-center tw:rounded tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium"
            :class="STATUS_CLASS[row.statusId] || 'tw:bg-gray-100 tw:text-gray-600'"
          >
            {{ STATUS_LABEL[row.statusId] || row.statusId }}
          </span>
        </template>

        <template #body-cell-progress="{ row }">
          <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <span class="tw:text-on-main">{{ row.createdItems }} / {{ row.totalItems }}</span>
            <span v-if="row.failedItems" class="tw:text-xs tw:font-medium tw:text-red-600">
              {{ row.failedItems }} failed
            </span>
            <!-- Retry lives on the row: the whole point of per-item status is
                 being able to re-run just what broke. -->
            <BaseButton
              v-if="row.failedItems && canImport"
              variant="outline"
              size="xs"
              :isLoading="retrying === row.id"
              :disabled="!!retrying"
              @click.stop="retryFailed(row)"
            >
              <template #icon><IconRefresh :size="12" /></template>
              Retry
            </BaseButton>
          </div>
        </template>

        <template #body-cell-created="{ row }">
          <!-- formatDate is a method ON the Luxon instance, not a `dt.` helper —
               and the value can be absent for a row that has just been written
               locally and not yet round-tripped. -->
          <span class="tw:text-sm tw:text-secondary">
            {{ row.createdAt ? row.createdAt.formatDate('date') : '—' }}
          </span>
        </template>
      </DataTable>
    </PageSection>

    <!-- Creating an empty container and leaving the user on the list would be
         a dead end, so the new batch opens straight away for files. -->
    <DocumentImportCreateDialog v-model="showCreate" @created="(id) => (openBatchId = id)" />
    <DocumentImportBatchDialog v-model="openBatchId" />
  </BasePage>
</template>
