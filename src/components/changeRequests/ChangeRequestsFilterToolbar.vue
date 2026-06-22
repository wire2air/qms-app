<script setup>
import { IconCalendar } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  default: () => ({
    search: '',
    statusId: null,
    priorityId: null,
    changeTypeId: null,
    createdAt: null,
  }),
})
const activeFilter = defineModel('activeFilter', { type: String, default: 'all_open' })

const TABS = [
  { id: 'all_open', label: 'All open' },
  { id: 'mine', label: 'Mine' },
  { id: 'awaiting_approval', label: 'Awaiting approval' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'closed', label: 'Closed' },
]

const filterItems = computed(() => [
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

function clearAll() {
  filters.value.search = ''
  filters.value.statusId = null
  filters.value.priorityId = null
  filters.value.changeTypeId = null
  filters.value.createdAt = null
}

const hasActiveFilters = computed(
  () =>
    filters.value.search ||
    filters.value.statusId ||
    filters.value.priorityId ||
    filters.value.changeTypeId ||
    filters.value.createdAt,
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Quick-filter tab strip -->
    <div class="tw:flex tw:items-center tw:gap-1 tw:border-b tw:border-divider">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:border-b-2 tw:transition-colors tw:cursor-pointer"
        :class="
          activeFilter === tab.id
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-main'
        "
        @click="activeFilter = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Field filters -->
    <BaseFilterBar
      v-model:search="filters.search"
      searchPlaceholder="Search by CR number or title…"
      :showClear="hasActiveFilters"
      @clear="clearAll"
    >
      <template #filters>
        <ChangeRequestStatusSelectMenu v-model="filters.statusId" class="tw:w-44" />
        <ChangeRequestPrioritySelectMenu v-model="filters.priorityId" class="tw:w-44" />
        <ChangeTypeSelectMenu v-model="filters.changeTypeId" class="tw:w-44" />
        <BaseFilterMenu v-model="filters" :items="filterItems" />
      </template>
    </BaseFilterBar>
  </div>
</template>
