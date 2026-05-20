<script setup>
import { DateTime } from 'luxon'
import { IconAlertTriangle, IconCalendarClock, IconCheck, IconListCheck } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Periodic review status for a controlled document.
 *
 * ISO 9001 / 13485 require periodic review of controlled documents to
 * confirm they're still valid (every periodicReviewMonths, typically 12).
 * This badge surfaces the next-review window AND any open REVIEW task
 * the periodic-review worker has created.
 *
 * Two signals, in priority order:
 *   1. Open REVIEW TaskInstance present → "Review pending" chip with link
 *      to the user's task inbox. This is the strongest signal — the worker
 *      decided this doc needs review and assigned a person to act on it.
 *   2. No open task → fall back to date-based: overdue (red) / due-soon
 *      (amber) / current (muted "Next review: <date>").
 *
 * Mark-as-Reviewed:
 *   - Updates `lastReviewedAt` + `lastReviewedBy` on the document
 *   - Closes any open REVIEW TaskInstance (status → APPROVED) so the
 *     periodic-review scanner won't see it as still pending
 *
 * This badge reads the open task via SyncEngine — no backend round-trip
 * needed once the page is loaded.
 */

const props = defineProps({
  document: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
})

// Open REVIEW task for this document (if any). Worker creates it nightly;
// once present, the chip overrides the date-based banner.
const openReviewTask = useLiveQueryWithDeps(
  [() => props.document?.id],
  async (db, [docId]) => {
    if (!docId) return null
    const rows = await db.TaskInstance.where('[entityType+entityId]', ['Document', docId]).exec()
    return (
      rows.find(
        (t) =>
          t.taskKindId === 'REVIEW' &&
          ['ASSIGNED', 'IN_PROGRESS', 'CHANGES_REQUESTED', 'SENT_BACK', 'FORM_SUBMITTED'].includes(
            t.statusId,
          ),
      ) ?? null
    )
  },
  { initial: null },
)

function toDateTime(value) {
  if (!value) return null
  if (value.toFormat) return value
  if (value instanceof Date) return DateTime.fromJSDate(value)
  return DateTime.fromISO(String(value))
}

const baselineDate = computed(() => {
  const last = toDateTime(props.document?.lastReviewedAt)
  if (last) return last
  return toDateTime(props.document?.createdAt)
})

const nextReview = computed(() => {
  if (!baselineDate.value) return null
  const months = props.document?.periodicReviewMonths || 12
  return baselineDate.value.plus({ months })
})

const daysUntil = computed(() => {
  if (!nextReview.value) return null
  return Math.floor(nextReview.value.diffNow('days').days)
})

const state = computed(() => {
  if (daysUntil.value == null) return null
  if (daysUntil.value < 0) return 'overdue'
  if (daysUntil.value <= 30) return 'due-soon'
  return 'current'
})

const formattedDate = computed(() => nextReview.value?.toFormat('LLL d, yyyy') ?? '')

const saving = ref(false)
async function markReviewed() {
  if (!props.document || saving.value) return
  saving.value = true
  try {
    props.document.lastReviewedAt = DateTime.now()
    props.document.lastReviewedBy = currentSession.value?.userId || null
    await props.document.save()
    // Close the open REVIEW task if there is one — otherwise the
    // periodic-review scanner will still see it as pending and the chip
    // won't clear.
    const task = openReviewTask.value
    if (task) {
      task.statusId = 'APPROVED'
      await task.save()
    }
  } finally {
    saving.value = false
  }
}

const router = useRouter()
function openTask() {
  // Navigate to the task inbox / tasks page filtered to this task. The
  // exact route depends on the app's task routing — falling back to
  // the global tasks list with the task id as a query for deep-link.
  if (!openReviewTask.value) return
  // Most QMS apps route tasks via /:companyCode/tasks/:id; if your routing
  // differs, swap this path here.
  const companyCode = router.currentRoute.value.params?.companyCode
  if (companyCode) {
    router.push(`/${companyCode}/tasks/${openReviewTask.value.id}`)
  }
}
</script>

<template>
  <!-- Highest-priority signal: an open REVIEW task exists. Overrides the
       date-based banner because the worker has already escalated this. -->
  <div
    v-if="openReviewTask"
    class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-300 tw:px-3 tw:py-1.5 tw:text-xs"
  >
    <IconListCheck :size="14" class="tw:text-amber-700" />
    <span class="tw:font-semibold tw:text-amber-900">Review pending</span>
    <button
      class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:text-amber-800 tw:hover:underline tw:font-medium"
      @click="openTask"
    >
      Open task →
    </button>
    <button
      v-if="canEdit"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-amber-600 tw:text-white tw:px-2 tw:py-0.5 tw:font-medium tw:hover:bg-amber-700 tw:disabled:opacity-60"
      :disabled="saving"
      @click="markReviewed"
    >
      <IconCheck :size="12" /> Mark Reviewed
    </button>
  </div>

  <div
    v-else-if="state === 'overdue'"
    class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:px-3 tw:py-1.5 tw:text-xs"
  >
    <IconAlertTriangle :size="14" class="tw:text-red-600" />
    <span class="tw:font-semibold tw:text-red-800">
      Review overdue by {{ Math.abs(daysUntil) }} day{{ Math.abs(daysUntil) === 1 ? '' : 's' }}
    </span>
    <button
      v-if="canEdit"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-red-600 tw:text-white tw:px-2 tw:py-0.5 tw:font-medium tw:hover:bg-red-700 tw:disabled:opacity-60"
      :disabled="saving"
      @click="markReviewed"
    >
      <IconCheck :size="12" /> Mark Reviewed
    </button>
  </div>

  <div
    v-else-if="state === 'due-soon'"
    class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:px-3 tw:py-1.5 tw:text-xs"
  >
    <IconCalendarClock :size="14" class="tw:text-amber-600" />
    <span class="tw:font-semibold tw:text-amber-800">
      Review due in {{ daysUntil }} day{{ daysUntil === 1 ? '' : 's' }}
    </span>
    <button
      v-if="canEdit"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-amber-600 tw:text-white tw:px-2 tw:py-0.5 tw:font-medium tw:hover:bg-amber-700 tw:disabled:opacity-60"
      :disabled="saving"
      @click="markReviewed"
    >
      <IconCheck :size="12" /> Mark Reviewed
    </button>
  </div>

  <div
    v-else-if="state === 'current'"
    class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary"
  >
    <IconCalendarClock :size="12" />
    <span>Next review: {{ formattedDate }}</span>
  </div>
</template>
