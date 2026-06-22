<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(
  () => !!(filters.value.search || filters.value.userStatusId || filters.value.roleId),
)

function clearAll() {
  filters.value = { ...filters.value, search: '', userStatusId: null, roleId: null }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search users…"
    :showClear="showClear"
    @clear="clearAll"
  >
    <template #filters>
      <RoleSelectMenu v-model="filters.roleId" nullLabel="All roles" />
    </template>
  </BaseFilterBar>
</template>
