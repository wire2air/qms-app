<script setup>
import { IconUserCheck, IconChevronRight } from '@tabler/icons-vue'

const props = defineProps({
  parentStepId: { type: String, required: true },
  parentStepNumber: { type: [Number, String], default: null },
  workflowInstanceId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign'])

const REASSIGNABLE_STATUSES = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
function canReassignChild(child) {
  return props.isOwner && REASSIGNABLE_STATUSES.includes(child.statusId)
}

const childStepDefs = useLiveQueryWithDeps(
  [() => props.parentStepId],
  async (db, [parentId]) => {
    if (!parentId) return []
    return db.WorkflowStep.where('parentStepId', parentId).orderBy('stepOrder').exec()
  },
  { initial: [] },
)

const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.workflowInstanceId, () => childStepDefs.value.map((s) => s.id).join(',')],
  async (db, [workflowInstanceId, idsStr]) => {
    if (!workflowInstanceId || !idsStr) return []
    const childStepIds = new Set(idsStr.split(','))
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', workflowInstanceId).exec()
    const latest = new Map()
    for (const s of all) {
      if (!childStepIds.has(s.stepId)) continue
      const existing = latest.get(s.stepId)
      if (!existing || s.createdAt > existing.createdAt) latest.set(s.stepId, s)
    }
    return [...latest.values()].sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { initial: [] },
)

const childAssignments = useLiveQueryWithDeps(
  [() => childInstanceSteps.value.map((s) => s.id).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const fetched = await Promise.all(
      ids.map((id) => db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()),
    )
    return fetched.flat()
  },
  { initial: [] },
)

// Resolve the "currently assigned" user from UserOnWorkflowInstanceStep
// (rather than TaskInstance), because PENDING steps have an assignment row
// but no task yet — tasks are only created when the step goes IN_PROGRESS.
function activeAssigneeIdFor(childInstanceStepId) {
  const rows = childAssignments.value.filter(
    (a) => a.workflowInstanceStepId === childInstanceStepId && a.statusId !== 'REASSIGNED',
  )
  if (!rows.length) return null
  const preferred = rows.find((a) => a.statusId === 'ASSIGNED' || a.statusId === 'PENDING')
  return (preferred ?? rows[0]).userId
}

function childTitle(child) {
  return childStepDefs.value.find((d) => d.id === child.stepId)?.name || 'Step'
}

function childStepLabel(child) {
  const ordinal = childStepDefs.value.findIndex((d) => d.id === child.stepId) + 1
  if (!ordinal) return ''
  return props.parentStepNumber != null ? `${props.parentStepNumber}.${ordinal}` : `${ordinal}`
}

function childDueDate(child) {
  const def = childStepDefs.value.find((d) => d.id === child.stepId)
  if (!def?.slaDays || !child.startedAt) return null
  return child.startedAt.plus({ days: def.slaDays })
}

function getStepStatusClass(statusId) {
  return {
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'IN_PROGRESS',
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'PENDING',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700': statusId === 'CANCELLED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'SENT_BACK',
  }
}

function getStatusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'APPROVED') return 'Completed'
  return statusId.replace('_', ' ')
}

// Expand / collapse state per child id. Defaults to expanded for the active
// (IN_PROGRESS) child so the form is visible without an extra click; PENDING
// and completed children collapse to keep the list dense.
const expandedIds = ref(new Set())
const seededExpansion = ref(new Set())

watch(
  childInstanceSteps,
  (children) => {
    for (const child of children) {
      if (seededExpansion.value.has(child.id)) continue
      seededExpansion.value.add(child.id)
      if (child.statusId === 'IN_PROGRESS') {
        expandedIds.value.add(child.id)
      }
    }
  },
  { immediate: true },
)

function isExpanded(childId) {
  return expandedIds.value.has(childId)
}

function toggleExpanded(childId) {
  const next = new Set(expandedIds.value)
  if (next.has(childId)) next.delete(childId)
  else next.add(childId)
  expandedIds.value = next
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div
      v-for="child in childInstanceSteps"
      :key="child.id"
      class="tw:bg-main-hover/40 tw:border tw:border-divider tw:border-l-2 tw:border-l-primary/40 tw:rounded-md"
    >
      <div
        class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-3 tw:py-1.5 tw:cursor-pointer tw:select-none tw:hover:bg-main-hover/40"
        @click="toggleExpanded(child.id)"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:flex-1">
          <IconChevronRight
            :size="14"
            class="tw:text-secondary tw:shrink-0 tw:transition-transform"
            :class="{ 'tw:rotate-90': isExpanded(child.id) }"
          />
          <span
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:shrink-0"
          >
            {{ childStepLabel(child) }}
          </span>
          <span class="tw:text-xs tw:font-medium tw:text-on-main tw:truncate">
            {{ childTitle(child) }}
          </span>
          <BaseBadge class="tw:text-[9px]" :class="getStepStatusClass(child.statusId)">
            {{ getStatusLabel(child.statusId) }}
          </BaseBadge>
        </div>
        <div class="tw:flex tw:items-center tw:gap-3 tw:text-[11px] tw:text-secondary tw:shrink-0">
          <span>{{ childDueDate(child)?.formatDate('date') || '—' }}</span>
          <UserAvatarById
            v-if="activeAssigneeIdFor(child.id)"
            :userId="activeAssigneeIdFor(child.id)"
            :showCardOnClick="true"
            class="tw:size-6"
            @click.stop
          />
          <span v-else>—</span>
          <button
            v-if="canReassignChild(child)"
            class="tw:flex tw:items-center tw:gap-1 tw:text-primary tw:hover:underline tw:cursor-pointer tw:font-medium"
            @click.stop="emit('reassign', child.id)"
          >
            <IconUserCheck :size="14" />
            Reassign
          </button>
        </div>
      </div>
      <div v-if="isExpanded(child.id)" class="tw:px-3 tw:pb-3">
        <CapaWorkflowStepForm :instanceStepId="child.id" :capaId="capaId" />
      </div>
    </div>
  </div>
</template>
