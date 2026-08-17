<script setup>
/**
 * A batch: its settings, its files, and what happened to each.
 *
 * This is where the work happens (user decision 2026-08-17). The create dialog
 * only makes the container; files are dragged in here, over as many sittings
 * as it takes, and the batch is started explicitly when the list looks right.
 *
 * Per-file reading happens in the BROWSER before anything is queued: read the
 * header locally, upload, write the item row carrying both. That is why the
 * worker needs no parser and why a retry re-runs nothing but an insert.
 */
import {
  IconUpload,
  IconCircleCheck,
  IconAlertTriangle,
  IconClock,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'
import { IMPORT_ACCEPT, isSupportedImportFile, readImportHeader } from '@/utils/importFileHeader.js'
import { uploadFile } from '@/composables/useFileUpload.js'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const batchId = defineModel({ type: String, default: null })
const toast = useToast()

const open = computed({
  get: () => !!batchId.value,
  set: (v) => {
    if (!v) batchId.value = null
  },
})

const canImport = computed(() => isAllowed(['document_control:create']))

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

// Files can only be added while the batch has not been handed to the worker.
// Adding mid-run would race the loop that is claiming PENDING rows.
const isRunning = computed(() => ['QUEUED', 'PROCESSING'].includes(batch.value?.statusId))
const canAddFiles = computed(() => canImport.value && !isRunning.value && !adding.value)

const pendingCount = computed(() => items.value.filter((i) => i.statusId === 'PENDING').length)
const failedCount = computed(() => items.value.filter((i) => i.statusId === 'FAILED').length)

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
const ITEM_ICON = {
  PENDING: { icon: IconClock, class: 'tw:text-secondary' },
  PROCESSING: { icon: IconLoader2, class: 'tw:text-primary tw:animate-spin' },
  CREATED: { icon: IconCircleCheck, class: 'tw:text-emerald-600' },
  FAILED: { icon: IconAlertTriangle, class: 'tw:text-red-600' },
  CANCELLED: { icon: IconAlertTriangle, class: 'tw:text-secondary' },
}

function stamp(d) {
  return d ? d.formatDate('datetime') : '—'
}

// ── Adding files ─────────────────────────────────────────────────────────────
const adding = ref(false)
const dragOver = ref(false)
const progress = ref({ current: 0, total: 0, message: '' })

const createItem = useLiveMutation(async (db, payload) => {
  const item = db.DocumentImportItem.create(payload)
  await item.save()
  return item
})

const removeItem = useLiveMutation(async (db, id) => {
  const row = await db.DocumentImportItem.findByPk(id)
  if (row) await row.delete()
})

function pickFiles() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = IMPORT_ACCEPT
  input.multiple = true
  input.onchange = (e) => addFiles(Array.from(e.target.files ?? []))
  input.click()
}

function onDrop(e) {
  dragOver.value = false
  if (!canAddFiles.value) return
  addFiles(Array.from(e.dataTransfer?.files ?? []))
}

/**
 * Read → upload → record, one file at a time.
 *
 * Serial rather than parallel: a client dropping 200 documents would otherwise
 * open 200 simultaneous uploads. Progress is per file because on a run that
 * size "please wait" is not an answer.
 */
async function addFiles(picked) {
  if (!picked.length || !canAddFiles.value || !batch.value) return

  // The accept attribute is only a hint — "All Files" in the OS picker walks
  // straight past it, and a dropped folder carries whatever is in it.
  const supported = picked.filter(isSupportedImportFile)
  const skipped = picked.length - supported.length
  if (skipped) {
    toast.warning(
      `${skipped} unsupported file${skipped !== 1 ? 's' : ''} skipped — PDF, Word and Excel only.`,
    )
  }
  if (!supported.length) return

  // Against what is ALREADY in the batch, not just this drop: adding the same
  // folder twice is the obvious mistake and would import everything twice.
  const seen = new Set(items.value.map((i) => i.fileName))

  adding.value = true
  const failures = []
  try {
    let added = 0
    for (const [i, file] of supported.entries()) {
      progress.value = { current: i + 1, total: supported.length, message: file.name }
      if (seen.has(file.name)) continue
      try {
        // Never throws — an unreadable header still imports under its filename.
        const head = await readImportHeader(file)
        const { success, asset, error: uploadError } = await uploadFile(file, 'ASSET')
        if (!success || !asset) throw new Error(uploadError || 'Upload failed')

        await createItem({
          batchId: batch.value.id,
          assetId: asset.id,
          fileName: file.name,
          title: head.title || file.name,
          sourceDocumentNumber: head.documentNumber,
          departmentName: head.department,
          statusId: 'PENDING',
        })
        seen.add(file.name)
        added += 1
      } catch (e) {
        // One bad file must not abandon the rest of the drop.
        failures.push(`${file.name}: ${e?.message || 'could not be added'}`)
      }
    }

    if (added) {
      batch.value.totalItems = items.value.length + added
      await batch.value.save().catch(() => {})
    }
    if (failures.length) toast.error(`${failures.length} file(s) could not be added.`)
  } finally {
    adding.value = false
    progress.value = { current: 0, total: 0, message: '' }
  }
}

// ── Running ──────────────────────────────────────────────────────────────────
const acting = ref(false)

async function startImport() {
  if (acting.value || !batch.value) return
  acting.value = true
  try {
    await post(`/v1/services/documentImports/${batch.value.id}/process`)
    toast.success('Import started — documents are being created in the background.')
  } catch (e) {
    toast.error(e?.message || 'Could not start the import')
  } finally {
    acting.value = false
  }
}

async function retryFailed() {
  if (acting.value || !batch.value) return
  acting.value = true
  try {
    await post(`/v1/services/documentImports/${batch.value.id}/retry-failed`)
    toast.success('Failed files re-queued.')
  } catch (e) {
    toast.error(e?.message || 'Could not retry')
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" :title="batch?.name || 'Import batch'" size="3xl" showClose>
    <div v-if="batch" class="tw:flex tw:flex-col tw:gap-4">
      <!-- Summary: where the batch is, what it produced, and when. -->
      <div class="tw:flex tw:flex-wrap tw:items-start tw:gap-x-6 tw:gap-y-3">
        <div>
          <p class="tw:text-xs tw:text-secondary">Status</p>
          <span
            class="tw:mt-0.5 tw:inline-flex tw:rounded tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium"
            :class="STATUS_CLASS[batch.statusId] || 'tw:bg-gray-100 tw:text-gray-600'"
          >
            {{ STATUS_LABEL[batch.statusId] || batch.statusId }}
          </span>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Files</p>
          <p class="tw:text-sm tw:font-medium tw:text-on-main">{{ items.length }}</p>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Created</p>
          <p class="tw:text-sm tw:font-medium tw:text-emerald-700">{{ batch.createdItems }}</p>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Failed</p>
          <p
            class="tw:text-sm tw:font-medium"
            :class="batch.failedItems ? 'tw:text-red-600' : 'tw:text-on-main'"
          >
            {{ batch.failedItems }}
          </p>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Started</p>
          <p class="tw:text-sm tw:text-on-main">{{ stamp(batch.queuedAt) }}</p>
        </div>
        <div>
          <p class="tw:text-xs tw:text-secondary">Finished</p>
          <p class="tw:text-sm tw:text-on-main">{{ stamp(batch.completedAt) }}</p>
        </div>
      </div>

      <!-- The settings every document in the batch inherits. Read-only: they
           are baked into anything already created, so editing them mid-batch
           would make the run mean two different things. -->
      <div
        class="tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-2 tw:rounded-lg tw:bg-main-hover tw:px-3 tw:py-2 tw:text-sm"
      >
        <div class="tw:flex tw:items-center tw:gap-1.5">
          <span class="tw:text-xs tw:text-secondary">Site</span>
          <SiteBadgeById v-if="batch.siteId" :siteId="batch.siteId" />
          <span v-else class="tw:text-secondary">—</span>
        </div>
        <div class="tw:flex tw:items-center tw:gap-1.5">
          <span class="tw:text-xs tw:text-secondary">Department</span>
          <DepartmentBadgeById v-if="batch.departmentId" :departmentId="batch.departmentId" />
          <span v-else class="tw:text-secondary">—</span>
        </div>
        <div class="tw:flex tw:items-center tw:gap-1.5">
          <span class="tw:text-xs tw:text-secondary">Template</span>
          <DocumentTemplateBadgeById
            v-if="batch.documentTemplateId"
            :documentTemplateId="batch.documentTemplateId"
          />
        </div>
        <div v-if="batch.prefix" class="tw:flex tw:items-center tw:gap-1.5">
          <span class="tw:text-xs tw:text-secondary">Prefix</span>
          <span class="tw:font-medium tw:text-on-main">{{ batch.prefix }}</span>
        </div>
      </div>

      <!-- Drop zone. Hidden once the batch is running — adding mid-run would
           race the worker's claim of PENDING rows. -->
      <div
        v-if="canAddFiles || adding"
        class="tw:rounded-lg tw:border-2 tw:border-dashed tw:p-4 tw:text-center tw:transition-colors"
        :class="dragOver ? 'tw:border-primary tw:bg-primary/5' : 'tw:border-divider'"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <template v-if="adding">
          <p class="tw:truncate tw:text-sm tw:text-on-main">{{ progress.message }}</p>
          <p class="tw:text-xs tw:text-secondary">
            Adding {{ progress.current }} of {{ progress.total }}…
          </p>
          <div
            class="tw:mx-auto tw:mt-2 tw:h-1.5 tw:w-2/3 tw:overflow-hidden tw:rounded-full tw:bg-main-hover"
          >
            <div
              class="tw:h-full tw:bg-primary tw:transition-all"
              :style="{
                width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
              }"
            />
          </div>
        </template>
        <template v-else>
          <IconUpload :size="20" class="tw:mx-auto tw:mb-1 tw:text-secondary" />
          <p class="tw:text-sm tw:text-on-main">
            Drag files here, or
            <button
              type="button"
              class="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:font-medium tw:text-primary tw:hover:underline"
              @click="pickFiles"
            >
              choose files
            </button>
          </p>
          <p class="tw:text-xs tw:text-secondary">
            PDF, Word or Excel. Read locally, then uploaded one at a time.
          </p>
        </template>
      </div>

      <!-- Files -->
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
            <span class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-on-main">
              {{ item.title || item.fileName }}
            </span>

            <!-- What was read off the page, visible BEFORE the run so a bad
                 extraction is caught before 200 documents exist. -->
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

            <!-- Only while it is still just a queued file; removing one the
                 worker already turned into a document would orphan the draft. -->
            <button
              v-if="canAddFiles && item.statusId === 'PENDING'"
              type="button"
              class="tw:shrink-0 tw:cursor-pointer tw:border-0 tw:bg-transparent tw:text-secondary tw:hover:text-bad"
              aria-label="Remove file"
              @click="removeItem(item.id)"
            >
              <IconTrash :size="13" />
            </button>
          </div>

          <p v-if="item.errorMessage" class="tw:pl-6 tw:text-xs tw:text-red-600">
            {{ item.errorMessage }}
          </p>
        </div>

        <p v-if="!items.length" class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
          No files yet — add some above.
        </p>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="outline" @click="close">Close</BaseButton>
      <BaseButton
        v-if="failedCount && canImport && !isRunning"
        variant="outline"
        :isLoading="acting"
        :disabled="acting"
        @click="retryFailed"
      >
        <template #icon><IconRefresh :size="14" /></template>
        Retry {{ failedCount }} failed
      </BaseButton>
      <BaseButton
        v-if="canImport"
        variant="primary"
        :isLoading="acting"
        :disabled="acting || adding || isRunning || !pendingCount"
        @click="startImport"
      >
        <template #icon><IconPlayerPlay :size="14" /></template>
        Start import{{ pendingCount ? ` (${pendingCount})` : '' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
