<script setup>
import {
  IconCaretUpFilled,
  IconCaretDownFilled,
  IconChevronLeft,
  IconChevronRight,
  IconTableOff,
  IconColumns,
  IconLineHeight,
  IconCheck,
} from '@tabler/icons-vue'

const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  rowKey: { type: String, default: 'id' },
  noDataLabel: { type: String, default: 'No data available' },
  hidePagination: { type: Boolean, default: false },
  // --- Phase 3 opt-in enterprise features (all default to current behavior) ---
  selectable: { type: Boolean, default: false }, // checkbox column + bulk-action bar
  columnToggle: { type: Boolean, default: false }, // show/hide columns menu
  showDensityToggle: { type: Boolean, default: false }, // comfortable/compact toggle
  stickyHeader: { type: Boolean, default: true }, // header sticks on vertical scroll
  maxHeight: { type: String, default: null }, // e.g. '60vh' → internal vertical scroll
})

const emit = defineEmits(['row-click'])

const pagination = defineModel('pagination', {
  type: Object,
  default: () => ({
    page: 1,
    rowsPerPage: 50,
    sortBy: null,
    descending: false,
    total: null,
  }),
})

// Array of rowKey values. Opt-in via `selectable`; v-model:selected to read it.
const selected = defineModel('selected', { type: Array, default: () => [] })
// 'comfortable' | 'compact'. v-model:density optional; togglable in-table.
const density = defineModel('density', { type: String, default: 'comfortable' })

const slots = useSlots()

// Columns hidden via the column-toggle menu (internal — by col.name).
const hiddenCols = ref(new Set())
const visibleColumns = computed(() => props.columns.filter((c) => !hiddenCols.value.has(c.name)))
function toggleColumn(col) {
  if (col.hideable === false) return
  const next = new Set(hiddenCols.value)
  next.has(col.name) ? next.delete(col.name) : next.add(col.name)
  hiddenCols.value = next
}

const sortColumn = computed(() => pagination.value.sortBy ?? null)
const sortDirection = computed(() => (pagination.value.descending ? 'desc' : 'asc'))

// WAI-ARIA sort state for the column header (only on sortable columns).
function ariaSortFor(col) {
  if (!col.sortable) return undefined
  if (sortColumn.value !== col.name) return 'none'
  return sortDirection.value === 'asc' ? 'ascending' : 'descending'
}

function handleSort(col) {
  if (!col.sortable) return
  const newDescending = sortColumn.value === col.name ? !pagination.value.descending : false
  pagination.value = {
    ...pagination.value,
    sortBy: col.name,
    descending: newDescending,
    page: 1,
  }
}

function getCellValue(row, col) {
  if (typeof col.field === 'function') return col.field(row)
  return row[col.field]
}

// Type-aware comparison: numbers numerically, luxon DateTime by millis,
// everything else via locale compare with numeric collation.
function compareValues(valA, valB) {
  if (valA == null && valB == null) return 0
  if (valA == null) return 1
  if (valB == null) return -1
  if (typeof valA === 'number' && typeof valB === 'number') return valA - valB
  if (typeof valA?.toMillis === 'function' && typeof valB?.toMillis === 'function') {
    return valA.toMillis() - valB.toMillis()
  }
  return String(valA).localeCompare(String(valB), undefined, { numeric: true })
}

const sortedRows = computed(() => {
  if (!sortColumn.value) return props.rows
  const col = props.columns.find((c) => c.name === sortColumn.value)
  if (!col || !col.sortable) return props.rows
  const dir = sortDirection.value === 'asc' ? 1 : -1
  return [...props.rows].sort((a, b) => {
    // Custom per-column comparator wins, if provided.
    const cmp =
      typeof col.sort === 'function'
        ? col.sort(getCellValue(a, col), getCellValue(b, col), a, b)
        : compareValues(getCellValue(a, col), getCellValue(b, col))
    return cmp * dir
  })
})

const paginatedRows = computed(() => {
  const { page, rowsPerPage } = pagination.value
  if (rowsPerPage <= 0) return sortedRows.value
  const start = (page - 1) * rowsPerPage
  return sortedRows.value.slice(start, start + rowsPerPage)
})

// --- Selection -------------------------------------------------------------
const pageRowKeys = computed(() => paginatedRows.value.map((r) => r[props.rowKey]))
const allSelected = computed(
  () => pageRowKeys.value.length > 0 && pageRowKeys.value.every((k) => selected.value.includes(k)),
)
const someSelected = computed(() => pageRowKeys.value.some((k) => selected.value.includes(k)))
const isIndeterminate = computed(() => someSelected.value && !allSelected.value)

function isRowSelected(row) {
  return selected.value.includes(row[props.rowKey])
}
function toggleRow(row) {
  const k = row[props.rowKey]
  selected.value = selected.value.includes(k)
    ? selected.value.filter((x) => x !== k)
    : [...selected.value, k]
}
function toggleAll() {
  if (allSelected.value) {
    selected.value = selected.value.filter((k) => !pageRowKeys.value.includes(k))
  } else {
    const set = new Set([...selected.value, ...pageRowKeys.value])
    selected.value = [...set]
  }
}

// --- Layout helpers --------------------------------------------------------
const totalPages = computed(() => {
  const { rowsPerPage, total: initialTotal } = pagination.value
  const total = initialTotal || props.rows.length
  return rowsPerPage > 0 ? Math.ceil(total / rowsPerPage) : 1
})

const paginationLabel = computed(() => {
  const { page, rowsPerPage, total: initialTotal } = pagination.value
  const total = initialTotal || props.rows.length
  if (total === 0) return '0-0 of 0'
  const start = (page - 1) * rowsPerPage + 1
  const end = Math.min(page * rowsPerPage, total)
  return `${start}-${end} of ${total}`
})

function updatePagination(patch) {
  pagination.value = { ...pagination.value, ...patch }
}

function thAlignClass(align) {
  if (align === 'right') return 'tw:text-right'
  if (align === 'center') return 'tw:text-center'
  return 'tw:text-left'
}

function tdAlignClass(align) {
  if (align === 'right') return 'tw:text-right tw:justify-end'
  if (align === 'center') return 'tw:text-center tw:justify-center'
  return 'tw:text-left tw:justify-start'
}

const isCompact = computed(() => density.value === 'compact')
const thPadY = computed(() => (isCompact.value ? 'tw:py-2' : 'tw:py-3'))
const tdPadY = computed(() => (isCompact.value ? 'tw:py-1.5' : 'tw:py-3'))
const stickyClass = computed(() => (props.stickyHeader ? 'tw:sticky tw:top-0 tw:z-1' : ''))

const emptyColspan = computed(() => visibleColumns.value.length + (props.selectable ? 1 : 0))

const hasToolbar = computed(
  () =>
    !!slots.toolbar ||
    !!slots['toolbar-left'] ||
    props.columnToggle ||
    props.showDensityToggle ||
    (props.selectable && selected.value.length > 0),
)

const scrollStyle = computed(() =>
  props.maxHeight ? { maxHeight: props.maxHeight, overflowY: 'auto' } : null,
)
</script>

<template>
  <div
    class="tw:relative tw:w-full tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:shadow-raised tw:overflow-hidden tw:flex tw:flex-col"
  >
    <!-- Loading bar -->
    <div
      v-if="loading"
      class="tw:absolute tw:top-0 tw:left-0 tw:right-0 tw:h-0.5 tw:overflow-hidden tw:z-20"
    >
      <div class="tw:h-full tw:w-2/5 tw:bg-primary tw:animate-slide" />
    </div>

    <!-- Toolbar (bulk actions / density / column toggle) — renders only when used -->
    <div
      v-if="hasToolbar"
      class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-divider tw:bg-main tw:px-4 tw:py-2"
    >
      <div class="tw:flex tw:min-h-7 tw:items-center tw:gap-3">
        <template v-if="selectable && selected.length > 0">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main">
            {{ selected.length }} selected
          </span>
          <slot name="bulk-actions" :selected="selected" :clear="() => (selected = [])" />
        </template>
        <slot name="toolbar-left" />
      </div>

      <div class="tw:flex tw:items-center tw:gap-1">
        <slot name="toolbar" />
        <button
          v-if="showDensityToggle"
          class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main tw:transition-colors"
          :title="isCompact ? 'Comfortable rows' : 'Compact rows'"
          @click="density = isCompact ? 'comfortable' : 'compact'"
        >
          <IconLineHeight :size="16" />
          <span class="tw:hidden sm:tw:inline">{{ isCompact ? 'Compact' : 'Comfortable' }}</span>
        </button>

        <BasePopover v-if="columnToggle" placement="bottom-end">
          <template #button>
            <button
              class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main tw:transition-colors"
              title="Columns"
            >
              <IconColumns :size="16" />
              <span class="tw:hidden sm:tw:inline">Columns</span>
            </button>
          </template>
          <template #content>
            <div class="tw:w-52 tw:p-1">
              <button
                v-for="col in columns.filter((c) => c.label && c.hideable !== false)"
                :key="col.name"
                class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:transition-colors"
                :class="
                  col.hideable === false
                    ? 'tw:cursor-not-allowed tw:opacity-50'
                    : 'tw:hover:bg-main-hover'
                "
                @click="toggleColumn(col)"
              >
                <span class="tw:truncate">{{ col.label }}</span>
                <IconCheck
                  v-if="!hiddenCols.has(col.name)"
                  :size="15"
                  class="tw:shrink-0 tw:text-primary"
                />
              </button>
            </div>
          </template>
        </BasePopover>
      </div>
    </div>

    <!-- Scrollable container -->
    <div
      class="tw:overflow-x-auto tw:transition-opacity tw:duration-200"
      :class="loading ? 'tw:opacity-50 tw:pointer-events-none' : 'tw:opacity-100'"
      :style="scrollStyle"
    >
      <table class="tw:w-full tw:min-w-125 tw:border-collapse tw:text-sm">
        <thead>
          <tr>
            <!-- Selection header -->
            <th
              v-if="selectable"
              :class="[
                'tw:w-10 tw:border-b tw:border-divider tw:bg-main tw:px-4 tw:text-center',
                thPadY,
                stickyClass,
              ]"
            >
              <input
                type="checkbox"
                aria-label="Select all rows"
                class="tw:size-4 tw:cursor-pointer tw:rounded tw:border-divider tw:accent-primary tw:align-middle"
                :checked="allSelected"
                :indeterminate.prop="isIndeterminate"
                @change="toggleAll"
              />
            </th>

            <th
              v-for="col in visibleColumns"
              :key="col.name"
              scope="col"
              :aria-sort="ariaSortFor(col)"
              :class="[
                'tw:px-4 tw:text-xs tw:font-bold tw:tracking-widest tw:uppercase tw:whitespace-nowrap tw:select-none tw:border-b tw:border-divider tw:bg-main tw:transition-colors tw:duration-150',
                thPadY,
                stickyClass,
                thAlignClass(col.align),
                col.sortable ? 'tw:hover:bg-main-hover' : '',
                sortColumn === col.name
                  ? 'tw:text-primary tw:bg-main-selected tw:hover:bg-main-selected'
                  : 'tw:text-secondary',
              ]"
            >
              <slot :name="'header-cell-' + col.name" :col="col">
                <!-- Sortable headers are real <button>s (keyboard-operable sort,
                     rule #8); non-sortable headers are plain text. -->
                <component
                  :is="col.sortable ? 'button' : 'div'"
                  :type="col.sortable ? 'button' : undefined"
                  class="tw:inline-flex tw:items-center tw:gap-1.5"
                  :class="[
                    col.align === 'right' ? 'tw:flex-row-reverse' : '',
                    col.sortable
                      ? 'tw:cursor-pointer tw:rounded tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40'
                      : '',
                  ]"
                  @click="col.sortable && handleSort(col)"
                >
                  <span>{{ col.label }}</span>
                  <span
                    v-if="col.sortable"
                    aria-hidden="true"
                    class="tw:inline-flex tw:flex-col tw:gap-px"
                  >
                    <IconCaretUpFilled
                      :size="8"
                      :class="[
                        'tw:transition-opacity tw:duration-150',
                        sortColumn === col.name && sortDirection === 'asc'
                          ? 'tw:opacity-100 tw:text-primary'
                          : 'tw:opacity-25 tw:text-secondary',
                      ]"
                    />
                    <IconCaretDownFilled
                      :size="8"
                      :class="[
                        'tw:transition-opacity tw:duration-150',
                        sortColumn === col.name && sortDirection === 'desc'
                          ? 'tw:opacity-100 tw:text-primary'
                          : 'tw:opacity-25 tw:text-secondary',
                      ]"
                    />
                  </span>
                </component>
              </slot>
            </th>
          </tr>
        </thead>

        <tbody>
          <template v-if="paginatedRows.length > 0">
            <tr
              v-for="(row, rowIndex) in paginatedRows"
              :key="row[rowKey] ?? rowIndex"
              class="tw:border-b tw:border-divider last:tw:border-b-0 tw:transition-colors tw:duration-100 tw:hover:bg-sidebar-hover"
              :class="isRowSelected(row) ? 'tw:bg-main-selected' : ''"
              @click.prevent="emit('row-click', row, rowIndex)"
            >
              <!-- Selection cell -->
              <td
                v-if="selectable"
                class="tw:w-10 tw:px-4 tw:text-center tw:align-middle"
                :class="tdPadY"
                @click.stop
              >
                <input
                  type="checkbox"
                  aria-label="Select row"
                  class="tw:size-4 tw:cursor-pointer tw:rounded tw:border-divider tw:accent-primary tw:align-middle"
                  :checked="isRowSelected(row)"
                  @change="toggleRow(row)"
                />
              </td>

              <td
                v-for="col in visibleColumns"
                :key="col.name"
                :class="[
                  'tw:whitespace-nowrap tw:px-4 tw:text-on-main tw:align-middle tw:leading-snug',
                  tdPadY,
                  tdAlignClass(col.align),
                ]"
              >
                <slot
                  v-if="$slots['body-cell-' + col.name]"
                  :name="'body-cell-' + col.name"
                  :row="row"
                  :col="col"
                  :value="getCellValue(row, col)"
                  :rowIndex="rowIndex"
                />
                <slot
                  v-else-if="$slots['body-cell']"
                  name="body-cell"
                  :row="row"
                  :col="col"
                  :value="getCellValue(row, col)"
                  :rowIndex="rowIndex"
                />
                <span v-else class="tw:tabular-nums">
                  {{ getCellValue(row, col) ?? '—' }}
                </span>
              </td>
            </tr>
          </template>

          <tr v-else>
            <td :colspan="emptyColspan" class="tw:px-4 tw:py-16 tw:text-center">
              <div class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:text-secondary">
                <IconTableOff :size="40" class="tw:text-placeholder" />
                <span class="tw:text-sm tw:font-medium">{{ noDataLabel }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination Footer -->
    <div
      v-if="!hidePagination"
      class="tw:px-4 tw:py-3 tw:border-t tw:border-divider tw:bg-main tw:flex tw:items-center tw:justify-between sm:tw:justify-end tw:gap-6 tw:text-xs tw:text-secondary"
    >
      <div class="tw:flex tw:items-center tw:gap-2">
        <span>Rows per page:</span>
        <select
          :value="pagination.rowsPerPage"
          class=""
          @change="updatePagination({ rowsPerPage: parseInt($event.target.value), page: 1 })"
        >
          <option v-for="n in [5, 10, 25, 50]" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div class="tw:flex tw:items-center tw:gap-4">
        <span class="tw:font-medium tw:text-on-main">{{ paginationLabel }}</span>
        <div class="tw:flex tw:items-center tw:gap-1">
          <button
            :disabled="pagination.page <= 1"
            aria-label="Previous page"
            class="tw:p-1.5 tw:rounded tw:hover:bg-main-hover tw:disabled:opacity-30 tw:disabled:cursor-not-allowed tw:transition-colors"
            @click="updatePagination({ page: pagination.page - 1 })"
          >
            <IconChevronLeft :size="16" />
          </button>
          <button
            :disabled="pagination.page >= totalPages"
            aria-label="Next page"
            class="tw:p-1.5 tw:rounded tw:hover:bg-main-hover tw:disabled:opacity-30 tw:disabled:cursor-not-allowed tw:transition-colors"
            @click="updatePagination({ page: pagination.page + 1 })"
          >
            <IconChevronRight :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes slide {
  0% {
    transform: translateX(-150%);
  }
  100% {
    transform: translateX(350%);
  }
}

.tw\:animate-slide {
  animation: slide 1.2s ease-in-out infinite;
}
</style>
