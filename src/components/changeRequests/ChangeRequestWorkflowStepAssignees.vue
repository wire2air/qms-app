<script setup>
/**
 * Compact reviewer list for a CR workflow step. Inline action buttons
 * (reassign / send back) are deferred to a P2; for v1 the reviewer
 * sees their task in My Tasks and routes back here to view context.
 */

const props = defineProps({
  instanceStepId: { type: String, required: true },
})

const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },

  { models: ['UserOnWorkflowInstanceStep'], initial: [] },
)

const activeAssignees = computed(() =>
  assignments.value.filter((a) => ['ASSIGNED', 'PENDING'].includes(a.statusId)),
)
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-1">
    <UserAvatarById v-for="a in activeAssignees" :key="a.id" :userId="a.userId" class="tw:size-7" />
    <span v-if="!activeAssignees.length" class="tw:text-xs tw:text-secondary tw:italic">
      Unassigned
    </span>
  </div>
</template>
