/**
 * useDataTable — the headless engine layer (Layer 1) for the enterprise table.
 *
 * Thin wrapper over @tanstack/vue-table v8. This is the ONLY file in the app that
 * imports TanStack — the shell (DataTable.vue) and all consumers talk to *us*, so
 * the engine stays swappable (no lock-in). Cell rendering deliberately does NOT use
 * TanStack's FlexRender: the shell renders through our own `#body-cell-*` /
 * `#header-cell-*` slots, preserving the existing BaseTable ergonomics.
 *
 * The engine owns sorting / filtering / pagination / selection / column visibility,
 * order, pinning and sizing state. State refs are exposed so the shell can two-way
 * bind them to its public v-models.
 *
 * See: docs/superpowers/specs/2026-06-25-base-table-system-rebuild-blueprint.md
 */
import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
} from '@tanstack/vue-table'

/** Resolve a cell value from our column contract (string field, accessor fn, or name). */
export function getCellValue(row, col) {
  if (typeof col.field === 'function') return col.field(row)
  if (col.field == null) return row[col.name]
  return row[col.field]
}

/**
 * Type-aware comparison shared with the legacy BaseTable: numbers numerically,
 * luxon DateTime by millis, everything else via locale compare with numeric
 * collation. nullish values sort last (ascending).
 */
export function compareValues(valA, valB) {
  if (valA == null && valB == null) return 0
  if (valA == null) return 1
  if (valB == null) return -1
  if (typeof valA === 'number' && typeof valB === 'number') return valA - valB
  if (typeof valA?.toMillis === 'function' && typeof valB?.toMillis === 'function') {
    return valA.toMillis() - valB.toMillis()
  }
  return String(valA).localeCompare(String(valB), undefined, { numeric: true })
}

/** Build a TanStack sortingFn for one of our columns (custom comparator wins). */
function makeSortingFn(col) {
  return (rowA, rowB, _columnId) => {
    const a = getCellValue(rowA.original, col)
    const b = getCellValue(rowB.original, col)
    if (typeof col.sort === 'function') return col.sort(a, b, rowA.original, rowB.original)
    return compareValues(a, b)
  }
}

/** Map our ColumnDef[] → TanStack columnDefs. Our `col` rides along in `meta`. */
function toColumnDefs(columns, resizableDefault = false) {
  return columns.map((col) => {
    const def = {
      id: col.name,
      accessorFn: (row) => getCellValue(row, col),
      enableSorting: !!col.sortable,
      enableHiding: col.hideable !== false,
      enableResizing: col.resizable != null ? !!col.resizable : resizableDefault,
      sortingFn: makeSortingFn(col),
      sortUndefined: 'last',
      meta: { col, align: col.align ?? 'left' },
    }
    // Only set explicit sizes when the column asks for them, so non-resizable
    // columns keep their natural content width instead of a forced default.
    if (col.width != null) def.size = col.width
    if (col.minWidth != null) def.minSize = col.minWidth
    if (col.maxWidth != null) def.maxSize = col.maxWidth
    return def
  })
}

/**
 * @param {object} opts
 * @param {() => Array}  opts.columns  getter for our ColumnDef[]
 * @param {() => Array}  opts.rows     getter for the client-mode data rows
 * @param {() => (string|Function)} [opts.rowKey] getter for the row id key/fn (default 'id')
 * @param {() => boolean} [opts.selectable]
 * @param {() => boolean} [opts.multiSort]
 * @param {() => boolean} [opts.manualPagination] true → server mode; engine won't slice
 * @param {object} [opts.initial] initial state slices ({ sorting, pagination, ... })
 */
export function useDataTable(opts) {
  function get(v, fallback) {
    const r = typeof v === 'function' ? v() : v
    return r == null ? fallback : r
  }
  function keyOf(row) {
    const k = get(opts.rowKey, 'id')
    return String(typeof k === 'function' ? k(row) : row[k])
  }

  // --- engine state (the single source of truth; shell binds these out as v-models)
  const sorting = ref(opts.initial?.sorting ?? [])
  const rowSelection = ref(opts.initial?.rowSelection ?? {})
  const pagination = ref(opts.initial?.pagination ?? { pageIndex: 0, pageSize: 50 })
  const globalFilter = ref(opts.initial?.globalFilter ?? '')
  const expanded = ref(opts.initial?.expanded ?? {})
  const columnVisibility = ref(opts.initial?.columnVisibility ?? {})
  const columnOrder = ref(opts.initial?.columnOrder ?? [])
  const columnPinning = ref(opts.initial?.columnPinning ?? { left: [], right: [] })
  const columnSizing = ref(opts.initial?.columnSizing ?? {})

  // Seed each column's declared defaults (`hidden: true`, `pin: 'left'|'right'`)
  // exactly once — when first seen. This runs for columns present at init AND for
  // columns that arrive later (e.g. async custom fields), without clobbering any
  // user/persisted change to a column already tracked.
  const seededDefaults = new Set()
  function seedColumnDefaults(c) {
    if (seededDefaults.has(c.name)) return
    seededDefaults.add(c.name)
    if (c.hidden && !(c.name in columnVisibility.value)) {
      columnVisibility.value = { ...columnVisibility.value, [c.name]: false }
    }
    if (c.pin === 'left' || c.pin === 'right') {
      const known = new Set([...(columnPinning.value.left || []), ...(columnPinning.value.right || [])])
      if (!known.has(c.name)) {
        const next = {
          left: [...(columnPinning.value.left || [])],
          right: [...(columnPinning.value.right || [])],
        }
        next[c.pin].push(c.name)
        columnPinning.value = next
      }
    }
  }
  for (const c of get(opts.columns, [])) seedColumnDefaults(c)
  watch(
    () => get(opts.columns, []).map((c) => c.name).join('|'),
    () => {
      for (const c of get(opts.columns, [])) seedColumnDefaults(c)
    },
  )

  const columnDefs = computed(() =>
    toColumnDefs(get(opts.columns, []), get(opts.resizableColumns, false)),
  )

  function setter(stateRef) {
    return (updater) => {
      stateRef.value = typeof updater === 'function' ? updater(stateRef.value) : updater
    }
  }

  const table = useVueTable({
    get data() {
      return get(opts.rows, [])
    },
    get columns() {
      return columnDefs.value
    },
    state: {
      get sorting() {
        return sorting.value
      },
      get rowSelection() {
        return rowSelection.value
      },
      get pagination() {
        return pagination.value
      },
      get globalFilter() {
        return globalFilter.value
      },
      get expanded() {
        return expanded.value
      },
      get columnVisibility() {
        return columnVisibility.value
      },
      get columnOrder() {
        return columnOrder.value
      },
      get columnPinning() {
        return columnPinning.value
      },
      get columnSizing() {
        return columnSizing.value
      },
    },
    onSortingChange: setter(sorting),
    onRowSelectionChange: setter(rowSelection),
    onPaginationChange: setter(pagination),
    onGlobalFilterChange: setter(globalFilter),
    onExpandedChange: setter(expanded),
    onColumnVisibilityChange: setter(columnVisibility),
    onColumnOrderChange: setter(columnOrder),
    onColumnPinningChange: setter(columnPinning),
    onColumnSizingChange: setter(columnSizing),
    getRowId: (row) => keyOf(row),
    get enableRowSelection() {
      return !!get(opts.selectable, false)
    },
    get enableMultiSort() {
      return !!get(opts.multiSort, false)
    },
    get manualPagination() {
      return !!get(opts.manualPagination, false)
    },
    get getRowCanExpand() {
      const e = get(opts.expandable, false)
      return (row) => (typeof e === 'function' ? e(row.original) : !!e)
    },
    globalFilterFn: 'includesString',
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  return {
    table,
    keyOf,
    state: {
      sorting,
      rowSelection,
      pagination,
      globalFilter,
      expanded,
      columnVisibility,
      columnOrder,
      columnPinning,
      columnSizing,
    },
  }
}
