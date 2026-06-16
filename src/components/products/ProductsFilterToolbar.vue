<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(
  () => !!(filters.value.search || filters.value.productTypeId || filters.value.statusId),
)

function clearAll() {
  filters.value = { search: '', productTypeId: null, statusId: null }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search products…"
    :showClear="showClear"
    @clear="clearAll"
  >
    <template #filters>
      <ProductTypeSelectMenu v-model="filters.productTypeId" :required="false" />
      <ProductStatusSelectMenu v-model="filters.statusId" :required="false" />
    </template>
  </BaseFilterBar>
</template>
