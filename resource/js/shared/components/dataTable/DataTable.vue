<script setup>
/**
 * DataTable — the presentational shell (Layer 2) of the enterprise table system.
 *
 * Engine-backed by useDataTable (TanStack v8) but renders cells through OUR slots
 * (`#body-cell-{name}`, `#header-cell-{name}`, `#body-cell` fallback), so it is a
 * drop-in successor to the legacy BaseTable ergonomics. Adds: full state machine
 * (skeleton / empty / no-results / error / denied / offline), 3-level density,
 * multi-sort, sticky header, and keyboard-operable rows (rule #8 / WCAG 2.1.1).
 *
 * Public state is exposed as v-models in clean, modern shapes:
 *   v-model:pagination = { page, pageSize }
 *   v-model:selected   = Array<rowKey>
 *   v-model:sort       = Array<{ id, desc }>
 *   v-model:density    = 'compact' | 'cozy' | 'comfortable'
 *   v-model:search     = string   (drives global filter)
 *
 * Phase 0 of the rebuild — see
 * docs/superpowers/specs/2026-06-25-base-table-system-rebuild-blueprint.md
 */
import { IconCaretUpFilled, IconCaretDownFilled, IconDownload, IconChevronRight } from '@tabler/icons-vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useDataTable, getCellValue } from './useDataTable.js'
import { applyFilterGroup } from './filterModel.js'
import { rowsToCsv, downloadCsv } from './exportCsv.js'

const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  rowKey: { type: [String, Function], default: 'id' },
  loading: { type: Boolean, default: false },
  error: { type: [String, Object], default: null },
  // Force a state; 'auto' derives it from loading/error/data. Use the explicit
  // values for states the table can't infer (denied/offline).
  state: {
    type: String,
    default: 'auto',
    validator: (v) =>
      ['auto', 'ready', 'skeleton', 'empty', 'no-results', 'error', 'denied', 'offline'].includes(
        v,
      ),
  },
  selectable: { type: Boolean, default: false },
  multiSort: { type: Boolean, default: false },
  stickyHeader: { type: Boolean, default: true },
  maxHeight: { type: String, default: null },
  hidePagination: { type: Boolean, default: false },
  // Server mode: engine stops slicing; `total` drives pagination count.
  manualPagination: { type: Boolean, default: false },
  total: { type: Number, default: null },
  noDataLabel: { type: String, default: null },
  noResultsLabel: { type: String, default: null },
  skeletonRows: { type: Number, default: 8 },
  ariaLabel: { type: String, default: 'Data table' },
  // --- toolbar features (opt-in) ---
  searchable: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: 'Search…' },
  columnManager: { type: Boolean, default: false },
  densitySelector: { type: Boolean, default: false },
  // Config-driven bulk actions; falls back to the #bulk-actions slot if empty.
  bulkActions: { type: Array, default: () => [] },
  // Row windowing for large datasets. true, or { estimateRowHeight }. Implies an
  // internal scroll region (defaults maxHeight to 60vh) and disables pagination.
  virtualize: { type: [Boolean, Object], default: false },
  // Opt-in: below `mobileBreakpoint` render a stacked card list instead of a
  // horizontal-scroll table. Off by default (cards read best when columns declare
  // a `mobile` priority); set `mobileCards` (true) per table to enable.
  mobileCards: { type: Boolean, default: false },
  mobileBreakpoint: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
  // Per-row actions (array or row→array). When set, a right-aligned actions column
  // is appended automatically and rendered via TableRowActions (and in mobile cards).
  rowActions: { type: [Array, Function], default: null },
  // Show the Linear-style filter bar. Columns become filterable unless they set
  // `filterType: false`; declare `filterType`/`filterOptions` for richer operators.
  filterable: { type: Boolean, default: false },
  // Show an Export button that downloads the filtered + sorted rows as CSV.
  // Columns can supply `exportValue(row)` to control their serialized value.
  exportable: { type: Boolean, default: false },
  exportFilename: { type: String, default: 'export.csv' },
  // Expandable detail rows. true, or (row)→bool to gate per row. Renders an
  // expander column + a full-width detail row via the #row-detail slot.
  expandable: { type: [Boolean, Function], default: false },
  // Drag-to-resize column widths (uses fixed table layout while enabled). Columns
  // can opt out individually with `resizable: false`.
  resizableColumns: { type: Boolean, default: false },
  // When set, persists view state (density, sort, filters, column visibility +
  // pinning) to localStorage under this key. Scope it per user/table for privacy.
  persistKey: { type: String, default: null },
})

const emit = defineEmits([
  'row-click',
  'row-dblclick',
  'row-contextmenu',
  'row-expand',
  'retry',
])

const pagination = defineModel('pagination', {
  type: Object,
  default: () => ({ page: 1, pageSize: 50 }),
})
const selected = defineModel('selected', { type: Array, default: () => [] })
const sort = defineModel('sort', { type: Array, default: () => [] })
const density = defineModel('density', { type: String, default: 'comfortable' })
const search = defineModel('search', { type: String, default: '' })
const filters = defineModel('filters', { type: Object, default: null })

// Append a synthetic, non-sortable, non-hideable actions column when rowActions is set.
const ACTIONS_COL = {
  name: '__actions',
  label: '',
  field: () => null,
  sortable: false,
  hideable: false,
  align: 'right',
}
const effectiveColumns = computed(() =>
  props.rowActions ? [...props.columns, ACTIONS_COL] : props.columns,
)
function resolveRowActions(row) {
  return typeof props.rowActions === 'function' ? props.rowActions(row) : props.rowActions || []
}

// --- structured filters (Linear-style) ---------------------------------------
const filterableColumns = computed(() =>
  props.columns
    .filter((c) => c.filterType !== false && c.label && c.name !== '__actions')
    .map((c) => ({ ...c, filterType: c.filterType || 'text' })),
)
const filterColByName = computed(() =>
  Object.fromEntries(filterableColumns.value.map((c) => [c.name, c])),
)
// In client mode the filter group is applied before the engine; in server mode the
// caller owns filtering (the v-model still emits the group for the request).
const sourceRows = computed(() =>
  props.manualPagination
    ? props.rows
    : applyFilterGroup(props.rows, filters.value, filterColByName.value),
)

const { table } = useDataTable({
  columns: () => effectiveColumns.value,
  rows: () => sourceRows.value,
  rowKey: () => props.rowKey,
  selectable: () => props.selectable,
  multiSort: () => props.multiSort,
  manualPagination: () => props.manualPagination,
  expandable: () => props.expandable,
  resizableColumns: () => props.resizableColumns,
})

// --- two-way sync between the public v-models and engine state ---------------
function selectionObj(keys) {
  const o = {}
  for (const k of keys || []) o[String(k)] = true
  return o
}
function selectionKeys(obj) {
  return Object.keys(obj).filter((k) => obj[k])
}
function sameSet(a, b) {
  if (a.length !== b.length) return false
  const s = new Set(a.map(String))
  return b.every((x) => s.has(String(x)))
}
// Raw (original-typed) row key, so we can write selected ids back to the parent in
// their original type instead of the stringified ids the engine uses internally.
function rawRowKey(row) {
  return typeof props.rowKey === 'function' ? props.rowKey(row) : row[props.rowKey]
}

watch(
  selected,
  (val) => {
    const next = selectionObj(val)
    if (!sameSet(selectionKeys(next), selectionKeys(table.getState().rowSelection))) {
      table.setRowSelection(next)
    }
  },
  { immediate: true, deep: true },
)
watch(
  () => table.getState().rowSelection,
  (sel) => {
    const keys = selectionKeys(sel)
    if (sameSet(keys, selected.value || [])) return
    // Map the engine's stringified keys back to original-typed values via the
    // loaded rows, so a consumer binding numeric ids gets numbers back.
    const byStr = new Map(props.rows.map((r) => [String(rawRowKey(r)), rawRowKey(r)]))
    selected.value = keys.map((k) => (byStr.has(k) ? byStr.get(k) : k))
  },
  { deep: true },
)

watch(
  pagination,
  (p) => {
    const pageIndex = Math.max(0, (p?.page ?? 1) - 1)
    const pageSize = p?.pageSize ?? 50
    const cur = table.getState().pagination
    if (cur.pageIndex !== pageIndex || cur.pageSize !== pageSize) {
      table.setPagination({ pageIndex, pageSize })
    }
  },
  { immediate: true, deep: true },
)
watch(
  () => table.getState().pagination,
  (p) => {
    const page = p.pageIndex + 1
    if ((pagination.value?.page ?? 1) !== page || (pagination.value?.pageSize ?? 50) !== p.pageSize) {
      pagination.value = { ...(pagination.value || {}), page, pageSize: p.pageSize }
    }
  },
  { deep: true },
)

watch(
  sort,
  (s) => {
    if (JSON.stringify(s || []) !== JSON.stringify(table.getState().sorting)) {
      table.setSorting([...(s || [])])
    }
  },
  { immediate: true, deep: true },
)
watch(
  () => table.getState().sorting,
  (s) => {
    if (JSON.stringify(s) !== JSON.stringify(sort.value || [])) sort.value = [...s]
  },
  { deep: true },
)

watch(
  search,
  (v) => {
    if ((v || '') !== (table.getState().globalFilter || '')) table.setGlobalFilter(v || '')
  },
  { immediate: true },
)
watch(
  () => table.getState().globalFilter,
  (v) => {
    if ((v || '') !== (search.value || '')) search.value = v || ''
  },
)

// --- derived view data -------------------------------------------------------
const leafColumns = computed(() => table.getVisibleLeafColumns())
const headerById = computed(() =>
  Object.fromEntries((table.getHeaderGroups()[0]?.headers ?? []).map((h) => [h.column.id, h])),
)
const filteredCount = computed(() => table.getFilteredRowModel().rows.length)
const totalRows = computed(() => props.total ?? filteredCount.value)

// Paginated rows (the standard, bounded render set).
const pagedRows = computed(() => table.getRowModel().rows)
// All filtered + sorted rows (unpaginated) — the set we window over when virtualizing.
const allSortedRows = computed(() => table.getSortedRowModel().rows)

// --- virtualization ----------------------------------------------------------
const scrollRef = ref(null)
const rowEstimate = computed(() => {
  if (typeof props.virtualize === 'object' && props.virtualize.estimateRowHeight) {
    return props.virtualize.estimateRowHeight
  }
  return density.value === 'compact' ? 37 : density.value === 'cozy' ? 41 : 49
})
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.virtualize ? allSortedRows.value.length : 0,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => rowEstimate.value,
    overscan: 8,
  })),
)
const virtualItems = computed(() => rowVirtualizer.value.getVirtualItems())
const virtualPaddingTop = computed(() => virtualItems.value[0]?.start ?? 0)
const virtualPaddingBottom = computed(() => {
  const last = virtualItems.value.at(-1)
  return rowVirtualizer.value.getTotalSize() - (last?.end ?? 0)
})
function measureRow(el) {
  if (el) rowVirtualizer.value.measureElement(el)
}

// --- mobile cards (single DOM: render cards OR table, switched by viewport) ---
const BP_PX = { sm: 640, md: 768, lg: 1024 }
const isMobileViewport = useMediaQuery(
  computed(() => `(max-width: ${(BP_PX[props.mobileBreakpoint] || 768) - 1}px)`),
)
const useCards = computed(() => props.mobileCards && isMobileViewport.value)

// Rows to render in the table body: windowed when virtualizing, else paginated.
const tableRows = computed(() => {
  if (props.virtualize) {
    return virtualItems.value
      .map((vi) => ({ row: allSortedRows.value[vi.index], index: vi.index }))
      .filter((x) => x.row)
  }
  return pagedRows.value.map((row) => ({ row, index: row.index }))
})
// Cards stay bounded (always paginated) so a mobile device never renders 10k cards.
const cardRows = computed(() => pagedRows.value.map((row) => ({ row, index: row.index })))

// Mobile column grouping: explicit `mobile` priority wins; otherwise the first
// column is the title and the rest become meta rows.
const mobilePrimaryCol = computed(
  () => props.columns.find((c) => c.mobile === 'primary') || props.columns[0] || null,
)
const mobileSecondaryCols = computed(() => props.columns.filter((c) => c.mobile === 'secondary'))
const mobileMetaCols = computed(() =>
  props.columns.filter(
    (c) =>
      c !== mobilePrimaryCol.value &&
      c.mobile !== 'hidden' &&
      c.mobile !== 'primary' &&
      c.mobile !== 'secondary',
  ),
)

const currentState = computed(() => {
  if (props.state !== 'auto') return props.state
  if (props.error) return 'error'
  if (props.loading && props.rows.length === 0) return 'skeleton'
  if (filteredCount.value === 0) return props.rows.length === 0 ? 'empty' : 'no-results'
  return 'ready'
})
const isReady = computed(() => currentState.value === 'ready')
const isSkeleton = computed(() => currentState.value === 'skeleton')
const showLoadingBar = computed(() => props.loading && !isSkeleton.value)

const emptyVariant = computed(() => {
  const s = currentState.value
  return ['empty', 'no-results', 'error', 'denied', 'offline'].includes(s) ? s : 'empty'
})
const emptyTitle = computed(() => {
  if (emptyVariant.value === 'empty' && props.noDataLabel) return props.noDataLabel
  if (emptyVariant.value === 'no-results' && props.noResultsLabel) return props.noResultsLabel
  return null
})

// --- density -----------------------------------------------------------------
const DENSITY = {
  compact: { th: 'tw:py-2', td: 'tw:py-1.5' },
  cozy: { th: 'tw:py-2.5', td: 'tw:py-2' },
  comfortable: { th: 'tw:py-3', td: 'tw:py-3' },
}
const pad = computed(() => DENSITY[density.value] ?? DENSITY.comfortable)
const stickyClass = computed(() => (props.stickyHeader ? 'tw:sticky tw:top-0 tw:z-1' : ''))
const effectiveMaxHeight = computed(() => props.maxHeight || (props.virtualize ? '60vh' : null))
const scrollStyle = computed(() =>
  effectiveMaxHeight.value ? { maxHeight: effectiveMaxHeight.value, overflowY: 'auto' } : null,
)
const emptyColspan = computed(
  () => leafColumns.value.length + (props.selectable ? 1 : 0) + (props.expandable ? 1 : 0),
)

function toggleExpand(row, event) {
  event?.stopPropagation()
  row.toggleExpanded()
  emit('row-expand', row.original, row.getIsExpanded())
}

function alignTh(align) {
  return align === 'right' ? 'tw:text-right' : align === 'center' ? 'tw:text-center' : 'tw:text-left'
}
function alignTd(align) {
  return align === 'right'
    ? 'tw:text-right'
    : align === 'center'
      ? 'tw:text-center'
      : 'tw:text-left'
}
function ariaSort(column) {
  if (!column.getCanSort()) return undefined
  const s = column.getIsSorted()
  return s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : 'none'
}

// --- column pinning (sticky left/right) --------------------------------------
// Pinned columns render at a fixed width so the sticky offsets stay exact.
const selColWidth = computed(() => (props.selectable ? 40 : 0))
const lastLeftPinnedId = computed(() => {
  const l = table.getLeftVisibleLeafColumns()
  return l.length ? l[l.length - 1].id : null
})
const firstRightPinnedId = computed(() => {
  const r = table.getRightVisibleLeafColumns()
  return r.length ? r[0].id : null
})
function pinStyle(column, isHeader) {
  const side = column.getIsPinned()
  if (!side) return undefined
  const w = column.getSize()
  const style = {
    position: 'sticky',
    width: `${w}px`,
    minWidth: `${w}px`,
    maxWidth: `${w}px`,
    zIndex: isHeader ? 12 : 11,
  }
  if (side === 'left') style.left = `${selColWidth.value + column.getStart('left')}px`
  else style.right = `${column.getAfter('right')}px`
  return style
}
function pinBoundaryClass(column) {
  const side = column.getIsPinned()
  if (side === 'left' && column.id === lastLeftPinnedId.value) {
    return 'tw:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.18)]'
  }
  if (side === 'right' && column.id === firstRightPinnedId.value) {
    return 'tw:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.18)]'
  }
  return ''
}

// Pinned columns must be fixed-width (pinStyle handles them); when resizing is on,
// every column gets its engine width so the fixed table layout stays consistent.
function cellStyle(column, isHeader) {
  const pin = pinStyle(column, isHeader)
  if (pin) return pin
  if (props.resizableColumns) return { width: `${column.getSize()}px` }
  return undefined
}

// --- keyboard-operable rows (rule #8 / WCAG 2.1.1, 4.1.2) --------------------
const instance = getCurrentInstance()
const rowInteractive = computed(() => {
  const vp = instance?.vnode?.props || {}
  return Boolean(vp.onRowClick || vp['onRow-click'])
})
function activateRow(row, event) {
  emit('row-click', row.original, row.index, event)
}

// Slot helpers
const slots = useSlots()
function hasBodyCellSlot(name) {
  return !!slots['body-cell-' + name]
}

// --- toolbar -----------------------------------------------------------------
const selectedCount = computed(() => selected.value?.length ?? 0)
const inBulkMode = computed(() => props.selectable && selectedCount.value > 0)
const showToolbar = computed(
  () =>
    !!slots.toolbar ||
    !!slots['toolbar-left'] ||
    props.searchable ||
    props.columnManager ||
    props.densitySelector ||
    props.exportable ||
    inBulkMode.value,
)
function clearSelection() {
  selected.value = []
}
function handleExport() {
  const cols = leafColumns.value
    .map((c) => c.columnDef.meta.col)
    .filter((c) => c.name !== '__actions')
  const exportRows = allSortedRows.value.map((r) => r.original)
  downloadCsv(rowsToCsv(exportRows, cols), props.exportFilename)
}

// --- view-state persistence (opt-in via persistKey) --------------------------
// Persists density/sort/filters/column visibility+pinning through an injected
// adapter — the app provides one backed by the synced `User.settings` bag
// (IndexedDB + cross-device sync via the syncEngine; see useDataTablePersist).
// DataTable stays decoupled from the app/session layer: no provider (Storybook,
// isolated tests) simply means no persistence.
const viewPersist = inject('qms:dataTableViewPersist', null)
if (props.persistKey && viewPersist) {
  function persistReady() {
    return viewPersist.ready?.value ?? true
  }

  function snapshotState() {
    const s = table.getState()
    return {
      density: density.value,
      sort: sort.value,
      filters: filters.value,
      columnVisibility: s.columnVisibility,
      columnOrder: s.columnOrder,
      columnPinning: s.columnPinning,
    }
  }

  let applied = false
  let baseline = null
  function applyPersisted() {
    if (applied) return
    applied = true
    const saved = viewPersist.get(props.persistKey)
    if (saved) {
      if (saved.density) density.value = saved.density
      if (Array.isArray(saved.sort)) sort.value = saved.sort
      if (saved.filters !== undefined) filters.value = saved.filters
      if (saved.columnVisibility) table.setColumnVisibility(saved.columnVisibility)
      if (Array.isArray(saved.columnOrder)) table.setColumnOrder(saved.columnOrder)
      if (saved.columnPinning) table.setColumnPinning(saved.columnPinning)
    }
    baseline = JSON.stringify(snapshotState())
  }
  // The user row loads async from IDB — apply once the adapter reports ready.
  watch(persistReady, (ready) => ready && applyPersisted(), { immediate: true })

  const persistState = useDebounceFn(async () => {
    if (!persistReady() || !applied) return
    const next = JSON.stringify(snapshotState())
    if (next === baseline) return // unchanged since last load/save
    baseline = next
    await viewPersist.set(props.persistKey, JSON.parse(next))
  }, 500)
  watch(
    [
      density,
      sort,
      filters,
      () => table.getState().columnVisibility,
      () => table.getState().columnOrder,
      () => table.getState().columnPinning,
    ],
    () => applied && persistState(),
    { deep: true },
  )
}

// Advanced consumers can reach the engine (e.g. to drive a custom toolbar).
defineExpose({ table })
</script>

<template>
  <div
    class="tw:relative tw:flex tw:w-full tw:flex-col tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:shadow-raised"
  >
    <!-- Indeterminate loading bar (when refreshing over existing rows) -->
    <div
      v-if="showLoadingBar"
      class="tw:absolute tw:top-0 tw:right-0 tw:left-0 tw:z-20 tw:h-0.5 tw:overflow-hidden"
    >
      <div class="tw:h-full tw:w-2/5 tw:bg-primary tw:animate-slide" />
    </div>

    <!-- Toolbar region: bulk bar / search / slots / density / column manager -->
    <div
      v-if="showToolbar"
      class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-divider tw:bg-main tw:px-4 tw:py-2"
    >
      <div class="tw:flex tw:min-h-7 tw:min-w-0 tw:flex-1 tw:items-center tw:gap-3">
        <template v-if="inBulkMode">
          <TableBulkActionBar
            v-if="bulkActions.length"
            :count="selectedCount"
            :selected="selected"
            :actions="bulkActions"
            @clear="clearSelection"
          />
          <template v-else>
            <span class="tw:text-sm tw:font-semibold tw:text-on-main">
              {{ selectedCount }} selected
            </span>
            <slot name="bulk-actions" :selected="selected" :clear="clearSelection" />
          </template>
        </template>
        <slot v-else name="toolbar-left" />
      </div>

      <div class="tw:flex tw:items-center tw:gap-1">
        <TableSearch
          v-if="searchable"
          v-model="search"
          :placeholder="searchPlaceholder"
          class="tw:mr-1"
        />
        <slot name="toolbar" />
        <button
          v-if="exportable"
          type="button"
          title="Export CSV"
          class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
          @click="handleExport"
        >
          <IconDownload :size="16" />
          <span class="tw:hidden sm:tw:inline">Export</span>
        </button>
        <TableDensitySelector v-if="densitySelector" v-model="density" />
        <TableColumnManager v-if="columnManager" :table="table" />
      </div>
    </div>

    <!-- Filter bar (Linear-style chips + add-filter) -->
    <div
      v-if="filterable"
      class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-main tw:px-4 tw:py-2"
    >
      <TableFilters v-model="filters" :columns="filterableColumns" />
    </div>

    <!-- Scroll container -->
    <div
      ref="scrollRef"
      class="tw:overflow-x-auto tw:transition-opacity tw:duration-200"
      :class="showLoadingBar ? 'tw:opacity-60' : 'tw:opacity-100'"
      :style="scrollStyle"
    >
      <DataTableSkeleton
        v-if="isSkeleton"
        :columns="columns"
        :rows="skeletonRows"
        :selectable="selectable"
        :density="density"
      />

      <!-- Empty / no-results / error / denied / offline — once, for every viewport -->
      <slot v-else-if="!isReady" :name="emptyVariant">
        <DataTableEmptyState
          :variant="emptyVariant"
          :title="emptyTitle"
          :error="error"
          @retry="emit('retry')"
        />
      </slot>

      <!-- Mobile: stacked cards (not a shrunk grid) -->
      <div v-else-if="useCards" class="tw:flex tw:flex-col tw:gap-2 tw:p-2">
        <div
          v-for="item in cardRows"
          :key="item.row.id"
          :tabindex="rowInteractive ? 0 : undefined"
          :role="rowInteractive ? 'button' : undefined"
          :aria-selected="selectable ? item.row.getIsSelected() : undefined"
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-3 tw:transition-colors tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/50"
          :class="[
            item.row.getIsSelected() ? 'tw:bg-main-selected' : '',
            rowInteractive ? 'tw:cursor-pointer tw:hover:bg-main-hover' : '',
          ]"
          @click="rowInteractive && activateRow(item.row, $event)"
          @keydown.enter.self="rowInteractive && activateRow(item.row, $event)"
          @keydown.space.self.prevent="rowInteractive && activateRow(item.row, $event)"
        >
          <slot name="mobile-card" :row="item.row.original" :index="item.index">
            <div class="tw:flex tw:items-start tw:gap-2.5">
              <input
                v-if="selectable"
                type="checkbox"
                aria-label="Select row"
                class="tw:mt-0.5 tw:size-4 tw:cursor-pointer tw:rounded tw:border-divider tw:accent-primary"
                :checked="item.row.getIsSelected()"
                :disabled="!item.row.getCanSelect()"
                @click.stop
                @change="item.row.getToggleSelectedHandler()($event)"
              />
              <div class="tw:min-w-0 tw:flex-1">
                <div
                  v-if="mobilePrimaryCol"
                  class="tw:truncate tw:text-sm tw:font-semibold tw:text-on-main"
                >
                  <slot
                    v-if="hasBodyCellSlot(mobilePrimaryCol.name)"
                    :name="'body-cell-' + mobilePrimaryCol.name"
                    :row="item.row.original"
                    :col="mobilePrimaryCol"
                    :value="getCellValue(item.row.original, mobilePrimaryCol)"
                    :rowIndex="item.index"
                  />
                  <template v-else>
                    {{ getCellValue(item.row.original, mobilePrimaryCol) ?? '—' }}
                  </template>
                </div>

                <div
                  v-for="col in mobileSecondaryCols"
                  :key="col.name"
                  class="tw:mt-0.5 tw:text-sm tw:text-secondary"
                >
                  <slot
                    v-if="hasBodyCellSlot(col.name)"
                    :name="'body-cell-' + col.name"
                    :row="item.row.original"
                    :col="col"
                    :value="getCellValue(item.row.original, col)"
                    :rowIndex="item.index"
                  />
                  <template v-else>{{ getCellValue(item.row.original, col) ?? '—' }}</template>
                </div>

                <dl
                  v-if="mobileMetaCols.length"
                  class="tw:mt-2.5 tw:grid tw:grid-cols-2 tw:gap-x-3 tw:gap-y-1.5"
                >
                  <div v-for="col in mobileMetaCols" :key="col.name" class="tw:flex tw:flex-col tw:gap-0.5">
                    <dt class="tw:text-micro tw:font-medium tw:tracking-wide tw:text-placeholder tw:uppercase">
                      {{ col.label }}
                    </dt>
                    <dd class="tw:text-sm tw:text-on-main">
                      <slot
                        v-if="hasBodyCellSlot(col.name)"
                        :name="'body-cell-' + col.name"
                        :row="item.row.original"
                        :col="col"
                        :value="getCellValue(item.row.original, col)"
                        :rowIndex="item.index"
                      />
                      <template v-else>{{ getCellValue(item.row.original, col) ?? '—' }}</template>
                    </dd>
                  </div>
                </dl>
              </div>
              <TableRowActions
                v-if="rowActions"
                :actions="resolveRowActions(item.row.original)"
                :row="item.row.original"
                class="tw:shrink-0"
              />
            </div>
          </slot>
        </div>
      </div>

      <!-- Desktop: table -->
      <table
        v-else
        class="tw:w-full tw:min-w-125 tw:border-collapse tw:text-sm"
        :class="resizableColumns ? 'tw:table-fixed' : ''"
      >
        <caption class="tw:sr-only">
          {{
            ariaLabel
          }}
        </caption>
        <thead>
          <tr>
            <th
              v-if="expandable"
              :class="['tw:w-9 tw:border-b tw:border-divider tw:bg-main', pad.th, stickyClass]"
              :aria-label="'Expand'"
            />
            <th
              v-if="selectable"
              :class="[
                'tw:w-10 tw:border-b tw:border-divider tw:bg-main tw:px-4 tw:text-center',
                pad.th,
                stickyClass,
              ]"
            >
              <input
                type="checkbox"
                aria-label="Select all rows on this page"
                class="tw:size-4 tw:cursor-pointer tw:rounded tw:border-divider tw:accent-primary tw:align-middle"
                :checked="table.getIsAllPageRowsSelected()"
                :indeterminate.prop="table.getIsSomePageRowsSelected()"
                @change="table.toggleAllPageRowsSelected()"
              />
            </th>

            <th
              v-for="column in leafColumns"
              :key="column.id"
              scope="col"
              :aria-sort="ariaSort(column)"
              :style="cellStyle(column, true)"
              :class="[
                'tw:relative tw:border-b tw:border-divider tw:bg-main tw:px-4 tw:text-xs tw:font-bold tw:tracking-widest tw:uppercase tw:whitespace-nowrap tw:select-none tw:transition-colors',
                pad.th,
                stickyClass,
                alignTh(column.columnDef.meta.align),
                pinBoundaryClass(column),
                column.getCanSort() ? 'tw:hover:bg-main-hover' : '',
                column.getIsSorted()
                  ? 'tw:bg-main-selected tw:text-primary'
                  : 'tw:text-secondary',
              ]"
            >
              <slot
                :name="'header-cell-' + column.id"
                :col="column.columnDef.meta.col"
                :sorted="column.getIsSorted()"
                :toggleSort="column.getToggleSortingHandler()"
              >
                <component
                  :is="column.getCanSort() ? 'button' : 'div'"
                  :type="column.getCanSort() ? 'button' : undefined"
                  class="tw:inline-flex tw:items-center tw:gap-1.5"
                  :class="[
                    column.columnDef.meta.align === 'right' ? 'tw:flex-row-reverse' : '',
                    column.getCanSort()
                      ? 'tw:cursor-pointer tw:rounded tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40'
                      : '',
                  ]"
                  @click="column.getToggleSortingHandler()?.($event)"
                >
                  <span>{{ column.columnDef.meta.col.label }}</span>
                  <span
                    v-if="column.getCanSort()"
                    aria-hidden="true"
                    class="tw:inline-flex tw:flex-col tw:gap-px"
                  >
                    <IconCaretUpFilled
                      :size="8"
                      :class="
                        column.getIsSorted() === 'asc'
                          ? 'tw:text-primary tw:opacity-100'
                          : 'tw:text-secondary tw:opacity-25'
                      "
                    />
                    <IconCaretDownFilled
                      :size="8"
                      :class="
                        column.getIsSorted() === 'desc'
                          ? 'tw:text-primary tw:opacity-100'
                          : 'tw:text-secondary tw:opacity-25'
                      "
                    />
                  </span>
                  <span
                    v-if="multiSort && column.getSortIndex() >= 0 && column.getIsSorted()"
                    class="tw:ml-0.5 tw:rounded tw:bg-primary/15 tw:px-1 tw:text-[10px] tw:font-semibold tw:text-primary"
                  >
                    {{ column.getSortIndex() + 1 }}
                  </span>
                </component>
              </slot>

              <!-- Resize handle (drag the right edge) -->
              <div
                v-if="resizableColumns && column.getCanResize()"
                data-resize-handle
                role="separator"
                aria-orientation="vertical"
                :aria-label="`Resize ${column.columnDef.meta.col.label}`"
                class="tw:absolute tw:top-0 tw:right-0 tw:z-10 tw:h-full tw:w-1.5 tw:cursor-col-resize tw:touch-none tw:select-none tw:transition-colors hover:tw:bg-primary/40"
                :class="column.getIsResizing() ? 'tw:bg-primary' : ''"
                @click.stop
                @mousedown="headerById[column.id]?.getResizeHandler()?.($event)"
                @touchstart="headerById[column.id]?.getResizeHandler()?.($event)"
              />
            </th>
          </tr>
        </thead>

        <tbody>
          <!-- Virtual top spacer -->
          <tr v-if="virtualize && virtualPaddingTop > 0" aria-hidden="true">
            <td :colspan="emptyColspan" :style="{ height: virtualPaddingTop + 'px', padding: 0 }" />
          </tr>

          <template v-for="item in tableRows" :key="item.row.id">
            <tr
              :ref="virtualize ? measureRow : undefined"
              :data-index="item.index"
              :tabindex="rowInteractive ? 0 : undefined"
              :aria-selected="selectable ? item.row.getIsSelected() : undefined"
              class="tw:border-b tw:border-divider last:tw:border-b-0 tw:transition-colors tw:duration-100 tw:hover:bg-sidebar-hover tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-inset tw:focus-visible:ring-primary/50"
              :class="[
                item.row.getIsSelected() ? 'tw:bg-main-selected' : '',
                rowInteractive ? 'tw:cursor-pointer' : '',
              ]"
              @click="rowInteractive && activateRow(item.row, $event)"
              @dblclick="emit('row-dblclick', item.row.original, item.index, $event)"
              @contextmenu="emit('row-contextmenu', item.row.original, item.index, $event)"
              @keydown.enter.self="rowInteractive && activateRow(item.row, $event)"
              @keydown.space.self.prevent="rowInteractive && activateRow(item.row, $event)"
            >
              <td v-if="expandable" class="tw:w-9 tw:text-center tw:align-middle" :class="pad.td" @click.stop>
                <button
                  v-if="item.row.getCanExpand()"
                  type="button"
                  :aria-expanded="item.row.getIsExpanded()"
                  aria-label="Toggle row details"
                  class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main focus-visible:tw:outline-none focus-visible:tw:ring-2 focus-visible:tw:ring-primary/40"
                  @click="toggleExpand(item.row, $event)"
                >
                  <IconChevronRight
                    :size="15"
                    class="tw:transition-transform tw:duration-150"
                    :class="item.row.getIsExpanded() ? 'tw:rotate-90' : ''"
                  />
                </button>
              </td>

              <td
                v-if="selectable"
                class="tw:w-10 tw:px-4 tw:text-center tw:align-middle"
                :class="pad.td"
                @click.stop
              >
                <input
                  type="checkbox"
                  aria-label="Select row"
                  class="tw:size-4 tw:cursor-pointer tw:rounded tw:border-divider tw:accent-primary tw:align-middle"
                  :checked="item.row.getIsSelected()"
                  :disabled="!item.row.getCanSelect()"
                  @change="item.row.getToggleSelectedHandler()($event)"
                />
              </td>

              <td
                v-for="column in leafColumns"
                :key="column.id"
                :style="cellStyle(column, false)"
                :class="[
                  'tw:px-4 tw:align-middle tw:leading-snug tw:whitespace-nowrap tw:text-on-main',
                  resizableColumns ? 'tw:overflow-hidden tw:text-ellipsis' : '',
                  pad.td,
                  alignTd(column.columnDef.meta.align),
                  pinBoundaryClass(column),
                  column.getIsPinned()
                    ? item.row.getIsSelected()
                      ? 'tw:bg-main-selected'
                      : 'tw:bg-sidebar'
                    : '',
                ]"
              >
                <TableRowActions
                  v-if="column.id === '__actions'"
                  :actions="resolveRowActions(item.row.original)"
                  :row="item.row.original"
                />
                <slot
                  v-else-if="hasBodyCellSlot(column.id)"
                  :name="'body-cell-' + column.id"
                  :row="item.row.original"
                  :col="column.columnDef.meta.col"
                  :value="getCellValue(item.row.original, column.columnDef.meta.col)"
                  :rowIndex="item.index"
                />
                <slot
                  v-else-if="$slots['body-cell']"
                  name="body-cell"
                  :row="item.row.original"
                  :col="column.columnDef.meta.col"
                  :value="getCellValue(item.row.original, column.columnDef.meta.col)"
                  :rowIndex="item.index"
                />
                <span v-else class="tw:tabular-nums">
                  {{ getCellValue(item.row.original, column.columnDef.meta.col) ?? '—' }}
                </span>
              </td>
            </tr>

            <tr v-if="expandable && item.row.getIsExpanded()" class="tw:bg-main/40">
              <td :colspan="emptyColspan" class="tw:border-b tw:border-divider tw:px-4 tw:py-3">
                <slot name="row-detail" :row="item.row.original" :index="item.index" />
              </td>
            </tr>
          </template>

          <!-- Virtual bottom spacer -->
          <tr v-if="virtualize && virtualPaddingBottom > 0" aria-hidden="true">
            <td
              :colspan="emptyColspan"
              :style="{ height: virtualPaddingBottom + 'px', padding: 0 }"
            />
          </tr>
        </tbody>
      </table>
    </div>

    <BasePagination
      v-if="!hidePagination && isReady && (!virtualize || useCards)"
      :page="pagination.page"
      :rowsPerPage="pagination.pageSize"
      :total="totalRows"
      class="tw:border-t tw:border-divider tw:bg-main tw:px-4 tw:py-3"
      @update:page="pagination = { ...pagination, page: $event }"
      @update:rowsPerPage="pagination = { ...pagination, pageSize: $event, page: 1 }"
    />
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
