<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(() => !!(filters.value.search || filters.value.siteId))

function clearAll() {
  filters.value = { search: '', siteId: null }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search departments…"
    :showClear="showClear"
    @clear="clearAll"
  >
    <template #filters>
      <SiteSelectMenu v-model="filters.siteId" :required="false" :isFilter="true" />
    </template>
  </BaseFilterBar>
</template>
