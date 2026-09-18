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
  { models: ['TaskInstance'] },
)

const instanceStep = useLiveQueryWithDeps(
  [() => taskInstance.value?.sourceId, () => taskInstance.value?.sourceType],

  async (db, [sourceId, sourceType]) => {
    if (!sourceId || sourceType !== 'WorkflowInstanceStep') return null
    return db.WorkflowInstanceStep.findByPk(sourceId)
  },
  { models: ['WorkflowInstanceStep'] },
)

const workflowStep = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],

  async (db, [stepId]) => {
    if (!stepId) return null
    return db.WorkflowStep.findByPk(stepId)
  },
  { models: ['WorkflowStep'] },
)

const canActOnStep = computed(() => ACTIONABLE_STATUSES.includes(taskInstance.value?.statusId))

defineExpose({ taskInstance })
</script>

<template>
  <div v-if="taskInstance" class="tw:contents">
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
    <template
      v-else-if="entityType === 'Capa' && taskInstance.taskKindId === 'EFFECTIVENESS_CHECK'"
    >
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
    <template v-else-if="entityType === 'LogBook'">
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
    <!-- Only workflow-driven disposition tasks (with a step) approve/reject; a
         re-inspection ACTION task has no step — it's just a navigable pointer. -->
    <template v-else-if="entityType === 'InspectionLot' && instanceStep">
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

    <!-- Specification / Line-clearance-checklist approval — approve/reject. -->
    <template v-else-if="(entityType === 'Specification' || entityType === 'LineClearanceChecklist') && instanceStep">
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
  </div>
</template>
