<script setup>
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

const props = defineProps({
  jobs: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  limit: { type: Number, default: 50 },
  offset: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['page'])

const fromN = computed(() => (props.total === 0 ? 0 : props.offset + 1))
const toN = computed(() => Math.min(props.offset + props.limit, props.total))
const hasPrev = computed(() => props.offset > 0)
const hasNext = computed(() => props.offset + props.limit < props.total)

function prev() {
  if (hasPrev.value) emit('page', Math.max(0, props.offset - props.limit))
}
function next() {
  if (hasNext.value) emit('page', props.offset + props.limit)
}

function fmtTime(value) {
  if (!value) return ''
  // Accept ISO string or Luxon DateTime
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
  <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:overflow-hidden">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-2.5 tw:border-b tw:border-divider"
    >
      <div class="tw:text-sm tw:font-semibold tw:text-on-main">Recent calls</div>
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary">
        <span>{{ fromN }}–{{ toN }} of {{ total }}</span>
        <button
          class="tw:p-1 tw:rounded tw:hover:bg-main-hover tw:transition-colors tw:disabled:opacity-30 tw:disabled:cursor-not-allowed"
          :disabled="!hasPrev || loading"
          @click="prev"
        >
          <IconChevronLeft :size="16" />
        </button>
        <button
          class="tw:p-1 tw:rounded tw:hover:bg-main-hover tw:transition-colors tw:disabled:opacity-30 tw:disabled:cursor-not-allowed"
          :disabled="!hasNext || loading"
          @click="next"
        >
          <IconChevronRight :size="16" />
        </button>
      </div>
    </div>
    <div class="tw:overflow-x-auto">
      <table v-if="jobs.length > 0" class="tw:w-full tw:text-sm">
        <thead>
          <tr class="tw:bg-sidebar/40">
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-left"
            >
              When
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-left"
            >
              User
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-left"
            >
              Task
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-left"
            >
              Source
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-left"
            >
              Status
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-right"
            >
              In
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-right"
            >
              Out
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-right"
            >
              Duration
            </th>
            <th
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:text-right"
            >
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="j in jobs"
            :key="j.id"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
          >
            <td class="tw:px-3 tw:py-2 tw:text-secondary tw:text-xs tw:whitespace-nowrap">
              {{ fmtTime(j.createdAt) }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main tw:whitespace-nowrap">
              {{ j.userName || '—' }}
            </td>
            <td
              class="tw:px-3 tw:py-2 tw:text-on-main tw:font-mono tw:text-xs tw:whitespace-nowrap"
            >
              {{ j.task }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-secondary tw:text-xs tw:whitespace-nowrap">
              {{ j.source }}
            </td>
            <td class="tw:px-3 tw:py-2">
              <span
                class="tw:text-xs tw:px-1.5 tw:py-0.5 tw:rounded tw:font-semibold"
                :class="statusClass(j.status)"
              >
                {{ j.status }}
              </span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main tw:text-right tw:font-mono tw:text-xs">
              {{ j.inputTokens ?? '—' }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main tw:text-right tw:font-mono tw:text-xs">
              {{ j.outputTokens ?? '—' }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main tw:text-right tw:font-mono tw:text-xs">
              {{ fmtMs(j.durationMs) }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main tw:text-right tw:font-mono tw:text-xs">
              {{ fmtUsd(j.costUsd) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else-if="loading" class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
        Loading…
      </div>
      <div v-else class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary">No calls yet.</div>
    </div>
  </div>
</template>
