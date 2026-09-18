<script setup>
import { IconX, IconCircleDot, IconCategory, IconAlertTriangle } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })

const CATEGORIES = ['Raw Materials', 'Component', 'Service', 'Software']
const RISK_LEVELS = ['Low', 'Medium', 'High']

const statuses = useLiveQuery((db) => db.SupplierStatus.where().orderBy('displayOrder').exec(), {
  models: ['SupplierStatus'],
  initial: [],
})

const filterItems = computed(() => [
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: statuses.value.map((s) => ({ value: s.id, label: s.name })),
  },
  {
    id: 'category',
    label: 'Category',
    icon: IconCategory,
    group: 'category',
    options: CATEGORIES.map((c) => ({ value: c, label: c })),
  },
  {
    id: 'riskLevel',
    label: 'Risk level',
    icon: IconAlertTriangle,
    group: 'riskLevel',
    options: RISK_LEVELS.map((r) => ({ value: r, label: r })),
  },
])

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}
const hasChips = computed(
  () => arr('statusId').length || arr('category').length || arr('riskLevel').length,
)
const showClear = computed(() => hasChips.value)

function clearAll() {
  filters.value = {
    ...filters.value,
    statusId: [],
    category: [],
    riskLevel: [],
  }
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <!-- Row 1 — filter menu (search lives in the table toolbar) -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:ms-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseFilterMenu v-model="filters" :items="filterItems" />
      </div>
    </div>

    <!-- Row 2 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary">
        Filters
      </span>
      <SupplierStatusBadgeById
        v-for="id in arr('statusId')"
        :key="`st-${id}`"
        :statusId="id"
        clearable
        @clear="removeValue('statusId', id)"
      />
      <span
        v-for="c in arr('category')"
        :key="`ca-${c}`"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        {{ c }}
        <button
          type="button"
          :aria-label="`Remove ${c} filter`"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="removeValue('category', c)"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
      <span
        v-for="r in arr('riskLevel')"
        :key="`rk-${r}`"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        {{ r }} risk
        <button
          type="button"
          :aria-label="`Remove ${r} risk filter`"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="removeValue('riskLevel', r)"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
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
