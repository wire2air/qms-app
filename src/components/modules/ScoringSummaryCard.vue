<script setup>
/**
 * Rating summary for a module record. Shows the weighted total + rating band and
 * a per-field breakdown. Two modes:
 *   - live  — computes from the current schema + payload while the form is filled
 *             (advisory preview).
 *   - sealed — renders the authoritative `scoring_result` written on complete.
 * Renders nothing when the template has no scored fields.
 */
import { computeFormScore, collectScoredFields } from '@/composables/useModuleScoring'

const props = defineProps({
  schema: { type: Array, default: () => [] },
  payload: { type: Object, default: () => ({}) },
  moduleScoring: { type: Object, default: null },
  // When provided (record COMPLETE/CLOSED), render this instead of live compute.
  sealed: { type: Object, default: null },
})

const hasScoring = computed(() => collectScoredFields(props.schema).length > 0)

const result = computed(() => {
  if (props.sealed) return props.sealed
  return computeFormScore(props.schema, props.payload || {}, props.moduleScoring)
})

const totalDisplay = computed(() => (result.value?.total == null ? '—' : result.value.total))
const ratingColor = computed(() => result.value?.ratingColor || '#6b7280')
const breakdown = computed(() => result.value?.breakdown || [])
</script>

<template>
  <BaseRailCard v-if="hasScoring" title="Score">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:flex tw:items-center tw:justify-center tw:rounded-xl tw:w-16 tw:h-16 tw:text-2xl tw:font-bold tw:text-white tw:shrink-0"
          :style="{ backgroundColor: ratingColor }"
        >
          {{ totalDisplay }}
        </div>
        <div class="tw:min-w-0">
          <div
            v-if="result?.ratingLabel"
            class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-white"
            :style="{ backgroundColor: ratingColor }"
          >
            {{ result.ratingLabel }}
          </div>
          <div v-else class="tw:text-xs tw:text-secondary">No rating band</div>
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            {{ result?.scoredCount || 0 }} / {{ result?.fieldCount || 0 }} scored
            <span v-if="sealed"> · sealed</span>
            <span v-else> · live preview</span>
          </div>
        </div>
      </div>

      <div v-if="breakdown.length" class="tw:flex tw:flex-col tw:gap-1 tw:pt-2 tw:border-t tw:border-divider">
        <div
          v-for="entry in breakdown"
          :key="entry.name"
          class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:text-xs"
        >
          <span class="tw:truncate tw:text-on-main" :title="entry.label">{{ entry.label }}</span>
          <span class="tw:shrink-0 tw:text-secondary">
            <span v-if="entry.score == null" class="tw:italic">—</span>
            <span v-else>{{ entry.score }}</span>
            <span class="tw:opacity-60"> ×{{ entry.weight }}</span>
          </span>
        </div>
      </div>
    </div>
  </BaseRailCard>
</template>
