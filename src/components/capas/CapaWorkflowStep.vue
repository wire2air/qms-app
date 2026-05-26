<script setup>
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
// Hierarchy lives on the instance row — count rows that point at us.
const childStepCount = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [parentInstanceStepId]) => {
    if (!parentInstanceStepId) return 0
    const children = await db.WorkflowInstanceStep.where(
      'parentInstanceStepId',
      parentInstanceStepId,
    ).exec()
    return children.length
  },
  { initial: 0 },
)

const hasChildren = computed(() => childStepCount.value > 0)
// Render the child-step section whenever this stage already has children OR
// is configured to accept them — the section hosts the "Add child step" button
// even when the list is empty.
const showChildSection = computed(
  () => hasChildren.value || !!stepDefinition.value?.allowChildSteps,
)

const activeAssigneeId = computed(() => {
  const active = assignments.value.find((a) => a.statusId === 'ASSIGNED')
  return active?.userId || null
})
</script>

<template>
  <div v-if="instanceStep" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
          {{ displayNumber ?? instanceStep.stepNumber }}. {{ instanceStep.name || 'Step' }}
        </span>
        <BaseBadge class="tw:text-[10px]" :class="getStepStatusClass(instanceStep.statusId)">
          {{ getStatusLabel(instanceStep.statusId) }}
        </BaseBadge>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <UserBadgeById v-if="activeAssigneeId" :userId="activeAssigneeId" />
        <CapaStepActionsMenu
          :instanceStepId="instanceStepId"
          :capaId="capaId"
          :isOwner="isOwner"
          :hasSendBackTargets="hasSendBackTargets"
          :requireEsignature="!!stepDefinition?.requireEsignature"
          @reassign="(id) => emit('reassign', id)"
          @sendBack="emit('sendBack')"
        />
      </div>
    </div>

    <CapaWorkflowStepForm :instanceStepId="instanceStepId" :capaId="capaId" />

    <div class="tw:my-5 tw:border-t tw:border-divider"></div>

    <!-- Sub-tasks list (parent stages with nested children) -->
    <CapaWorkflowChildSteps
      v-if="showChildSection && instanceStep.workflowInstanceId"
      :parentInstanceStepId="instanceStep.id"
      :parentStepNumber="displayNumber ?? instanceStep.stepNumber"
      :workflowInstanceId="instanceStep.workflowInstanceId"
      :capaId="capaId"
      :isOwner="isOwner"
      :allowChildSteps="!!stepDefinition?.allowChildSteps && instanceStep.statusId !== 'APPROVED'"
      class="tw:mb-4"
      @reassign="(childInstanceStepId) => emit('reassign', childInstanceStepId)"
    />
  </div>
</template>
