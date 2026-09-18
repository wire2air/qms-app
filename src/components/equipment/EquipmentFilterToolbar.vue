<script setup>
import { IconSearch, IconX, IconCircleDot, IconCategory } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })

const STATUS_OPTIONS = [
  { value: 'IN_SERVICE', label: 'In service' },
  { value: 'OUT_OF_SERVICE', label: 'Out of service' },
  { value: 'RETIRED', label: 'Retired' },
]
const CATEGORY_OPTIONS = [
  { value: 'INSTRUMENT', label: 'Instrument' },
  { value: 'MACHINE', label: 'Machine' },
  { value: 'VEHICLE', label: 'Vehicle' },
  { value: 'SENSOR', label: 'Sensor' },
  { value: 'OTHER', label: 'Other' },
]
const statusLabel = (v) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v
const categoryLabel = (v) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v

const filterItems = computed(() => [
  { id: 'status', label: 'Status', icon: IconCircleDot, group: 'status', options: STATUS_OPTIONS },
  {
    id: 'category',
    label: 'Category',
    icon: IconCategory,
    group: 'category',
    options: CATEGORY_OPTIONS,
  },
])

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}
const hasChips = computed(() => arr('status').length || arr('category').length)
const showClear = computed(() => hasChips.value || !!filters.value.search)

function clearAll() {
  filters.value = { ...filters.value, search: '', status: [], category: [] }
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <!-- Row 1 — search + filter menu -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:relative tw:min-w-[12rem] tw:flex-1 tw:max-w-sm">
        <IconSearch
          :size="16"
          class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
        />
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search by name, code, or serial…"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:py-1.5 tw:ps-8 tw:pe-3 tw:text-sm tw:text-on-main tw:outline-none tw:transition-colors tw:focus:border-primary"
        />
      </div>

      <div class="tw:ms-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseFilterMenu v-model="filters" :items="filterItems" />
      </div>
    </div>

    <!-- Row 2 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary">
        Filters
      </span>
      <span
        v-for="v in arr('status')"
        :key="`st-${v}`"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        {{ statusLabel(v) }}
        <button
          type="button"
          :aria-label="`Remove ${statusLabel(v)} filter`"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="removeValue('status', v)"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
      <span
        v-for="v in arr('category')"
        :key="`ca-${v}`"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        {{ categoryLabel(v) }}
        <button
          type="button"
          :aria-label="`Remove ${categoryLabel(v)} filter`"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="removeValue('category', v)"
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
