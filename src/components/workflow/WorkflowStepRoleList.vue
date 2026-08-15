<script setup>
/**
 * Read-only render of a plain list of role ids as badges.
 *
 * The counterpart to WorkflowStepRoleBadges, which resolves the roles from a
 * step; this one takes the ids directly — for the places that hold the roles
 * themselves, like a Document Template's reviewer/approver arrays on a
 * published (immutable) template.
 */
defineProps({
  roleIds: { type: Array, default: () => [] },
})
</script>

<template>
  <span v-if="roleIds?.length" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
    <RoleBadgeById v-for="roleId in roleIds" :key="roleId" :roleId="roleId" />
  </span>
  <span v-else class="tw:text-sm tw:text-secondary">—</span>
</template>
