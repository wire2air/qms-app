<script setup>
/**
 * Column-aware loading skeleton. Mirrors the real table's column count, alignment
 * and density so there is no layout shift when data arrives. Pure presentational.
 */
const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Number, default: 8 },
  selectable: { type: Boolean, default: false },
  density: { type: String, default: 'comfortable' },
})

const padY = computed(() =>
  props.density === 'compact'
    ? 'tw:py-1.5'
    : props.density === 'cozy'
      ? 'tw:py-2.5'
      : 'tw:py-3',
)

// Deterministic, varied bar widths so the shimmer reads as real content, not a grid.
const WIDTHS = ['tw:w-3/4', 'tw:w-1/2', 'tw:w-2/3', 'tw:w-5/6', 'tw:w-2/5', 'tw:w-3/5']
function barWidth(rowIndex, colIndex) {
  return WIDTHS[(rowIndex * 7 + colIndex * 3) % WIDTHS.length]
}
function justify(align) {
  if (align === 'right') return 'tw:justify-end'
  if (align === 'center') return 'tw:justify-center'
  return 'tw:justify-start'
}
</script>

<template>
  <div
    class="tw:w-full tw:overflow-hidden"
    role="status"
    aria-busy="true"
    aria-label="Loading table data"
  >
    <table class="tw:w-full tw:min-w-125 tw:border-collapse tw:text-sm">
      <thead>
        <tr>
          <th
            v-if="selectable"
            :class="['tw:w-10 tw:border-b tw:border-divider tw:bg-main tw:px-4', padY]"
          >
            <div class="tw:size-4 tw:rounded tw:bg-divider tw:animate-pulse" />
          </th>
          <th
            v-for="col in columns"
            :key="col.name"
            :class="['tw:px-4 tw:border-b tw:border-divider tw:bg-main', padY]"
          >
            <div :class="['tw:flex', justify(col.align)]">
              <div class="tw:h-2.5 tw:w-16 tw:rounded tw:bg-divider tw:animate-pulse" />
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r"
          class="tw:border-b tw:border-divider last:tw:border-b-0"
        >
          <td v-if="selectable" :class="['tw:w-10 tw:px-4', padY]">
            <div class="tw:size-4 tw:rounded tw:bg-divider/70 tw:animate-pulse" />
          </td>
          <td v-for="(col, c) in columns" :key="col.name" :class="['tw:px-4', padY]">
            <div :class="['tw:flex', justify(col.align)]">
              <div
                :class="[
                  'tw:h-3 tw:rounded tw:bg-divider/70 tw:animate-pulse',
                  barWidth(r, c),
                ]"
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
