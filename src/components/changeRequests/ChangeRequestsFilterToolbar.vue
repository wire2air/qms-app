<script setup>
import { IconSearch, IconX } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  default: () => ({
    search: '',
    statusId: null,
    priorityId: null,
    changeTypeId: null,
    dateFrom: '',
    dateTo: '',
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

function clearSearch() {
  filters.value.search = ''
}
function clearAll() {
  filters.value.search = ''
  filters.value.statusId = null
  filters.value.priorityId = null
  filters.value.changeTypeId = null
  filters.value.dateFrom = ''
  filters.value.dateTo = ''
}

const hasActiveFilters = computed(
  () =>
    filters.value.search ||
    filters.value.statusId ||
    filters.value.priorityId ||
    filters.value.changeTypeId ||
    filters.value.dateFrom ||
    filters.value.dateTo,
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
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:relative tw:flex-1 tw:min-w-64">
        <IconSearch
          :size="16"
          class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
        />
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search by CR number or title…"
          class="tw:w-full tw:pl-9 tw:pr-9 tw:py-2 tw:text-sm tw:rounded-lg tw:border tw:border-divider tw:bg-white tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/40"
        />
        <button
          v-if="filters.search"
          class="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:hover:text-on-main"
          @click="clearSearch"
        >
          <IconX :size="14" />
        </button>
      </div>
      <ChangeRequestStatusSelectMenu v-model="filters.statusId" class="tw:w-44" />
      <ChangeRequestPrioritySelectMenu v-model="filters.priorityId" class="tw:w-44" />
      <ChangeTypeSelectMenu v-model="filters.changeTypeId" class="tw:w-44" />
      <DateRangeFilter
        :from="filters.dateFrom"
        :to="filters.dateTo"
        @update:from="(v) => (filters.dateFrom = v)"
        @update:to="(v) => (filters.dateTo = v)"
      />
      <BaseButton v-if="hasActiveFilters" variant="outline" size="sm" @click="clearAll">
        Clear
      </BaseButton>
    </div>
  </div>
</template>
