<script setup>
import {
  IconListCheck,
  IconChecklist,
  IconAlertCircle,
  IconHistory,
  IconDeviceMobile,
} from '@tabler/icons-vue'
import { isAllowed, currentSession, isModuleEntitled } from '@/utils/currentSession.js'
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
const route = useRoute()

// Tabs, permission-gated like the left nav / QC Inspection (a tab is a
// module's management surface — docs/backend/permissions-model.md). Each maps
// to its matrix module: Log Books → log_books, Assignments → Log Book
// Assignments (`inspections`), Logs → field_records. Any grant implies :read.
const ALL_TABS = [
  { value: 'logs', label: 'Logs', permission: 'field_records:read' },
  { value: 'log-books', label: 'Log Books', permission: 'log_books:read' },
  { value: 'assignments', label: 'Assignments', permission: 'inspections:read' },
]
const tabs = computed(() => ALL_TABS.filter((t) => isAllowed([t.permission])))
const validTabIds = computed(() => new Set(tabs.value.map((t) => t.value)))
const firstTab = computed(() => tabs.value[0]?.value ?? 'logs')
const activeTab = ref(
  ALL_TABS.some((t) => t.value === route.query.tab) ? route.query.tab : 'logs',
)
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.value.has(v)) activeTab.value = v
  },
)
// Immediate: the URL always carries ?tab= so the sidebar submenu highlights
// the active section (QC Inspection pattern — the tab strip moved to the nav).
watch(
  activeTab,
  (id) => {
    if (route.query.tab !== id) router.replace({ query: { ...route.query, tab: id } })
  },
  { immediate: true },
)
const activeLabel = computed(() => ALL_TABS.find((t) => t.value === activeTab.value)?.label ?? '')

// The Logs tab is a wide, many-columned records table (a log book can add a
// column per captured field). Give it the full content width so more columns
// fit before the table's own horizontal scroll kicks in; the other tabs are
// ordinary lists that read better at the standard width.
const pageWidth = computed(() => (activeTab.value === 'logs' ? 'full' : 'standard'))
watch(
  validTabIds,
  (ids) => {
    if (!ids.has(activeTab.value)) activeTab.value = firstTab.value
  },
  { immediate: true },
)

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

const showMobilePortal = ref(false)
</script>

<template>
  <BasePage :width="pageWidth">
    <PageHeader
      subtitle="Field records for routine inspections, environmental logs, gemba rounds and shift handovers. Records are immutable after the edit window closes."
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          Inspections &amp; Logs
          <span v-if="activeLabel" class="tw:text-secondary tw:font-normal">
            · {{ activeLabel }}
          </span>
          <HelpButton slug="KB/operations/inspections-and-logs" :size="16" />
        </span>
      </template>
      <template #actions>
        <!-- Phone-first floor portal — share via QR/link (replaced the old
             "Logging" nav entry; a native app wraps the route later).
             Hidden when the platform admin switched the Portal Access
             module off for this tenant (entitlement plane). -->
        <BaseButton
          v-if="isModuleEntitled('portal')"
          variant="outline"
          @click="showMobilePortal = true"
        >
          <IconDeviceMobile :size="16" />
          Mobile Portal
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
        @click="router.replace({ query: { ...route.query, tab: 'logs', scope: 'needs_review' } })"
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

    <!-- Sections routed by the sidebar submenu (?tab= links — QC Inspection
         pattern, user request 2026-08-05). The in-page tab strip is gone; the
         v-if chain renders the active, permission-gated section. -->
    <div class="tw:mt-2">
      <InspectionsLogsTemplatesHome v-if="activeTab === 'log-books'" embedded />
      <FormAssignmentsHome v-else-if="activeTab === 'assignments'" embedded />
      <FieldRecordsHome v-else-if="activeTab === 'logs'" embedded />
    </div>
  </BasePage>

  <MobileLoggingPortalDialog v-model="showMobilePortal" />
</template>
