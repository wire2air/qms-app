<script setup>
const props = defineProps({
  instanceStepId: { type: String, required: true },
  displayNumber: { type: String, default: null },
})

const instanceStep = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [instanceStepId]) => {
    if (!instanceStepId) return null
    return db.WorkflowInstanceStep.findByPk(instanceStepId)
  },
)

const step = useLiveQueryWithDeps([() => instanceStep.value?.stepId], async (db, [stepId]) => {
  if (!stepId) return null
  return db.WorkflowStep.findByPk(stepId)
})

const tasks = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [instanceStepId]) => {
    if (!instanceStepId) return []
    const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      instanceStepId,
    ]).exec()
    return tasks.filter((t) => t.statusId !== 'ASSIGNED') // Filter out unclaimed tasks
  },
  { initial: [] },
)

const usersMap = useLiveQueryWithDeps(
  [() => tasks.value.map((t) => t.assignedTo)],
  async (db, [userIds]) => {
    const ids = [...new Set(userIds.filter(Boolean))]
    if (!ids.length) return {}
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]))
  },
  { initial: {} },
)
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:shadow-sm tw:opacity-80 tw:hover:opacity-100 tw:transition-opacity"
  >
    <div class="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-2 tw:mb-3">
      <div class="tw:min-w-0 tw:flex-1">
        <h3 class="tw:font-bold tw:text-on-main tw:wrap-break-word">
          Step {{ displayNumber ?? instanceStep?.stepNumber }}: {{ step?.name }}
        </h3>
        <p class="tw:text-xs tw:text-secondary">
          Rule: {{ step?.approvalRule }} &bull; Threshold met
        </p>
      </div>
      <WorkflowInstanceStepStatusBadgeById class="tw:shrink-0" :statusId="instanceStep?.statusId" />
    </div>
    <div class="tw:space-y-2">
      <div v-for="task in tasks" :key="task.id" class="tw:flex tw:items-center tw:gap-3">
        <UserAvatarById :userId="task.assignedTo" class="tw:size-8 tw:shrink-0" />
        <div class="tw:min-w-0 tw:flex tw:items-center tw:gap-2">
          <p class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
            {{ usersMap[task.assignedTo]?.firstName }} {{ usersMap[task.assignedTo]?.lastName }}
          </p>
          <TaskInstanceStatusBadgeById :statusId="task.statusId" />
        </div>
      </div>
    </div>
  </div>
</template>
