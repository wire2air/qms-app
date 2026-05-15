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
    return db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      instanceStepId,
    ]).exec()
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
    class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-dashed tw:border-divider tw:p-4"
    :class="{ 'tw:opacity-60': !tasks.length }"
  >
    <div class="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-2">
      <div class="tw:min-w-0 tw:flex-1">
        <h3 class="tw:font-bold tw:text-secondary tw:wrap-break-word">
          Step {{ displayNumber ?? instanceStep?.stepNumber }}: {{ step?.name }}
        </h3>
        <p class="tw:text-xs tw:text-secondary tw:italic">
          Rule: {{ step?.approvalRule }} &bull;
          {{
            step?.approvalRule === 'ANY'
              ? 'First task completes step'
              : 'All tasks must be completed'
          }}
        </p>
      </div>

      <!-- Avatar stack -->
      <div v-if="tasks.length" class="tw:flex tw:-space-x-3 tw:overflow-hidden tw:shrink-0">
        <UserAvatarById
          v-for="task in tasks"
          :key="task.id"
          :userId="task.assignedTo"
          class="tw:size-8 tw:border-divider tw:grayscale tw:opacity-50"
        />
      </div>
      <WorkflowInstanceStepStatusBadgeById
        v-else
        class="tw:shrink-0"
        :statusId="instanceStep?.statusId"
      />
    </div>

    <template v-if="tasks.length">
      <div class="tw:space-y-2 tw:mt-3">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="tw:flex tw:items-center tw:gap-3 tw:p-2.5 tw:rounded-lg tw:border tw:bg-sidebar tw:border-divider tw:opacity-60"
        >
          <UserAvatarById
            :userId="task.assignedTo"
            class="tw:size-8 tw:shrink-0 tw:border-divider tw:grayscale tw:opacity-50"
          />
          <div class="tw:min-w-0">
            <p class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
              {{ usersMap[task.assignedTo]?.firstName }} {{ usersMap[task.assignedTo]?.lastName }}
            </p>
            <p class="ds-label-sm tw:text-secondary tw:truncate">
              {{ usersMap[task.assignedTo]?.email }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
