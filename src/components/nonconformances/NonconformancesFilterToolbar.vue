<script setup>
import { IconSearch, IconX, IconFilter, IconChevronDown } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })
const activeFilter = defineModel('activeFilter', { type: String, required: true })

const filterPills = [
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My NCs' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
]

const hasChips = computed(
  () =>
    !!(
      filters.value.statusId ||
      filters.value.severityId ||
      filters.value.typeId ||
      filters.value.supplierId ||
      filters.value.dateFrom ||
      filters.value.dateTo
    ),
)
const showClear = computed(() => hasChips.value || !!filters.value.search)

// Count of applied filters (drives the "Filters" button badge).
const activeCount = computed(() => {
  let n = 0
  if (filters.value.statusId) n += 1
  if (filters.value.severityId) n += 1
  if (filters.value.typeId) n += 1
  if (filters.value.supplierId) n += 1
  if (filters.value.dateFrom || filters.value.dateTo) n += 1
  return n
})

function clearDates() {
  filters.value.dateFrom = null
  filters.value.dateTo = null
}
function clearAll() {
  filters.value.search = ''
  filters.value.statusId = null
  filters.value.severityId = null
  filters.value.typeId = null
  filters.value.supplierId = null
  filters.value.dateFrom = null
  filters.value.dateTo = null
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5">
    <!-- Row 1 — search + filter controls -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:relative tw:min-w-[12rem] tw:flex-1 tw:max-w-sm">
        <IconSearch
          :size="16"
          class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
        />
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search NC number, title…"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:py-1.5 tw:ps-8 tw:pe-3 tw:text-sm tw:text-on-main tw:outline-none tw:transition-colors tw:focus:border-primary"
        />
      </div>

      <div class="tw:ms-auto tw:flex tw:items-center tw:gap-2">
        <BasePopover placement="bottom-end">
          <template #button>
            <button
              type="button"
              class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:transition-colors"
              :class="
                activeCount
                  ? 'tw:border-primary/40 tw:bg-main-selected tw:text-primary'
                  : 'tw:border-divider tw:bg-card tw:text-on-main tw:hover:bg-main-hover'
              "
            >
              <IconFilter :size="16" />
              Filters
              <span
                v-if="activeCount"
                class="tw:rounded-full tw:bg-primary tw:px-1.5 tw:text-micro tw:font-bold tw:text-on-primary tw:tabular-nums"
              >
                {{ activeCount }}
              </span>
              <IconChevronDown :size="14" class="tw:text-secondary" />
            </button>
          </template>
          <template #content>
            <div class="tw:flex tw:w-72 tw:flex-col tw:gap-3 tw:p-3">
              <div class="tw:flex tw:flex-col tw:gap-1">
                <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">Status</span>
                <NcStatusSelectMenu v-model="filters.statusId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">Severity</span>
                <NcSeveritySelectMenu v-model="filters.severityId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">Type</span>
                <NcTypeSelectMenu v-model="filters.typeId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">Supplier</span>
                <SupplierSelectMenu v-model="filters.supplierId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">Created date</span>
                <DateRangeFilter
                  :from="filters.dateFrom"
                  :to="filters.dateTo"
                  @update:from="(v) => (filters.dateFrom = v)"
                  @update:to="(v) => (filters.dateTo = v)"
                />
              </div>
              <button
                v-if="showClear"
                type="button"
                class="tw:self-start tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
                @click="clearAll"
              >
                Clear all filters
              </button>
            </div>
          </template>
        </BasePopover>
      </div>
    </div>

    <!-- Row 2 — quick views -->
    <BaseQuickFilterPills v-model="activeFilter" :pills="filterPills" ariaLabel="Quick views" />

    <!-- Row 3 — active filter chips (removable) -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
        Filters
      </span>
      <NcStatusBadgeById
        v-if="filters.statusId"
        :statusId="filters.statusId"
        clearable
        @clear="filters.statusId = null"
      />
      <NcSeverityBadgeById
        v-if="filters.severityId"
        :severityId="filters.severityId"
        clearable
        @clear="filters.severityId = null"
      />
      <NcTypeBadgeById
        v-if="filters.typeId"
        :typeId="filters.typeId"
        clearable
        @clear="filters.typeId = null"
      />
      <SupplierBadgeById
        v-if="filters.supplierId"
        :supplierId="filters.supplierId"
        clearable
        @clear="filters.supplierId = null"
      />
      <span
        v-if="filters.dateFrom || filters.dateTo"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        Date range
        <button
          type="button"
          aria-label="Clear date range"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="clearDates"
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
