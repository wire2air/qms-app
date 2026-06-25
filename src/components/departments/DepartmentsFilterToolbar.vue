<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(() => !!filters.value.siteId)

function clearAll() {
  filters.value = { siteId: null }
}
</script>

<template>
  <BaseFilterBar :showClear="showClear" @clear="clearAll">
    <template #filters>
      <SiteSelectMenu v-model="filters.siteId" :required="false" />
    </template>
  </BaseFilterBar>
</template>
