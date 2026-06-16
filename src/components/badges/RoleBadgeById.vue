<script setup>
const props = defineProps({
  roleId: {
    type: String,
    default: null,
  },
})

const role = useLiveQueryWithDeps(
  [() => props.roleId],
  async (db, [roleId]) => {
    if (!roleId) return null
    return db.Role.findByPk(roleId)
  },

  { models: ['Role'], initial: null },
)
</script>

<template>
  <RoleBadge v-if="role" :role="role" v-bind="$attrs" />
</template>
