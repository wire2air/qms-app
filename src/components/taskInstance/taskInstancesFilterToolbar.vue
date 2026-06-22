<script setup>
import { IconCalendar } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const filterItems = computed(() => [
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

const showClear = computed(
  () =>
    !!(
      filters.value.search ||
      filters.value.statusId ||
      filters.value.createdAt
    ),
)

function clearAll() {
  filters.value = { ...filters.value, search: '', statusId: null, createdAt: null }
}
</script>

<template>
  <!-- Scoped search stays in the app header (preserved placement) -->
  <SafeTeleport to="#main-header-search"> </SafeTeleport>

  <BaseFilterBar hideSearch :showClear="showClear" @clear="clearAll">
    <template #filters>
      <TaskInstanceStatusSelectMenu v-model="filters.statusId" />
      <BaseFilterMenu v-model="filters" :items="filterItems" />
    </template>
  </BaseFilterBar>
</template>
