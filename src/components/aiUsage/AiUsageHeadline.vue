<script setup>
import {
  IconActivity,
  IconCircleCheck,
  IconAlertTriangle,
  IconCurrencyDollar,
  IconClock,
} from '@tabler/icons-vue'

const props = defineProps({
  overview: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

const h = computed(() => props.overview?.headline ?? {})

function fmtNumber(n) {
  return new Intl.NumberFormat().format(n ?? 0)
}
function fmtUsd(n) {
  if (n == null) return '—'
  return `$${Number(n).toFixed(n >= 1 ? 2 : 4)}`
}
function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

const errorRate = computed(() => {
  if (!h.value.totalCalls) return 0
  return Math.round((h.value.errorCalls / h.value.totalCalls) * 100)
})
</script>

<template>
  <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-3 tw:lg:grid-cols-5 tw:gap-3">
    <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:text-xs tw:font-semibold tw:uppercase">
        <IconActivity :size="14" /> Calls
      </div>
      <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:mt-1">
        {{ loading ? '…' : fmtNumber(h.totalCalls) }}
      </div>
    </div>

    <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:text-xs tw:font-semibold tw:uppercase">
        <IconCircleCheck :size="14" /> Successful
      </div>
      <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:mt-1">
        {{ loading ? '…' : fmtNumber(h.okCalls) }}
        <span v-if="!loading && h.totalCalls" class="tw:text-sm tw:text-secondary tw:font-normal">
          ({{ 100 - errorRate }}%)
        </span>
      </div>
    </div>

    <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:text-xs tw:font-semibold tw:uppercase">
        <IconAlertTriangle :size="14" /> Errors
      </div>
      <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:mt-1" :class="errorRate > 5 ? 'tw:text-red-600' : ''">
        {{ loading ? '…' : fmtNumber(h.errorCalls) }}
        <span v-if="!loading && h.totalCalls" class="tw:text-sm tw:text-secondary tw:font-normal">
          ({{ errorRate }}%)
        </span>
      </div>
    </div>

    <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:text-xs tw:font-semibold tw:uppercase">
        <IconCurrencyDollar :size="14" /> Est. cost
      </div>
      <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:mt-1">
        {{ loading ? '…' : fmtUsd(h.estimatedCostUsd) }}
      </div>
      <div v-if="!loading" class="tw:text-xs tw:text-secondary">
        {{ fmtNumber(h.inputTokens) }} in / {{ fmtNumber(h.outputTokens) }} out
      </div>
    </div>

    <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:text-xs tw:font-semibold tw:uppercase">
        <IconClock :size="14" /> p95 latency
      </div>
      <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:mt-1">
        {{ loading ? '…' : fmtMs(h.p95DurationMs) }}
      </div>
      <div v-if="!loading && h.avgDurationMs" class="tw:text-xs tw:text-secondary">
        avg {{ fmtMs(h.avgDurationMs) }}
      </div>
    </div>
  </div>
</template>
