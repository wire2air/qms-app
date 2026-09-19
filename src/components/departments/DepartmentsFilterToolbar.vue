<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(() => !!filters.value.siteId || !!filters.value.search)

function clearAll() {
  filters.value = { siteId: null, search: '' }
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
