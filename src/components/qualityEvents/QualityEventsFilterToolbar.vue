<script setup>
import { IconCircleDot, IconCategory, IconAlertTriangle } from '@tabler/icons-vue'
import { QUALITY_EVENT_STATUSES } from '@/utils/qualityEventStatuses'

const filters = defineModel('filters', { type: Object, required: true })
const activeFilter = defineModel('activeFilter', { type: String, required: true })

const filterPills = [
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

// Dimension option sources for the Linear-style filter menu. Status is a fixed
// enum; category + severity are option-set models.
const categories = useLiveQuery((db) => db.EventCategory.where().orderBy('displayOrder').exec(), {
  models: ['EventCategory'],
  initial: [],
})
const severities = useLiveQuery((db) => db.EventSeverity.where().orderBy('displayOrder').exec(), {
  models: ['EventSeverity'],
  initial: [],
})

const filterItems = computed(() => [
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: QUALITY_EVENT_STATUSES.map((s) => ({ value: s.id, label: s.name })),
  },
  {
    id: 'categoryId',
    label: 'Category',
    icon: IconCategory,
    group: 'categoryId',
    options: categories.value.map((c) => ({ value: c.id, label: c.name })),
  },
  {
    id: 'severityId',
    label: 'Severity',
    icon: IconAlertTriangle,
    group: 'severityId',
    options: severities.value.map((s) => ({ value: s.id, label: s.name })),
  },
])

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}
const hasChips = computed(
  () => arr('statusId').length || arr('categoryId').length || arr('severityId').length,
)
const showClear = computed(() => hasChips.value)

function clearAll() {
  filters.value = {
    ...filters.value,
    statusId: [],
    categoryId: [],
    severityId: [],
  }
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <!-- Row 1 — filter menu -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:ms-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseFilterMenu v-model="filters" :items="filterItems" />
      </div>
    </div>

    <!-- Row 2 — quick views -->
    <BaseQuickFilterPills v-model="activeFilter" :pills="filterPills" ariaLabel="Quick views" />

    <!-- Row 3 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
        Filters
      </span>
      <QualityEventStatusBadgeById
        v-for="id in arr('statusId')"
        :key="`st-${id}`"
        :statusId="id"
        clearable
        @clear="removeValue('statusId', id)"
      />
      <EventCategoryBadgeById
        v-for="id in arr('categoryId')"
        :key="`ca-${id}`"
        :categoryId="id"
        clearable
        @clear="removeValue('categoryId', id)"
      />
      <EventSeverityBadgeById
        v-for="id in arr('severityId')"
        :key="`sv-${id}`"
        :severityId="id"
        clearable
        @clear="removeValue('severityId', id)"
      />
      <button
        v-if="showClear"
        type="button"
        class="tw:ms-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
        @click="clearAll"
      >
        Clear all
      </button>
    </div>
  </div>
</template>
