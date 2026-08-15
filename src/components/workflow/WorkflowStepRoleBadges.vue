<script setup>
/**
 * Read-only list of the roles assigned to a workflow step.
 *
 * WorkflowRoleSelector is the editable counterpart; this is for the places that
 * only need to SHOW who will be asked to act — e.g. the inherited approval flow
 * on the document create form, where the flow comes from the template and
 * nothing on that screen may change it.
 */
const props = defineProps({
  stepId: { type: String, required: true },
})

const stepRoles = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => (stepId ? db.WorkflowStepRole.where('stepId', stepId).exec() : []),
  { models: ['WorkflowStepRole'], initial: [] },
)
</script>

<template>
  <span v-if="stepRoles.length" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
    <RoleBadgeById v-for="sr in stepRoles" :key="sr.id" :roleId="sr.roleId" />
  </span>
  <span v-else class="tw:text-xs tw:text-amber-600">No role assigned</span>
</template>
