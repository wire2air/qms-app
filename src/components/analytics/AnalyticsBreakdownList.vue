<script setup>
/**
 * The ranked contribution list under a metric widget — the first hop of
 * _Insight → Evidence → Record → Action_. Each segment links to the real QMS
 * list filtered to exactly the rows that produced its number.
 *
 * Two rows types must NOT be offered as links:
 *  - the RESIDUAL bucket (`isResidual`) — it summarises segments deliberately
 *    not shown individually ("Other (3, 1 below threshold)"), carries a null
 *    `dimensionValue`, and the server returns no drill target for it;
 *  - a WITHHELD row — its value is suppressed for small-cell protection, so it
 *    reads as "Withheld", never as 0, and never leads anywhere.
 */
import { IconArrowRight, IconEyeOff } from '@tabler/icons-vue'
import { formatMetricValue, isDrillable, drillLocation } from '@/utils/analyticsFormat.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  unit: { type: String, default: 'count' },
})

// `share_of_total` is ALREADY a percentage of the numerator (0..100) — see the
// COMMENT on metric_breakdown — so it is not scaled again here. Clamped so a
// rounding artefact can't overflow the bar.
function sharePct(row) {
  const share = Number(row?.shareOfTotal)
  if (!Number.isFinite(share)) return 0
  return Math.max(0, Math.min(100, share))
}

const items = computed(() =>
  props.rows.map((row) => ({
    ...row,
    key: row.isResidual ? '__residual__' : (row.dimensionValue ?? row.label ?? String(row.rank)),
    to: drillLocation(row),
    drillable: isDrillable(row),
    display: formatMetricValue(row.value, props.unit, { suppressed: !!row.suppressed }),
    width: `${sharePct(row)}%`,
  })),
)
</script>

<template>
  <ul class="tw:flex tw:flex-col tw:gap-1.5">
    <li v-for="item in items" :key="item.key">
      <component
        :is="item.drillable ? 'RouterLink' : 'div'"
        :to="item.drillable ? item.to : undefined"
        class="tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:px-1.5 tw:py-1"
        :class="
          item.drillable
            ? 'tw:hover:bg-main-hover tw:transition-colors'
            : 'tw:cursor-default tw:opacity-90'
        "
        :aria-label="item.drillable ? `View records for ${item.label}` : undefined"
      >
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:flex tw:items-center tw:gap-1">
            <BaseText
              variant="caption"
              :color="item.isResidual ? 'secondary' : 'default'"
              class="tw:truncate"
            >
              {{ item.label || item.dimensionValue || '—' }}
            </BaseText>
            <IconEyeOff
              v-if="item.suppressed"
              :size="12"
              class="tw:text-secondary"
              aria-hidden="true"
            />
          </div>
          <!-- Contribution bar. A suppressed row gets no bar: drawing a
               zero-width bar would read as "zero", which is the one thing
               suppression must never look like. -->
          <div v-if="!item.suppressed" class="tw:mt-1 tw:h-1 tw:w-full tw:rounded tw:bg-main-hover">
            <div
              class="tw:h-1 tw:rounded"
              :class="item.isResidual ? 'tw:bg-secondary/40' : 'tw:bg-primary'"
              :style="{ width: item.width }"
            />
          </div>
        </div>

        <BaseText
          variant="caption"
          :color="item.suppressed ? 'secondary' : 'default'"
          weight="semibold"
          class="tw:shrink-0 tw:tabular-nums"
        >
          {{ item.display }}
        </BaseText>

        <IconArrowRight
          v-if="item.drillable"
          :size="14"
          class="tw:shrink-0 tw:text-secondary"
          aria-hidden="true"
        />
        <span v-else class="tw:w-3.5 tw:shrink-0" aria-hidden="true" />
      </component>
    </li>
  </ul>
</template>
