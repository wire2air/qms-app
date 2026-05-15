<script setup>
import { IconUserCheck, IconArrowBackUp } from '@tabler/icons-vue'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  hasSendBackTargets: { type: Boolean, default: false },
  displayNumber: { type: String, default: null },
})

const emit = defineEmits(['reassign', 'sendBack'])

const instanceStep = useLiveQueryWithDeps([() => props.instanceStepId], async (db, [id]) =>
  id ? db.WorkflowInstanceStep.findByPk(id) : null,
)

const stepDefinition = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => (stepId ? db.WorkflowStep.findByPk(stepId) : null),
)

const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
  { initial: [] },
)

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

// CAPA nested stages: whether this step has children (drives form vs. sub-step list).
const childStepCount = useLiveQueryWithDeps(
  [() => stepDefinition.value?.id],
  async (db, [parentId]) => {
    if (!parentId) return 0
    const children = await db.WorkflowStep.where('parentStepId', parentId).exec()
    return children.length
  },
  { initial: 0 },
)

const hasChildren = computed(() => childStepCount.value > 0)

const canReassign = computed(() => {
  const status = instanceStep.value?.statusId
  return (
    props.isOwner && (status === 'PENDING' || status === 'IN_PROGRESS' || status === 'SENT_BACK')
  )
})

const activeAssigneeId = computed(() => {
  const active = assignments.value.find((a) => a.statusId === 'ASSIGNED')
  return active?.userId || null
})

const canSendBack = computed(
  () => props.isOwner && instanceStep.value?.statusId === 'IN_PROGRESS' && props.hasSendBackTargets,
)
</script>

<template>
  <div v-if="instanceStep" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
          {{ displayNumber ?? instanceStep.stepNumber }}. {{ stepDefinition?.name || 'Step' }}
        </span>
        <BaseBadge class="tw:text-[10px]" :class="getStepStatusClass(instanceStep.statusId)">
          {{ getStatusLabel(instanceStep.statusId) }}
        </BaseBadge>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <button
          v-if="canSendBack"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-amber-600 tw:hover:text-amber-700 tw:cursor-pointer tw:font-medium"
          @click="emit('sendBack')"
        >
          <IconArrowBackUp :size="14" />
          Send back
        </button>
        <UserBadgeById v-if="canReassign && activeAssigneeId" :userId="activeAssigneeId" />
        <button
          v-if="canReassign"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:cursor-pointer tw:font-medium"
          @click="emit('reassign', instanceStepId)"
        >
          <IconUserCheck :size="14" />
          Reassign
        </button>
      </div>
    </div>

    <CapaWorkflowStepForm :instanceStepId="instanceStepId" :capaId="capaId" />

    <div class="tw:my-5 tw:border-t tw:border-divider"></div>

    <!-- Sub-tasks list (parent stages with nested children) -->
    <CapaWorkflowChildSteps
      v-if="hasChildren && stepDefinition?.id && instanceStep.workflowInstanceId"
      :parentStepId="stepDefinition.id"
      :parentStepNumber="displayNumber ?? instanceStep.stepNumber"
      :workflowInstanceId="instanceStep.workflowInstanceId"
      :capaId="capaId"
      :isOwner="isOwner"
      class="tw:mb-4"
      @reassign="(childInstanceStepId) => emit('reassign', childInstanceStepId)"
    />
  </div>
</template>
