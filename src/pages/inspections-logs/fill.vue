<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import {
  resolveActiveInLineage,
  lineageFailureReason,
} from '@/components/inspectionsLogs/logBookLineage.js'

/**
 * Dedicated "fill a log / inspection" page.
 *
 * Launched three ways:
 *   - From a task (/tasks): with ?logBookId=…&assignmentInstanceId=… —
 *     opens straight into that log book's fill form; submitting completes
 *     the scheduled instance + its task.
 *   - From the "Submit a log" button: no query — shows the log-book
 *     picker first, then the fill form (ad-hoc submission).
 *   - From a PRINTED QR label: with ?book=<lineage root code>. Resolved
 *     here rather than encoded as an id, because a sticker on a balance
 *     outlives the book row — see logBookLineage.js.
 *
 * Replaces the old in-page modal so the same flow can be fired from a
 * task with all the context (which log book) already known.
 */
defineOptions({
  name: 'InspectionsLogsFillPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}

const route = useRoute()
const router = useRouter()
const toast = useToast()

const open = ref(true)

// ── Scanned label (?book=<root code>) ───────────────────────────────────────
// Resolved against IndexedDB, which already holds every log book this user can
// see (RLS-scoped at sync). No endpoint needed, and it works the instant the
// page paints rather than after a round trip — which matters on a phone in a
// warehouse.
const scannedCode = computed(() =>
  typeof route.query.book === 'string' ? route.query.book.trim() : '',
)

const allLogBooks = useLiveQuery((db) => db.LogBook.where().exec(), {
  models: ['LogBook'],
  initial: [],
})

const scannedBook = computed(() =>
  scannedCode.value ? resolveActiveInLineage(allLogBooks.value, scannedCode.value) : null,
)

// `undefined` while the books are still loading, so the "bad label" screen
// never flashes before we actually know.
const scanFailure = computed(() => {
  if (!scannedCode.value) return null
  if (!allLogBooks.value.length) return undefined
  return lineageFailureReason(allLogBooks.value, scannedCode.value)
})

const logBookId = computed(() => {
  if (scannedCode.value) return scannedBook.value?.id ?? null
  return typeof route.query.logBookId === 'string' ? route.query.logBookId : null
})
const assignmentInstanceId = computed(() =>
  typeof route.query.assignmentInstanceId === 'string' ? route.query.assignmentInstanceId : null,
)

// Where to land afterwards: the task inbox if this came from a task,
// otherwise straight back to the logging dashboard (the log-book list the
// user picked from) — minimise taps for someone logging on the floor.
function done() {
  router.replace(getCompanyPath(assignmentInstanceId.value ? '/task-instances' : '/logging'))
}

// Friction-free submit: skip AddRecordDialog's success screen — toast and
// go straight back so they can grab the next log book.
function onCreated() {
  toast.success('Log saved')
  done()
}
</script>

<template>
  <div class="tw:h-full">
    <!-- A scanned label that resolves to nothing must say WHICH problem it is.
         "Not found" sends a technician looking for a network fault when the
         real answer is that the book is mid-revision. -->
    <div v-if="scanFailure" class="tw:p-6 tw:max-w-md tw:mx-auto tw:text-center tw:space-y-3">
      <div class="tw:text-base tw:font-semibold tw:text-on-main">
        {{ scanFailure === 'NONE_ACTIVE' ? 'This log book is not in use' : 'Label not recognised' }}
      </div>
      <p class="tw:text-sm tw:text-secondary">
        <template v-if="scanFailure === 'NONE_ACTIVE'">
          The book this label points at ({{ scannedCode }}) is being revised or has been retired, so
          it cannot take entries right now. Ask a supervisor before logging anything for this
          station.
        </template>
        <template v-else>
          No log book here matches the code on this label ({{ scannedCode }}). It may belong to
          another site, or the label may be out of date.
        </template>
      </p>
      <BaseButton variant="outline" @click="router.replace(getCompanyPath('/logging'))">
        Pick a log book instead
      </BaseButton>
    </div>
    <!-- Scanned but not resolved yet: the books are still coming out of IDB.
         Neither the form nor the failure screen is correct yet, so say so
         rather than flashing one of them. -->
    <div
      v-else-if="scannedCode && !logBookId"
      class="tw:p-6 tw:text-center tw:text-sm tw:text-secondary"
    >
      Opening log book…
    </div>
    <AddRecordDialog
      v-else
      v-model="open"
      classificationFilter="inspections"
      :logBookId="logBookId"
      :assignmentInstanceId="assignmentInstanceId"
      @created="onCreated"
      @close="done"
    />
  </div>
</template>
