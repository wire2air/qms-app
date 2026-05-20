<script setup>
/**
 * Daily call-count bar chart. Inline SVG — no chart library dependency.
 * Bars stack (calls minus errors) + errors in red on top.
 */

const props = defineProps({
  overview: { type: Object, default: null },
})

const days = computed(() => props.overview?.byDay ?? [])
const maxCalls = computed(() => Math.max(1, ...days.value.map((d) => d.calls)))

const totalDays = computed(() => days.value.length)

const VIEWBOX_W = 1000
const VIEWBOX_H = 160
const PAD = 8

const barWidth = computed(() => {
  if (totalDays.value === 0) return 0
  return Math.max(2, (VIEWBOX_W - PAD * 2) / totalDays.value - 2)
})

function barX(i) {
  if (totalDays.value === 0) return 0
  return PAD + i * ((VIEWBOX_W - PAD * 2) / totalDays.value)
}

function barHeight(value) {
  if (maxCalls.value === 0) return 0
  return ((VIEWBOX_H - PAD * 2) * value) / maxCalls.value
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-4">
    <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
      <div class="tw:text-sm tw:font-semibold tw:text-on-main">Daily calls</div>
      <div class="tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-secondary">
        <span class="tw:inline-flex tw:items-center tw:gap-1">
          <span class="tw:size-2.5 tw:rounded-sm tw:bg-primary"></span> Success
        </span>
        <span class="tw:inline-flex tw:items-center tw:gap-1">
          <span class="tw:size-2.5 tw:rounded-sm tw:bg-red-500"></span> Errors
        </span>
      </div>
    </div>
    <svg
      v-if="totalDays > 0"
      :viewBox="`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`"
      class="tw:w-full tw:h-40"
      preserveAspectRatio="none"
    >
      <g v-for="(d, i) in days" :key="d.day">
        <!-- success portion -->
        <rect
          :x="barX(i)"
          :y="VIEWBOX_H - PAD - barHeight(d.calls - d.errors)"
          :width="barWidth"
          :height="barHeight(d.calls - d.errors)"
          class="tw:fill-primary"
        />
        <!-- error portion stacked on top -->
        <rect
          v-if="d.errors > 0"
          :x="barX(i)"
          :y="VIEWBOX_H - PAD - barHeight(d.calls)"
          :width="barWidth"
          :height="barHeight(d.errors)"
          class="tw:fill-red-500"
        />
        <!-- tooltip-on-hover via title -->
        <title>{{ fmtDate(d.day) }}: {{ d.calls }} call{{ d.calls === 1 ? '' : 's' }}, {{ d.errors }} error{{ d.errors === 1 ? '' : 's' }}, ${{ d.costUsd.toFixed(4) }}</title>
      </g>
    </svg>
    <div v-else class="tw:py-10 tw:text-center tw:text-sm tw:text-secondary">
      No activity in this period.
    </div>
    <!-- Axis labels: first + last day -->
    <div v-if="totalDays > 1" class="tw:flex tw:justify-between tw:text-xs tw:text-secondary tw:mt-1">
      <span>{{ fmtDate(days[0].day) }}</span>
      <span>{{ fmtDate(days[days.length - 1].day) }}</span>
    </div>
  </div>
</template>
