<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(
  () =>
    !!(
      filters.value.search ||
      filters.value.statusId ||
      filters.value.dateFrom ||
      filters.value.dateTo
    ),
)

function clearAll() {
  filters.value = { ...filters.value, search: '', statusId: null, dateFrom: '', dateTo: '' }
}
</script>

<template>
  <!-- Scoped search stays in the app header (preserved placement) -->
  <SafeTeleport to="#main-header-search"> </SafeTeleport>

  <BaseFilterBar hideSearch :showClear="showClear" @clear="clearAll">
    <template #filters>
      <TaskInstanceStatusSelectMenu v-model="filters.statusId" />
      <DateRangeFilter
        :from="filters.dateFrom"
        :to="filters.dateTo"
        @update:from="(v) => (filters.dateFrom = v)"
        @update:to="(v) => (filters.dateTo = v)"
      />
    </template>
  </BaseFilterBar>
</template>
