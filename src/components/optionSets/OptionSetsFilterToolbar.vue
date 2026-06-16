<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(() => !!filters.value.search)

function clearAll() {
  filters.value = { search: '' }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search option sets…"
    :showClear="showClear"
    @clear="clearAll"
  />
</template>
