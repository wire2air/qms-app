<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(() => !!filters.value.search)

function clearAll() {
  filters.value = { ...filters.value, search: '' }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search records…"
    :showClear="showClear"
    @clear="clearAll"
  />
</template>
