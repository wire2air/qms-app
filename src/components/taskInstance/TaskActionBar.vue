<script setup>
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  entityType: { type: String, required: true },
  entityId: { type: String, default: null },
})

const ACTIONABLE_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED']

const taskInstance = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId, () => currentSession.value?.userId],
  async (db, [entityType, entityId, userId]) => {
    if (!entityType || !entityId || !userId) return null
    const tasks = await db.TaskInstance.where('[entityType+entityId]', [
      entityType,
      entityId,
    ]).exec()
    return (
      tasks.find((t) => t.assignedTo === userId && ACTIONABLE_STATUSES.includes(t.statusId)) || null
    )
  },
)

const instanceStep = useLiveQueryWithDeps(
  [() => taskInstance.value?.sourceId, () => taskInstance.value?.sourceType],
  async (db, [sourceId, sourceType]) => {
    if (!sourceId || sourceType !== 'WorkflowInstanceStep') return null
    return db.WorkflowInstanceStep.findByPk(sourceId)
  },
)

const workflowStep = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return null
    return db.WorkflowStep.findByPk(stepId)
  },
)

const canActOnStep = computed(() => ACTIONABLE_STATUSES.includes(taskInstance.value?.statusId))

defineExpose({ taskInstance })
</script>

<template>
  <template v-if="taskInstance">
    <template v-if="entityType === 'DocumentVersion'">
      <WorkflowInstanceApproverAction
        action="APPROVE"
        :taskInstanceId="taskInstance.id"
        :instanceStepId="instanceStep?.id"
        :requireEsignature="workflowStep?.requireEsignature"
      />
      <WorkflowInstanceApproverAction
        action="REJECT"
        :taskInstanceId="taskInstance.id"
        :instanceStepId="instanceStep?.id"
        :requireEsignature="workflowStep?.requireEsignature"
      />
    </template>
    <template v-else-if="entityType === 'Nonconformance'">
      <TaskInstanceNcActions
        :taskInstanceId="taskInstance.id"
        :instanceStep="instanceStep"
        :workflowStep="workflowStep"
        :canActOnStep="canActOnStep"
      />
    </template>
    <template v-else-if="entityType === 'Capa' && taskInstance.taskKindId === 'EFFECTIVENESS_CHECK'">
      <TaskInstanceCapaEffectivenessActions :taskInstance="taskInstance" />
    </template>
    <template v-else-if="entityType === 'Capa'">
      <TaskInstanceCapaActions
        :taskInstanceId="taskInstance.id"
        :instanceStep="instanceStep"
        :workflowStep="workflowStep"
        :canActOnStep="canActOnStep"
      />
    </template>
  </template>
</template>
