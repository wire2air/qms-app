<script setup>
/**
 * AI usage "recent calls" table. Server-paginated (offset/limit) — rendered via
 * the shared DataTable in manual-pagination mode: the engine stops slicing,
 * `total` drives the page count, and page changes are translated back to the
 * parent's offset via the `page` event. Read-only metric rows (no nav/actions).
 */
import { DateTime } from 'luxon'

const props = defineProps({
  jobs: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  limit: { type: Number, default: 50 },
  offset: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['page'])

// Bridge DataTable's { page, pageSize } pagination to the parent's offset model.
const pagination = computed({
  get: () => ({ page: Math.floor(props.offset / props.limit) + 1, pageSize: props.limit }),
  set: (p) => {
    const next = Math.max(0, ((p?.page ?? 1) - 1) * (p?.pageSize ?? props.limit))
    if (next !== props.offset) emit('page', next)
  },
})

const STATUS_OPTIONS = [
  { value: 'OK', label: 'OK' },
  { value: 'ERROR', label: 'Error' },
  { value: 'REDACTED', label: 'Redacted' },
]

const columns = [
  { name: 'when', label: 'When', field: 'createdAt', align: 'left', filterType: 'date' },
  { name: 'user', label: 'User', field: 'userName', align: 'left' },
  { name: 'task', label: 'Task', field: 'task', align: 'left' },
  { name: 'source', label: 'Source', field: 'source', align: 'left' },
  {
    name: 'status',
    label: 'Status',
    field: 'status',
    align: 'left',
    filterType: 'select',
    filterOptions: STATUS_OPTIONS,
  },
  { name: 'in', label: 'In', field: 'inputTokens', align: 'right', filterType: 'number' },
  { name: 'out', label: 'Out', field: 'outputTokens', align: 'right', filterType: 'number' },
  { name: 'duration', label: 'Duration', field: 'durationMs', align: 'right', filterType: 'number' },
  { name: 'cost', label: 'Cost', field: 'costUsd', align: 'right', filterType: 'number' },
]

function fmtTime(value) {
  if (!value) return ''
  const dt = typeof value === 'string' ? DateTime.fromISO(value) : value
  return dt.toRelative?.() ?? dt.toString()
}
function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
function fmtUsd(n) {
  if (n == null) return '—'
  if (n < 0.0001) return '<$0.0001'
  return `$${Number(n).toFixed(n >= 1 ? 2 : 4)}`
}
function statusClass(s) {
  if (s === 'OK') return 'tw:bg-green-100 tw:text-green-800'
  if (s === 'ERROR') return 'tw:bg-red-100 tw:text-red-800'
  if (s === 'REDACTED') return 'tw:bg-amber-100 tw:text-amber-800'
  return 'tw:bg-gray-100 tw:text-gray-700'
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    :rows="jobs"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    :loading="loading"
    manualPagination
    :total="total"
    densitySelector
    columnManager
    exportManager
    exportFilename="ai-usage-recent-calls.csv"
    persistKey="aiUsage:jobs"
    noDataLabel="No calls yet."
  >
    <template #toolbar-left>
      <span class="tw:text-sm tw:font-semibold tw:text-on-main">Recent calls</span>
    </template>

    <template #body-cell-when="{ row }">
      <span class="tw:text-secondary tw:text-xs tw:whitespace-nowrap">{{ fmtTime(row.createdAt) }}</span>
    </template>

    <template #body-cell-user="{ row }">
      <span class="tw:whitespace-nowrap">{{ row.userName || '—' }}</span>
    </template>

    <template #body-cell-task="{ row }">
      <span class="tw:text-xs tw:whitespace-nowrap">{{ row.task }}</span>
    </template>

    <template #body-cell-source="{ row }">
      <span class="tw:text-secondary tw:text-xs tw:whitespace-nowrap">{{ row.source }}</span>
    </template>

    <template #body-cell-status="{ row }">
      <span
        class="tw:text-xs tw:px-1.5 tw:py-0.5 tw:rounded tw:font-semibold"
        :class="statusClass(row.status)"
      >
        {{ row.status }}
      </span>
    </template>

    <template #body-cell-in="{ row }">
      <span class="tw:text-xs">{{ row.inputTokens ?? '—' }}</span>
    </template>

    <template #body-cell-out="{ row }">
      <span class="tw:text-xs">{{ row.outputTokens ?? '—' }}</span>
    </template>

    <template #body-cell-duration="{ row }">
      <span class="tw:text-xs">{{ fmtMs(row.durationMs) }}</span>
    </template>

    <template #body-cell-cost="{ row }">
      <span class="tw:text-xs">{{ fmtUsd(row.costUsd) }}</span>
    </template>
  </DataTable>
</template>
