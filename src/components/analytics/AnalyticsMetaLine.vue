<script setup>
/**
 * The provenance line every analytics surface carries: the SCOPE the number was
 * computed under, the TIER it came from, and how FRESH it is.
 *
 * This is a hard requirement of the analytics design, not chrome. Scope tiers
 * are cumulative and NULL site/department rows are invisible to scoped viewers,
 * so two colleagues comparing "the same KPI" will legitimately see different
 * totals; and a 15-minute-old rollup number is visually identical to a live one.
 * Stating both is what stops either reading as a bug.
 *
 * The CALCULATION NOTE rides here for the same reason, one step further back: a
 * viewer who can see the scope and the freshness still cannot tell whether
 * "Overdue CAPAs" counts by due date or by closure date, or which records the
 * denominator holds — and a number whose definition is unknown is argued with
 * rather than acted on. The note is the catalog's own plain-English statement
 * of that definition, so every surface answers the question identically.
 *
 * It lives in THIS component deliberately: AnalyticsMetaLine is on every
 * surface that shows a metric value (the KPI tile directly, every chart tile
 * through AnalyticsWidget), so one affordance here is the same answer
 * everywhere rather than four that can drift apart.
 */
import { IconClock, IconInfoCircle } from '@tabler/icons-vue'
import { formatFreshness, formatPeriod } from '@/utils/analyticsFormat.js'

const props = defineProps({
  scope: { type: String, default: null },
  tier: { type: String, default: null },
  // ISO timestamp from the metric row (`computedAt`).
  computedAt: { type: String, default: null },
  // Optional resolved window, shown when the tile is not on the page default.
  periodStart: { type: String, default: null },
  periodEnd: { type: String, default: null },
  showPeriod: { type: Boolean, default: false },
  // `calculationNote` from the metric CATALOG row: how this number is worked
  // out, in the reader's language. Optional — a metric that has not been given
  // one renders no icon at all (never a dangling icon over an empty popover).
  calculationNote: { type: String, default: null },
})

const freshness = computed(() => formatFreshness(props.computedAt))

// Whitespace-only is as absent as null — the affordance must not open on it.
const note = computed(() => props.calculationNote?.trim() || null)
const period = computed(() =>
  props.showPeriod ? formatPeriod(props.periodStart, props.periodEnd) : null,
)
</script>

<template>
  <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1">
    <AnalyticsScopeBadgeById v-if="scope" :scopeId="scope" />
    <AnalyticsTierBadgeById v-if="tier" :tierId="tier" />

    <BaseTooltip v-if="freshness" :content="`Computed ${freshness.exact}`">
      <span class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
        <IconClock :size="13" aria-hidden="true" />
        {{ freshness.relative }}
      </span>
    </BaseTooltip>

    <!-- Click-to-open rather than a tooltip: the note is a short paragraph,
         and BaseTooltip is pointer-events-none and closes on mouseleave, so a
         reader cannot keep it open long enough to finish reading it. BasePopover
         is the codebase's own primitive for anchored, lightweight info
         (CLAUDE.md → "Popover → lightweight info … anchored to a control"), it
         stops the click from reaching a drillable tile, and it dismisses on
         Escape or an outside click. -->
    <BasePopover v-if="note" placement="bottom-start" :arrow="false" :offset="6" flip>
      <template #button>
        <button
          type="button"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:text-xs tw:text-secondary tw:hover:text-primary"
          aria-label="How this is calculated"
        >
          <IconInfoCircle :size="13" aria-hidden="true" />
          How it's calculated
        </button>
      </template>
      <template #content>
        <!-- BaseText renders an inline span, so the flex column is what puts
             the heading and the note on their own lines. -->
        <div class="tw:flex tw:max-w-xs tw:flex-col tw:gap-1 tw:p-3">
          <BaseText variant="caption" weight="medium" color="default">
            How this is calculated
          </BaseText>
          <BaseText variant="caption" color="secondary">{{ note }}</BaseText>
        </div>
      </template>
    </BasePopover>

    <BaseText v-if="period" variant="caption" color="secondary">{{ period }}</BaseText>
  </div>
</template>
