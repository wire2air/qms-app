<script setup>
import {
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconArrowBackUp,
  IconPlus,
} from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import WorkflowStepActionsMenu from '@/components/workflow/WorkflowStepActionsMenu.vue'
import { CAPA_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  parentInstanceStepId: { type: String, required: true },
  parentStepNumber: { type: [Number, String], default: null },
  workflowInstanceId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  allowChildSteps: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign'])

const canAddChild = computed(() => props.isOwner && props.allowChildSteps)

const selectedChildId = ref(null)
const dialogOpen = ref(false)

const selectedChild = computed(
  () => childInstanceSteps.value.find((c) => c.id === selectedChildId.value) || null,
)

const dialogTitle = computed(() => {
  const child = selectedChild.value
  if (!child) return 'Step'
  return `${childStepLabel(child)} · ${childTitle(child)}`
})

function openChild(child) {
  selectedChildId.value = child.id
  dialogOpen.value = true
}

// ─── Add child step dialog ───────────────────────────────────────────────────
// Form state + submit logic live in <CapaAddChildStepDialog>; this component
// just owns the open/close ref.
const addDialogOpen = ref(false)

function openAddDialog() {
  addDialogOpen.value = true
}


// All children (template-spawned or ad-hoc) carry parentInstanceStepId pointing
// at this parent's instance row. One indexed lookup, no WorkflowStep fetch.
const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],
  async (db, [parentInstanceStepId]) => {
    if (!parentInstanceStepId) return []
    const all = await db.WorkflowInstanceStep.where(
      'parentInstanceStepId',
      parentInstanceStepId,
    ).exec()
    return all.sort((a, b) => a.stepOrder - b.stepOrder)
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
  return child.name || 'Step'
}

function childStepLabel(child) {
  const ordinal = childInstanceSteps.value.findIndex((c) => c.id === child.id) + 1
  if (!ordinal) return ''
  return props.parentStepNumber != null ? `${props.parentStepNumber}.${ordinal}` : `${ordinal}`
}

function childDueDate(child) {
  if (!child.startedAt || !child.slaDays) return null
  return child.startedAt.plus({ days: child.slaDays })
}

function isOverdue(child) {
  if (child.statusId !== 'IN_PROGRESS') return false
  const due = childDueDate(child)
  return !!due && due < DateTime.now()
}

function daysOverdue(child) {
  const due = childDueDate(child)
  if (!due) return 0
  return Math.floor(DateTime.now().diff(due, 'days').days)
}

function getBadgeClass(child) {
  if (isOverdue(child)) return 'tw:bg-red-100 tw:text-red-700'
  return {
    IN_PROGRESS: 'tw:bg-blue-100 tw:text-blue-700',
    PENDING: 'tw:bg-gray-100 tw:text-gray-600',
    APPROVED: 'tw:bg-green-100 tw:text-green-700',
    CANCELLED: 'tw:bg-red-100 tw:text-red-700',
    SENT_BACK: 'tw:bg-orange-100 tw:text-orange-700',
  }[child.statusId]
}

function getStatusLabel(child) {
  if (isOverdue(child)) return 'Overdue'
  const id = child.statusId
  if (!id) return '—'
  if (id === 'APPROVED') return 'Done'
  if (id === 'IN_PROGRESS') return 'In progress'
  if (id === 'SENT_BACK') return 'Sent back'
  if (id === 'PENDING') return 'Pending'
  return id.replace('_', ' ')
}

function getRowClass(child) {
  if (isOverdue(child)) return 'tw:bg-red-50/60 tw:border-red-100'
  if (child.statusId === 'IN_PROGRESS') return 'tw:bg-blue-50/60 tw:border-blue-100'
  return 'tw:bg-white tw:border-divider'
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div v-if="canAddChild" class="tw:flex tw:justify-end">
      <BaseButton variant="outline" size="sm" @click="openAddDialog">
        <template #icon><IconPlus :size="14" /></template>
        Add child step
      </BaseButton>
    </div>

    <div
      v-for="child in childInstanceSteps"
      :key="child.id"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-3 tw:border tw:rounded-lg tw:cursor-pointer tw:hover:shadow-sm tw:transition-shadow"
      :class="getRowClass(child)"
      @click="openChild(child)"
    >
      <!-- Status icon -->
      <div class="tw:shrink-0">
        <div
          v-if="child.statusId === 'APPROVED'"
          class="tw:size-6 tw:rounded-full tw:bg-green-500 tw:flex tw:items-center tw:justify-center"
        >
          <IconCheck :size="14" class="tw:text-white" stroke-width="3" />
        </div>
        <div
          v-else-if="isOverdue(child)"
          class="tw:size-6 tw:rounded-full tw:bg-red-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconAlertTriangle :size="14" class="tw:text-red-600" />
        </div>
        <div
          v-else-if="child.statusId === 'IN_PROGRESS'"
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-blue-400 tw:flex tw:items-center tw:justify-center"
        >
          <IconLoader2 :size="14" class="tw:text-blue-600 tw:animate-spin" />
        </div>
        <div
          v-else-if="child.statusId === 'SENT_BACK'"
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-amber-400 tw:flex tw:items-center tw:justify-center"
        >
          <IconArrowBackUp :size="14" class="tw:text-amber-600" />
        </div>
        <div
          v-else
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-gray-300 tw:bg-white"
        ></div>
      </div>

      <!-- Title block -->
      <div class="tw:flex tw:flex-col tw:min-w-0 tw:flex-1">
        <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
          {{ childStepLabel(child) }} · {{ childTitle(child) }}
        </div>
        <div
          class="tw:text-xs tw:mt-0.5"
          :class="isOverdue(child) ? 'tw:text-red-600' : 'tw:text-secondary'"
        >
          <template v-if="child.statusId === 'APPROVED'">
            <span v-if="child.completedAt"
              >Completed {{ child.completedAt.formatDate('date') }}</span
            >
            <span v-else>Completed</span>
          </template>
          <template v-else-if="isOverdue(child)">
            Was due {{ childDueDate(child).formatDate('date') }} · {{ daysOverdue(child) }} days
            overdue
          </template>
          <template v-else-if="child.statusId === 'IN_PROGRESS'">
            <span v-if="childDueDate(child)">Due {{ childDueDate(child).formatDate('date') }}</span>
            <span v-else>In progress</span>
          </template>
          <template v-else-if="child.statusId === 'SENT_BACK'">Sent back</template>
          <template v-else>Pending</template>
        </div>
      </div>

      <!-- Right cluster -->
      <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0" @click.stop>
        <UserAvatarById
          v-if="activeAssigneeIdFor(child.id)"
          :userId="activeAssigneeIdFor(child.id)"
          :showCardOnClick="true"
          class="tw:size-7"
        />
        <span v-else class="tw:text-xs tw:text-secondary">—</span>
        <BaseBadge class="tw:text-[10px]" :class="getBadgeClass(child)">
          {{ getStatusLabel(child) }}
        </BaseBadge>
        <WorkflowStepActionsMenu
          :module="CAPA_MODULE"
          :instanceStepId="child.id"
          :resourceId="capaId"
          :isOwner="isOwner"
          @reassign="(id) => emit('reassign', id)"
        />
      </div>
    </div>

    <BaseDialog v-model="dialogOpen" :title="dialogTitle" maxWidth="2xl">
      <CapaWorkflowStepForm
        v-if="selectedChildId"
        :instanceStepId="selectedChildId"
        :capaId="capaId"
      />
    </BaseDialog>

    <CapaAddChildStepDialog
      v-model="addDialogOpen"
      :capaId="capaId"
      :parentInstanceStepId="parentInstanceStepId"
    />
  </div>
</template>
