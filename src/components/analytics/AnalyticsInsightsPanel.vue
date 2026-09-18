<script setup>
/**
 * The nightly insights, for this reader.
 *
 * ── THE EMPTY STATE IS THE HARD PART, NOT THE LIST ──────────────────────────
 * `analytics_insights_select_rls` ends with
 * `scope_fingerprint = analytics_scope_fingerprint()` — the row's stored
 * fingerprint compared to the reader's CURRENT one. That is a good rule: an
 * insight is a SENTENCE, already aggregated with nothing left to filter, so a
 * user whose grants narrowed this morning would otherwise keep reading last
 * night's wider figures until the next run overwrote them.
 *
 * Its consequence is that a scope change hides ALL of that user's rows at once,
 * and the resulting empty list is pixel-identical to a genuinely quiet week
 * while meaning the opposite thing. This component therefore never renders a
 * bare "no insights" — `useInsightStaleness()` says WHICH empty it is, and each
 * one gets its own words. Hedging ("no insights, or your access may have
 * changed") would be worse than either truth: a quality manager told "nothing to
 * report" during a week when something WAS reported only finds out by asking a
 * colleague what they saw.
 *
 * ── WHAT IS RENDERED, AND WHY EACH PART IS NOT DECORATION ───────────────────
 * `basisCount` — what the claim rests on. Showing it is the difference between
 * an insight and a rumour, and the engine already refuses to speak below a
 * denominator floor of 20, so the number is always meaningful.
 *
 * `method` — shown on statistical insights specifically because
 * `robust_anomaly` and `seasonal_anomaly` are separate rule ids on purpose: a
 * reader who sees "seasonal" believes the time of year was accounted for, and
 * the robust one did no such thing. Collapsing them in the UI would undo a
 * distinction the engine went to trouble to preserve.
 *
 * metric name + period — Phase 9's exit criterion is that every insight links
 * to the metric and period that produced it, and the row already carries both.
 * Paraphrasing the sentence into something less accountable would fail it.
 */
import { ruleMeta } from '@/utils/analyticsInsights.js'
import { formatPeriod } from '@/utils/analyticsFormat.js'
import { useInsightStaleness } from '@/composables/useAnalytics.js'
import { IconBulb, IconChevronRight, IconRefreshAlert, IconMoodSmile } from '@tabler/icons-vue'

const props = defineProps({
  // Restrict to one authz module, for a module Insights tab. Null = everything
  // this reader has.
  moduleId: { type: String, default: null },
  // Cap the list on a dashboard-style surface; null shows all.
  limit: { type: Number, default: null },
})

const router = useRouter()

const { emptyReason, staleness } = useInsightStaleness()

const insights = useLiveQueryWithDeps(
  [() => props.moduleId],
  async (db, [moduleId]) => {
    const rows = await db.AnalyticsInsight.where().exec()
    return rows
      .filter((r) => !moduleId || r.moduleId === moduleId)
      // Most recently computed first, then by how much moved — a reader scans
      // the top of this list and stops, so the order IS the editorial decision.
      .sort((a, b) => {
        const t = String(b.computedAt ?? '').localeCompare(String(a.computedAt ?? ''))
        if (t !== 0) return t
        return Math.abs(Number(b.deltaPct ?? 0)) - Math.abs(Number(a.deltaPct ?? 0))
      })
  },
  { models: 'AnalyticsInsight', initial: [] },
)

const shown = computed(() => {
  const all = insights.value ?? []
  return props.limit ? all.slice(0, props.limit) : all
})

const hiddenCount = computed(() => Math.max(0, (insights.value?.length ?? 0) - shown.value.length))

function periodLabel(i) {
  return formatPeriod(i.periodStart, i.periodEnd)
}

/**
 * The drill target is stored on the row, not derived here — the generator wrote
 * the route and the filters that reproduce the records behind the sentence, and
 * re-deriving them client-side is how an insight starts pointing at a different
 * population than the one it counted.
 */
function canDrill(i) {
  return !!i.drillRoute
}

function drill(i) {
  if (!i.drillRoute) return
  const filters = i.drillFilters ?? {}
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v === null || v === undefined || v === '') continue
    qs.set(k, String(v))
  }
  const query = qs.toString()
  router.push(query ? `${i.drillRoute}?${query}` : i.drillRoute)
}
</script>

<template>
  <PageSection title="Insights" :icon="IconBulb">
    <!-- Access changed: the rows exist and are being withheld. Saying "nothing
         to report" here would be a lie the reader cannot detect. -->
    <BaseBanner
      v-if="emptyReason === 'scope_changed'"
      tone="info"
      :icon="IconRefreshAlert"
      title="Your access changed, so these are being rebuilt"
      :message="`You have ${staleness?.staleCount ?? 0} insight${(staleness?.staleCount ?? 0) === 1 ? '' : 's'} that were worked out under your previous access. They are not shown because the figures in them may cover records you can no longer see. Tonight's run will recalculate them for your current access.`"
    />

    <BaseEmptyState
      v-else-if="emptyReason === 'never_run'"
      :icon="IconBulb"
      title="No insights have been generated yet"
      description="Insights are worked out once a night. If this persists for more than a day, the scheduled job may not be running."
    />

    <BaseEmptyState
      v-else-if="emptyReason === 'quiet'"
      :icon="IconMoodSmile"
      title="Nothing stood out"
      description="No threshold was crossed, no segment was an outlier and no run was long enough to mention. This is a genuine result, not a missing one."
    />

    <ContentGrid v-else-if="shown.length" min="22rem">
      <BaseClickableRow
        v-for="i in shown"
        :key="i.id"
        :disabled="!canDrill(i)"
        :aria-label="canDrill(i) ? `Open the records behind: ${i.headline}` : i.headline"
        @click="drill(i)"
      >
        <BaseCard class="tw:h-full">
          <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
            <BaseText weight="medium">{{ i.headline }}</BaseText>
            <BaseBadge :class="ruleMeta(i.ruleId).badgeClass">
              {{ ruleMeta(i.ruleId).label }}
            </BaseBadge>
          </div>

          <BaseText v-if="i.detail" variant="caption" color="secondary" class="tw:mt-1">
            {{ i.detail }}
          </BaseText>

          <!-- The citation. Phase 9's exit criterion is that every insight links
               to the metric and period that produced it. -->
          <div class="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1">
            <BaseText variant="caption" color="secondary">{{ i.metricName }}</BaseText>
            <BaseText variant="caption" color="secondary">{{ periodLabel(i) }}</BaseText>
            <BaseText variant="caption" color="secondary">
              based on {{ i.basisCount }} record{{ Number(i.basisCount) === 1 ? '' : 's' }}
            </BaseText>
            <!-- Stated for statistical insights so "seasonal" cannot be confused
                 with a method that ignored seasonality. -->
            <BaseText
              v-if="i.ruleClass === 'statistical' && i.method"
              variant="caption"
              color="secondary"
            >
              {{ i.method }}
            </BaseText>
            <IconChevronRight
              v-if="canDrill(i)"
              :size="14"
              class="tw:ml-auto tw:text-secondary"
              aria-hidden="true"
            />
          </div>
        </BaseCard>
      </BaseClickableRow>
    </ContentGrid>

    <BaseText v-if="hiddenCount > 0" variant="caption" color="secondary" class="tw:mt-2">
      {{ hiddenCount }} more not shown.
    </BaseText>
  </PageSection>
</template>
