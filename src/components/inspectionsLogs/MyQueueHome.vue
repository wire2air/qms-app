<script setup>
import { IconChecklist, IconAlertTriangle, IconCheck, IconBan } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

/**
 * My Queue — assignment instances assigned to the current user with
 * status in (DUE, OVERDUE). Cards are mobile-friendly so the same
 * page works well when the user opens it on a tablet on the floor.
 *
 * "Fill" sends the user to the existing /records page pre-filtered to
 * the matching form template. The /records dialog already branches on
 * classification, so the e-sig flow + field_records submission kick
 * in correctly. When we build the dedicated form filler (P4 mobile
 * portal frontend), we'll route here instead.
 */
const router = useRouter()

const userId = computed(() => currentSession.value?.userId ?? currentSession.value?.id)

const STATUS_FILTERS = [
  { id: 'open', label: 'Due / Overdue', match: ['DUE', 'OVERDUE'] },
  { id: 'completed', label: 'Completed', match: ['COMPLETED'] },
  { id: 'missed', label: 'Missed', match: ['MISSED'] },
  { id: 'skipped', label: 'Skipped', match: ['SKIPPED'] },
]
const activeFilter = ref('open')

const allInstances = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => {
    if (!uid) return []
    return db.AssignmentInstance.where('assignedToUserId', uid).exec()
  },
  { initial: [] },
)

const plans = useLiveQuery((db) => db.FormAssignment.where().exec(), { initial: [] })
const formTemplates = useLiveQuery((db) => db.FormTemplate.where().exec(), { initial: [] })

const planById = computed(() => new Map(plans.value.map((p) => [p.id, p])))
const templateById = computed(() => new Map(formTemplates.value.map((t) => [t.id, t])))

const filteredInstances = computed(() => {
  const filter = STATUS_FILTERS.find((f) => f.id === activeFilter.value)
  const allowed = new Set(filter?.match ?? [])
  return allInstances.value
    .filter((i) => allowed.has(i.statusId))
    .sort((a, b) => (a.dueAt?.toMillis?.() ?? 0) - (b.dueAt?.toMillis?.() ?? 0))
})

function instanceTemplate(inst) {
  const plan = planById.value.get(inst.formAssignmentId)
  if (!plan) return null
  return templateById.value.get(plan.formTemplateId)
}

function instancePlanName(inst) {
  return planById.value.get(inst.formAssignmentId)?.name ?? '—'
}

function relativeDue(dt) {
  if (!dt) return '—'
  const now = DateTime.now()
  const diffMs = dt.toMillis() - now.toMillis()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes >= 60 * 24) {
    const days = Math.round(minutes / (60 * 24))
    return `due in ${days}d`
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60)
    return `due in ${hours}h`
  }
  if (minutes >= 1) return `due in ${minutes}m`
  if (minutes >= -60) return `${Math.abs(minutes)}m overdue`
  const hoursOverdue = Math.round(Math.abs(minutes) / 60)
  return `${hoursOverdue}h overdue`
}

function statusBadgeClass(statusId) {
  if (statusId === 'OVERDUE') return 'tw:bg-red-100 tw:text-red-700'
  if (statusId === 'DUE') return 'tw:bg-blue-100 tw:text-blue-700'
  if (statusId === 'COMPLETED') return 'tw:bg-green-100 tw:text-green-700'
  if (statusId === 'MISSED') return 'tw:bg-red-100 tw:text-red-700'
  if (statusId === 'SKIPPED') return 'tw:bg-gray-100 tw:text-gray-700'
  return 'tw:bg-gray-100 tw:text-gray-700'
}

function goFill(inst) {
  const template = instanceTemplate(inst)
  if (!template) return
  // /records pre-filters by template via the existing dialog flow.
  // Sub-optimal but useful until a dedicated filler page lands.
  router.push(getCompanyPath(`/records?templateId=${template.id}&assignmentInstanceId=${inst.id}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5 tw:overflow-y-auto">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">My Queue</h2>
      </div>
    </SafeTeleport>

    <!-- Page header -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">My Queue</div>
      <div class="tw:text-sm tw:text-secondary">
        Inspection assignments due to you. Click an instance to open the form.
      </div>
    </div>

    <!-- Status filter chips -->
    <div class="tw:flex tw:gap-2 tw:flex-wrap">
      <button
        v-for="f in STATUS_FILTERS"
        :key="f.id"
        type="button"
        class="tw:rounded-full tw:px-3 tw:py-1 tw:text-xs tw:font-medium tw:border tw:transition"
        :class="
          activeFilter === f.id
            ? 'tw:bg-primary tw:text-white tw:border-primary'
            : 'tw:bg-white tw:text-on-main tw:border-divider tw:hover:bg-main-hover'
        "
        @click="activeFilter = f.id"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-if="filteredInstances.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:py-16 tw:text-secondary"
    >
      <IconCheck :size="48" class="tw:opacity-60" />
      <div class="tw:text-sm">Nothing here. Take a break.</div>
    </div>

    <!-- Cards -->
    <div v-else class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:lg:grid-cols-3 tw:gap-3">
      <button
        v-for="inst in filteredInstances"
        :key="inst.id"
        type="button"
        class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:hover:border-primary tw:transition tw:flex tw:flex-col tw:gap-2"
        @click="goFill(inst)"
      >
        <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
          <div class="tw:font-semibold tw:text-on-main tw:text-sm tw:truncate">
            {{ instanceTemplate(inst)?.title ?? 'Unknown form' }}
          </div>
          <span
            class="tw:text-[10px] tw:font-bold tw:rounded tw:px-2 tw:py-0.5 tw:uppercase tw:shrink-0"
            :class="statusBadgeClass(inst.statusId)"
          >
            {{ inst.statusId }}
          </span>
        </div>
        <div class="tw:text-xs tw:text-secondary tw:truncate">
          {{ instancePlanName(inst) }}
        </div>
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-xs">
          <IconAlertTriangle
            v-if="inst.statusId === 'OVERDUE'"
            :size="14"
            class="tw:text-red-600"
          />
          <IconChecklist v-else :size="14" class="tw:text-secondary" />
          <span
            :class="
              inst.statusId === 'OVERDUE' ? 'tw:text-red-600 tw:font-medium' : 'tw:text-secondary'
            "
          >
            {{ relativeDue(inst.dueAt) }}
          </span>
          <span class="tw:text-secondary">·</span>
          <span class="tw:text-secondary">
            grace until {{ inst.graceUntil?.toFormat?.('LLL d, HH:mm') ?? '—' }}
          </span>
        </div>
        <div v-if="inst.skippedReason" class="tw:text-xs tw:text-amber-700 tw:italic tw:mt-1">
          <IconBan :size="12" class="tw:inline" />
          Skipped: {{ inst.skippedReason }}
        </div>
      </button>
    </div>
  </div>
</template>
