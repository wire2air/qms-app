<script setup>
import { IconCalendar, IconSearch } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const filterItems = computed(() => [
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

const showClear = computed(
  () => !!(filters.value.search || filters.value.statusId || filters.value.createdAt),
)

function clearAll() {
  filters.value = { ...filters.value, search: '', statusId: null, createdAt: null }
}
</script>

<template>
  <!-- Scoped search stays in the app header (preserved placement). The
       teleport was shipped EMPTY, so `filters.search` — plumbed all the way
       through to the table's row filter — had no control to set it. -->
  <SafeTeleport to="#main-header-search">
    <BaseTextInput
      v-model="filters.search"
      name="search"
      placeholder="Search tasks by item name or number…"
      clearBtn
      class="tw:flex-1 tw:max-w-md"
    >
      <template #icon>
        <IconSearch :size="16" />
      </template>
    </BaseTextInput>
  </SafeTeleport>

  <BaseFilterBar hideSearch :showClear="showClear" @clear="clearAll">
    <template #filters>
      <TaskInstanceStatusSelectMenu v-model="filters.statusId" />
      <BaseFilterMenu v-model="filters" :items="filterItems" />
    </template>
  </BaseFilterBar>
</template>
