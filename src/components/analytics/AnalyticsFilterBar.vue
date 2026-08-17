<script setup>
/**
 * Global analytics filter bar.
 *
 * Reuses the app's existing filter furniture rather than inventing a second
 * one: `BaseFilterBar` for the toolbar shell and `BaseDateFilter` for the
 * period, so the period stays a RELATIVE TOKEN (`{ operator: 'relative',
 * relative: { dir, unit, count } }`). That matters — a saved or shared
 * "Last 12 months" re-resolves at run time instead of freezing to the day it
 * was shared. The page serialises these values into the URL with
 * `filtersToQuery` (via `useListLayout({ syncUrl: true })`), and
 * `queryToFilters` restores the object-valued token on the way back in.
 */
import { IconCalendar } from '@tabler/icons-vue'
import { periodFromDateToken, formatPeriod, moduleLabel } from '@/utils/analyticsFormat.js'

const props = defineProps({
  // Authz module ids present in the caller's metric catalog.
  moduleIds: { type: Array, default: () => [] },
  // Catalog rows, for the "charted metrics" picker.
  metrics: { type: Array, default: () => [] },
  showClear: { type: Boolean, default: false },
})

defineEmits(['clear'])

const period = defineModel('period', { type: Object, default: null })
const compare = defineModel('compare', { type: String, default: 'previous_period' })
const moduleId = defineModel('moduleId', { type: String, default: null })
const charts = defineModel('charts', { type: Array, default: () => [] })

const COMPARE_OPTIONS = [
  { value: 'previous_period', label: 'vs previous period' },
  { value: 'same_period_last_year', label: 'vs same period last year' },
]

const moduleOptions = computed(() =>
  props.moduleIds.map((id) => ({ value: id, label: moduleLabel(id) })),
)

const metricOptions = computed(() =>
  props.metrics.map((m) => ({ value: m.metricKey, label: m.name || m.metricKey })),
)

// The resolved window, so the trigger reads as the dates actually queried
// rather than as the token that produced them. A null token means "let the
// server pick", which is the trailing 12 whole months plus the current one.
const periodLabel = computed(() => {
  if (!period.value) return 'Last 12 months'
  const { periodStart, periodEnd } = periodFromDateToken(period.value)
  return formatPeriod(periodStart, periodEnd)
})
</script>

<template>
  <BaseFilterBar hideSearch :showClear="showClear" @clear="$emit('clear')">
    <template #filters>
      <BasePopover placement="bottom-start" :arrow="false" :offset="8">
        <template #button>
          <BaseButton variant="filter" size="md" aria-label="Change the reporting period">
            <IconCalendar :size="14" aria-hidden="true" />
            {{ periodLabel }}
          </BaseButton>
        </template>
        <BaseDateFilter v-model="period" />
      </BasePopover>

      <div class="tw:min-w-44">
        <BaseSelect
          v-model="compare"
          :options="COMPARE_OPTIONS"
          :required="true"
          :searchable="false"
          size="sm"
        />
      </div>

      <div class="tw:min-w-44">
        <BaseSelect
          v-model="moduleId"
          :options="moduleOptions"
          nullLabel="All modules"
          :searchable="false"
          clearable
          size="sm"
          placeholder="All modules"
        />
      </div>

      <div class="tw:min-w-56">
        <BaseSelect
          v-model="charts"
          :options="metricOptions"
          multiple
          useChips
          size="sm"
          placeholder="Charted metrics"
        />
      </div>
    </template>
  </BaseFilterBar>
</template>
