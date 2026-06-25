<script setup>
/**
 * AI usage breakdown — a small read-only metric table (by task / user / source).
 * Rendered via the shared DataTable. Columns arrive in the legacy
 * { key, label, align?, format? } shape and are mapped to DataTable columns;
 * numeric/currency cells are formatted through a `#body-cell` fallback slot.
 */
const props = defineProps({
  title: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  // [{ key, label, align?: 'right' | 'left', format?: 'usd' | 'number' }]
})

const tableColumns = computed(() =>
  props.columns.map((c) => ({
    name: c.key,
    label: c.label,
    field: c.key,
    align: c.align === 'right' ? 'right' : 'left',
    format: c.format,
    sortable: true,
    filterType: c.align === 'right' || c.format ? 'number' : 'text',
  })),
)

// The first (label) column is the natural row identifier (task / user / source).
const rowKeyField = computed(() => props.columns[0]?.key || 'key')
function rowKey(row) {
  return row[rowKeyField.value]
}

function fmt(value, format) {
  if (value == null) return '—'
  if (format === 'usd') return `$${Number(value).toFixed(Number(value) >= 1 ? 2 : 4)}`
  if (format === 'number') return new Intl.NumberFormat().format(value)
  if (typeof value === 'number') return new Intl.NumberFormat().format(value)
  return value
}
</script>

<template>
  <DataTable
    :rows="rows"
    :columns="tableColumns"
    :rowKey="rowKey"
    :mobileCards="false"
    densitySelector
    columnManager
    exportManager
    :exportFilename="`ai-usage-${title.toLowerCase().replace(/\s+/g, '-')}.csv`"
    :persistKey="`aiUsage:breakdown:${title}`"
    noDataLabel="No data."
  >
    <template #toolbar-left>
      <span class="tw:text-sm tw:font-semibold tw:text-on-main">{{ title }}</span>
    </template>

    <template #body-cell="{ row, col }">
      <span :class="col.align === 'right' ? 'tw:font-mono tw:text-xs' : ''">
        {{ fmt(row[col.name], col.format) }}
      </span>
    </template>
  </DataTable>
</template>
