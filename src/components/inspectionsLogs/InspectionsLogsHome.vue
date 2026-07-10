<script setup>
import {
  IconClipboardList,
  IconListCheck,
  IconChecklist,
  IconAlertCircle,
  IconHistory,
  IconStack2,
  IconPlus,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

/**
 * Landing page for the Inspections & Logs module. Four navigation
 * cards (Log Books, Log Book Assignments, My Queue, Logs) plus four
 * stat tiles so admins see the module's current state at a glance.
 *
 * Vocabulary: a *Log Book* is the form template (e.g. "Daily
 * Temperature Log Book"); a *Log Book Assignment* schedules who fills
 * it and when; a *Log* is one filled-in entry. Logs are synced via
 * SyncEngine — the stats are live queries.
 */
const router = useRouter()

const canAssign = computed(() => isAllowed(['inspections:assign']))
const canReview = computed(() => isAllowed(['field_records:review']))
const canCreateTemplate = computed(() => isAllowed(['forms_templates:create']))

// Round 1: scope the "Awaiting review" stat tile to the user's
// supervised log books (the digest queue in #2 reads the same shape).
const allLogBooks = useLiveQuery((db) => db.LogBook.where().exec(), {
  models: ['LogBook'],
  initial: [],
})

const allInstances = useLiveQuery((db) => db.AssignmentInstance.where().exec(), {
  models: ['AssignmentInstance'],
  initial: [],
})
const allRecords = useLiveQuery((db) => db.FieldRecord.where().exec(), {
  models: ['FieldRecord'],
  initial: [],
})

const stats = computed(() => {
  const now = DateTime.now()
  // currentSession exposes the user id as `.id` (preferred) with
  // `.userId` as a legacy fallback — match the rest of the app.
  const userId = currentSession.value?.userId ?? currentSession.value?.id
  const startOfWeek = now.startOf('week')

  const myDue = allInstances.value.filter(
    (i) => i.assignedToUserId === userId && (i.statusId === 'DUE' || i.statusId === 'OVERDUE'),
  )
  // Scope the count to the log books this user supervises so the tile
  // reflects "what's waiting on YOU" not the global UNDER_REVIEW pile.
  // Admins with fieldRecords:read_all see the global count via the
  // Pending Review page's "view all" toggle.
  const mySupervisedIds = new Set(
    allLogBooks.value.filter((lb) => lb.supervisorUserId === userId).map((lb) => lb.id),
  )
  const underReview = allRecords.value.filter(
    (r) => r.statusId === 'UNDER_REVIEW' && mySupervisedIds.has(r.logBookId),
  )
  const missedThisWeek = allInstances.value.filter(
    (i) => i.statusId === 'MISSED' && i.missedAt && i.missedAt >= startOfWeek,
  )
  const submittedThisWeek = allRecords.value.filter(
    (r) => r.submittedAt && r.submittedAt >= startOfWeek,
  )
  return {
    myDue: myDue.length,
    underReview: underReview.length,
    missedThisWeek: missedThisWeek.length,
    submittedThisWeek: submittedThisWeek.length,
  }
})

function go(path) {
  router.push(getCompanyPath(path))
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      subtitle="Field records for routine inspections, environmental logs, gemba rounds and shift handovers. Records are immutable after the edit window closes."
    >
      <template #title>Inspections &amp; Logs</template>
      <template #actions>
        <BaseButton
          v-if="canCreateTemplate"
          variant="primary"
          @click="go('/inspections-logs/templates')"
        >
          <IconPlus :size="16" />
          New Inspection Form
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Stat tiles -->
    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3">
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconChecklist :size="20" />
        </div>
        <div>
          <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
            My queue
          </div>
          <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ stats.myDue }}</div>
        </div>
      </div>
      <button
        type="button"
        class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4 tw:cursor-pointer tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
        @click="go('/inspections-logs/records?scope=needs_review')"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconAlertCircle :size="20" />
        </div>
        <div>
          <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
            Awaiting your review
          </div>
          <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ stats.underReview }}</div>
        </div>
      </button>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconHistory :size="20" />
        </div>
        <div>
          <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
            Missed this week
          </div>
          <div
            class="tw:text-2xl tw:font-bold"
            :class="stats.missedThisWeek > 0 ? 'tw:text-red-600' : 'tw:text-on-sidebar'"
          >
            {{ stats.missedThisWeek }}
          </div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-green-50 tw:text-green-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconListCheck :size="20" />
        </div>
        <div>
          <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
            Submitted this week
          </div>
          <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">
            {{ stats.submittedThisWeek }}
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation cards -->
    <div>
      <BaseText variant="overline" class="tw:block tw:mb-2">Module sections</BaseText>
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:lg:grid-cols-4 tw:gap-3">
        <button
          v-if="canCreateTemplate"
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:px-5 tw:py-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="go('/inspections-logs/templates')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconStack2 :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">Log Books</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            Build and manage your log book templates. Operational logs auto-lock after a short edit
            window; controlled records require e-signature and reviewer approval.
          </div>
        </button>

        <button
          v-if="canAssign"
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:px-5 tw:py-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="go('/inspections-logs/form-assignments')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconClipboardList :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">Log Book Assignments</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            Plan who fills which log book, when (cron + timezone), and where (site). The scheduler
            materialises assignment instances in a 24-hour look-ahead.
          </div>
        </button>

        <button
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:px-5 tw:py-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="go('/task-instances')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-emerald-50 tw:text-emerald-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconChecklist :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">My Tasks</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            Scheduled inspections &amp; log collections due to you appear in your unified task inbox
            alongside approvals and reviews. Click one to fill the form.
          </div>
        </button>

        <button
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:px-5 tw:py-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="go('/inspections-logs/records')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-purple-50 tw:text-purple-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconListCheck :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">Logs</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            Every log entry submitted across your log books. Filter by form to scope into a specific
            log book.
            <span v-if="canReview" class="tw:text-xs tw:text-secondary tw:italic tw:block tw:mt-1">
              Filter by status to find entries awaiting review.
            </span>
          </div>
        </button>
      </div>
    </div>
  </BasePage>
</template>
