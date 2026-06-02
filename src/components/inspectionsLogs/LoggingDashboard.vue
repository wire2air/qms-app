<script setup>
import {
  IconChecklist,
  IconClipboardList,
  IconChevronRight,
  IconShieldCheck,
  IconList,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed, currentSession } from '@/utils/currentSession.js'

/**
 * Mobile-first logging dashboard — the floor user's home for capturing
 * logs on an iPad / phone. Two things only:
 *   - "My Tasks" (logs you've been assigned / flagged entries) → the
 *     unified task inbox.
 *   - A tappable list of log books you can fill — tap one to open its
 *     fill form. On submit the fill page comes straight back here.
 *
 * Only EFFECTIVE log books appear (they can actually accept entries).
 * Designed to be wrapped in a WebView later; everything is large-tap +
 * single-column.
 */
const router = useRouter()

const canSubmit = computed(() => isAllowed(['fieldRecords:create']))
const userId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

const logBooks = useLiveQuery(
  async (db) => {
    const rows = await db.LogBook.where('statusId', 'ACTIVE').exec()
    return rows
      .filter((lb) => lb.currentEffectiveVersionId)
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
  },
  { initial: [] },
)

const logBookTypes = useLiveQuery((db) => db.LogBookType.where().exec(), { initial: [] })
const typeNameById = computed(() => new Map(logBookTypes.value.map((t) => [t.id, t.name])))
function typeLabel(lb) {
  return (
    typeNameById.value.get(lb.logBookTypeId) ||
    (lb.recordClassification === 'CONTROLLED_RECORD' ? 'Controlled Record' : 'Operational Log')
  )
}

// Open (DUE/OVERDUE) scheduled tasks for this user — the count drives the
// "My Tasks" badge so the floor user sees what's waiting at a glance.
const openTaskCount = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => {
    if (!uid) return 0
    const tasks = await db.TaskInstance.where('assignedTo', uid).exec()
    return tasks.filter(
      (t) =>
        ['ASSIGNED', 'IN_PROGRESS', 'FORM_SUBMITTED'].includes(t.statusId) &&
        ['AssignmentInstance', 'FieldRecord'].includes(t.entityType),
    ).length
  },
  { initial: 0 },
)

function fill(lb) {
  router.push(getCompanyPath(`/inspections-logs/fill?logBookId=${lb.id}`))
}
function goTasks() {
  router.push(getCompanyPath('/task-instances'))
}
function goLogs() {
  router.push(getCompanyPath('/inspections-logs/records'))
}
</script>

<template>
  <div
    class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-4 tw:overflow-y-auto tw:max-w-2xl tw:mx-auto tw:w-full"
  >
    <SafeTeleport to="#main-header-title">
      <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-on-sidebar">Logging</h2>
    </SafeTeleport>

    <!-- My Tasks -->
    <button
      type="button"
      class="tw:flex tw:items-center tw:gap-3 tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:text-left tw:active:bg-main-hover tw:transition"
      @click="goTasks"
    >
      <div
        class="tw:w-11 tw:h-11 tw:rounded-lg tw:bg-emerald-50 tw:text-emerald-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
      >
        <IconChecklist :size="24" />
      </div>
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:font-semibold tw:text-on-main">My Tasks</div>
        <div class="tw:text-xs tw:text-secondary">
          Scheduled inspections + flagged entries assigned to you
        </div>
      </div>
      <span
        v-if="openTaskCount > 0"
        class="tw:text-sm tw:font-bold tw:bg-emerald-600 tw:text-white tw:rounded-full tw:min-w-6 tw:h-6 tw:px-2 tw:flex tw:items-center tw:justify-center"
      >
        {{ openTaskCount }}
      </span>
      <IconChevronRight :size="20" class="tw:text-secondary tw:shrink-0" />
    </button>

    <!-- Logs (view submitted records) -->
    <button
      type="button"
      class="tw:flex tw:items-center tw:gap-3 tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:text-left tw:active:bg-main-hover tw:transition"
      @click="goLogs"
    >
      <div
        class="tw:w-11 tw:h-11 tw:rounded-lg tw:bg-purple-50 tw:text-purple-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
      >
        <IconList :size="24" />
      </div>
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:font-semibold tw:text-on-main">Logs</div>
        <div class="tw:text-xs tw:text-secondary">View the entries you've submitted</div>
      </div>
      <IconChevronRight :size="20" class="tw:text-secondary tw:shrink-0" />
    </button>

    <!-- Log books to fill -->
    <div>
      <div class="tw:text-xs tw:font-bold tw:uppercase tw:text-secondary tw:mb-2 tw:px-1">
        Log a record
      </div>

      <div
        v-if="logBooks.length === 0"
        class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-12 tw:text-secondary"
      >
        <IconClipboardList :size="40" class="tw:opacity-50" />
        <div class="tw:text-sm">No log books available yet.</div>
      </div>

      <div v-else class="tw:flex tw:flex-col tw:gap-2">
        <button
          v-for="lb in logBooks"
          :key="lb.id"
          type="button"
          :disabled="!canSubmit"
          class="tw:flex tw:items-center tw:gap-3 tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:text-left tw:active:bg-main-hover tw:transition tw:disabled:opacity-50"
          @click="fill(lb)"
        >
          <div
            class="tw:w-11 tw:h-11 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconShieldCheck v-if="lb.recordClassification === 'CONTROLLED_RECORD'" :size="22" />
            <IconClipboardList v-else :size="22" />
          </div>
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:font-semibold tw:text-on-main tw:truncate">{{ lb.title }}</div>
            <div class="tw:text-xs tw:text-secondary tw:truncate">
              <span class="tw:font-mono tw:uppercase">{{ lb.code }}</span>
              · {{ typeLabel(lb) }}
            </div>
          </div>
          <IconChevronRight :size="20" class="tw:text-secondary tw:shrink-0" />
        </button>
      </div>
    </div>
  </div>
</template>
