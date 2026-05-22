<script setup>
import {
  IconClipboardList,
  IconListCheck,
  IconChecklist,
  IconAlertCircle,
  IconHistory,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

/**
 * Landing page for the Inspections & Logs module. Three navigation
 * cards (Form Assignments, My Queue, Review Queue) plus four stat tiles
 * so admins see the module's current state at a glance.
 *
 * Field records, assignment instances, and form assignments are all
 * synced via SyncEngine — the stats are live queries.
 */
const router = useRouter()

const canAssign = computed(() => isAllowed(['inspections:assign']))
const canReview = computed(() => isAllowed(['fieldRecords:review']))

const allInstances = useLiveQuery((db) => db.AssignmentInstance.where().exec(), { initial: [] })
const allRecords = useLiveQuery((db) => db.FieldRecord.where().exec(), { initial: [] })

const stats = computed(() => {
  const now = DateTime.now()
  const userId = currentSession.value?.userId
  const startOfWeek = now.startOf('week')

  const myDue = allInstances.value.filter(
    (i) => i.assignedToUserId === userId && (i.statusId === 'DUE' || i.statusId === 'OVERDUE'),
  )
  const underReview = allRecords.value.filter((r) => r.statusId === 'UNDER_REVIEW')
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
  <div class="tw:flex tw:flex-col tw:gap-5 tw:h-full tw:p-5 tw:overflow-y-auto">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">
          Inspections &amp; Logs
        </h2>
      </div>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Inspections &amp; Logs</div>
      <div class="tw:text-sm tw:text-secondary">
        Field records for routine inspections, environmental logs, gemba rounds and shift handovers.
        Records are immutable after the edit window closes.
      </div>
    </div>

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
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            My queue
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.myDue }}</div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconAlertCircle :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Awaiting review
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.underReview }}</div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconHistory :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Missed this week
          </div>
          <div
            class="tw:text-2xl tw:font-black"
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
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Submitted this week
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
            {{ stats.submittedThisWeek }}
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation cards -->
    <div>
      <div class="tw:text-xs tw:font-bold tw:uppercase tw:text-secondary tw:mb-2">
        Module sections
      </div>
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-3">
        <button
          v-if="canAssign"
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="go('/inspections-logs/form-assignments')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconClipboardList :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">Form Assignments</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            Plan who fills which form, when (cron + timezone), and where (site). The scheduler
            materialises assignment instances in a 24-hour look-ahead.
          </div>
        </button>

        <button
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="go('/inspections-logs/queue')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-emerald-50 tw:text-emerald-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconChecklist :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">My Queue</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            Inspection assignments due to you now or overdue. Click an instance to fill the form.
            <span class="tw:text-xs tw:text-secondary tw:italic tw:block tw:mt-1">
              (Page lands in a follow-up commit.)
            </span>
          </div>
        </button>

        <button
          v-if="canReview"
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="go('/inspections-logs/review-queue')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-purple-50 tw:text-purple-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconChecklist :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">Review Queue</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            Records waiting on reviewer approval (for templates with review required).
            <span class="tw:text-xs tw:text-secondary tw:italic tw:block tw:mt-1">
              (Page lands in a follow-up commit.)
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
