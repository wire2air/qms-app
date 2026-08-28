<script setup>
/**
 * APPROVED is the task vocabulary for "done" across every step type, but it
 * READS wrong on non-approval work: an ACTION or DELAY task was completed,
 * not approved (user report 2026-08-28). Callers pass the step's type when
 * they know it, or the task row itself — resolved to its workflow step here —
 * and APPROVED displays as "Completed" everywhere except APPROVAL steps.
 * Every other status keeps the lookup row's name.
 */
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
  hideLabel: { type: Boolean, default: false },
  /** The owning step's type, when the caller already knows it. */
  stepType: { type: String, default: null },
  /** Or the task row — its workflow step is resolved for the type. */
  task: { type: Object, default: null },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.TaskInstanceStatus.findByPk(statusId)
  },
  { models: ['TaskInstanceStatus'] },
)

const resolvedStepType = useLiveQueryWithDeps(
  [() => props.stepType, () => props.task?.sourceType, () => props.task?.sourceId],
  async (db, [stepType, sourceType, sourceId]) => {
    if (stepType) return stepType
    if (sourceType !== 'WorkflowInstanceStep' || !sourceId) return null
    const step = await db.WorkflowInstanceStep.findByPk(sourceId)
    return step?.stepType ?? null
  },
  { models: ['WorkflowInstanceStep'] },
)

const displayStatus = computed(() => {
  const s = status.value
  if (!s) return null
  if (s.id === 'APPROVED' && resolvedStepType.value && resolvedStepType.value !== 'APPROVAL') {
    return { ...s, id: s.id, name: 'Completed' }
  }
  return s
})
</script>

<template>
  <TaskInstanceStatusBadge
    v-if="displayStatus"
    :status="displayStatus"
    :showDot="showDot"
    :hideLabel="hideLabel"
    v-bind="$attrs"
  />
</template>
