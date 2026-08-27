<script setup>
const props = defineProps({ employeeTitleId: { type: String, default: null } })
const title = useLiveQueryWithDeps(
  [() => props.employeeTitleId],
  async (db, [id]) => {
    if (!id) return null
    return db.EmployeeTitle.findByPk(id)
  },
  { models: ['EmployeeTitle'], initial: () => (props.employeeTitleId ? { id: props.employeeTitleId } : null) },
)
</script>

<template>
  <EmployeeTitleBadge v-if="title" :title="title" v-bind="$attrs" />
</template>
