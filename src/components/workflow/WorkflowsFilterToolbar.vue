<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(() => !!filters.value.statusId)

function clearAll() {
  filters.value = { ...filters.value, statusId: null }
}
</script>

<template>
  <BaseFilterBar hideSearch :showClear="showClear" @clear="clearAll">
    <template #filters>
      <WorkflowsStatusSelectMenu v-model="filters.statusId" />
    </template>
    <template #actions>
      <slot name="actions" />
    </template>
  </BaseFilterBar>
</template>
