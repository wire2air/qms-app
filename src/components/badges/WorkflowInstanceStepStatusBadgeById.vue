<script setup>
const props = defineProps({
  statusId: { type: String, default: undefined },
  showDot: { type: Boolean, default: false },
  hideLabel: { type: Boolean, default: false },
  /**
   * The step's type, when the caller has it. The engine marks every finished
   * step APPROVED; only an APPROVAL step reads "Approved" — an ACTION or DELAY
   * step reads "Completed" (as WorkflowStep.vue's own header does).
   */
  stepType: { type: String, default: undefined },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.WorkflowInstanceStepStatus.findByPk(statusId)
  },
  { models: ['WorkflowInstanceStepStatus'] },
)
const shown = computed(() => {
  const st = status.value
  if (!st) return null
  if (st.id === 'APPROVED' && props.stepType && props.stepType !== 'APPROVAL') return { ...st, name: 'Completed' }
  return st
})
</script>

<template>
  <WorkflowInstanceStepStatusBadge
    v-if="shown"
    :status="shown"
    :showDot="showDot"
    :hideLabel="hideLabel"
    v-bind="$attrs"
  />
</template>
