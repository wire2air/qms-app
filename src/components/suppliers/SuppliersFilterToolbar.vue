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
      filters.value.category ||
      filters.value.riskLevel
    ),
)

function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    statusId: null,
    category: null,
    riskLevel: null,
  }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search suppliers…"
    :showClear="showClear"
    @clear="clearAll"
  >
    <template #filters>
      <SupplierStatusSelectMenu v-model="filters.statusId" />
      <SupplierCategorySelectMenu v-model="filters.category" />
      <SupplierRiskLevelSelectMenu v-model="filters.riskLevel" />
    </template>
  </BaseFilterBar>
</template>
