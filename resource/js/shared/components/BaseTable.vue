<script setup>
/**
 * BaseTable — backward-compatible adapter over <DataTable> (Phase 1 of the table
 * rebuild). It preserves the legacy API exactly — same props, slots, events and
 * v-model shapes — so the existing ~26 consumers keep working unchanged, while all
 * the engine-backed behaviour (TanStack sorting/selection/pagination, the full
 * state machine, keyboard rows, a11y) now comes from DataTable.
 *
 * New tables should use <DataTable> directly to access the richer feature set
 * (filters, virtualization, mobile cards, row actions, pinning, export, persistKey).
 * See docs/superpowers/specs/2026-06-25-base-table-system-rebuild-blueprint.md.
 *
 * Mapping notes:
 *   columnToggle        → DataTable `columnManager`
 *   showDensityToggle   → DataTable `densitySelector`
 *   v-model:pagination  legacy { page, rowsPerPage, sortBy, descending, total }
 *                       is split into DataTable's { page, pageSize } + `sort` + `total`
 *   mobileCards is OFF  → preserves the legacy horizontal-scroll behaviour; tables
 *                         opt into card mode by moving to <DataTable> directly.
 */
defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  rowKey: { type: String, default: 'id' },
  noDataLabel: { type: String, default: 'No data available' },
  hidePagination: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  columnToggle: { type: Boolean, default: false },
  showDensityToggle: { type: Boolean, default: false },
  stickyHeader: { type: Boolean, default: true },
  maxHeight: { type: String, default: null },
})

const emit = defineEmits(['row-click'])

const pagination = defineModel('pagination', {
  type: Object,
  default: () => ({ page: 1, rowsPerPage: 50, sortBy: null, descending: false, total: null }),
})
const selected = defineModel('selected', { type: Array, default: () => [] })
const density = defineModel('density', { type: String, default: 'comfortable' })

// Bridge the legacy pagination shape ↔ DataTable's { page, pageSize }.
const dtPagination = computed({
  get: () => ({ page: pagination.value?.page ?? 1, pageSize: pagination.value?.rowsPerPage ?? 50 }),
  set: (v) => {
    pagination.value = { ...pagination.value, page: v.page, rowsPerPage: v.pageSize }
  },
})
// Bridge the legacy sortBy/descending ↔ DataTable's SortRule[].
const dtSort = computed({
  get: () =>
    pagination.value?.sortBy
      ? [{ id: pagination.value.sortBy, desc: !!pagination.value.descending }]
      : [],
  set: (v) => {
    const s = v[0]
    pagination.value = {
      ...pagination.value,
      sortBy: s?.id ?? null,
      descending: s?.desc ?? false,
    }
  },
})

// Only make rows interactive when the consumer actually listens for row-click —
// passing `undefined` keeps DataTable's rows inert (same detection it uses).
const instance = getCurrentInstance()
const hasRowClick = computed(() => {
  const vp = instance?.vnode?.props || {}
  return Boolean(vp.onRowClick || vp['onRow-click'])
})
function forwardRowClick(row, index, event) {
  emit('row-click', row, index, event)
}
</script>

<template>
  <DataTable
    v-model:pagination="dtPagination"
    v-model:selected="selected"
    v-model:sort="dtSort"
    v-model:density="density"
    :columns="columns"
    :rows="rows"
    :loading="loading"
    :rowKey="rowKey"
    :noDataLabel="noDataLabel"
    :hidePagination="hidePagination"
    :selectable="selectable"
    :columnManager="columnToggle"
    :densitySelector="showDensityToggle"
    :stickyHeader="stickyHeader"
    :maxHeight="maxHeight"
    :total="pagination?.total ?? null"
    :mobileCards="false"
    :onRowClick="hasRowClick ? forwardRowClick : undefined"
  >
    <!-- Forward every legacy slot through verbatim (body-cell-*, header-cell-*,
         toolbar, toolbar-left, bulk-actions, …). -->
    <template v-for="(_, name) in $slots" #[name]="scope">
      <slot :name="name" v-bind="scope ?? {}" />
    </template>
  </DataTable>
</template>
