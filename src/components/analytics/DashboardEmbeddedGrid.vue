<script setup>
/**
 * DashboardEmbeddedGrid — one saved dashboard's tiles, rendered READ-ONLY
 * somewhere other than its own page.
 *
 * Built for the home page's starred-dashboard chips, which append a board below
 * the widget grid. It deliberately does NOT reuse DashboardDetail: that
 * component is route-coupled (it reads `route.params.id`) and renders its own
 * `BasePage` + `PageHeader`, and PageHeader teleports into the app top bar — so
 * embedding it would put two competing teleports on one page and nest BasePage
 * inside BasePage, which `npm run lint:layout` rejects outright.
 *
 * ── WHY READ-ONLY, AND WHY THAT IS NOT A LIMITATION ────────────────────────
 * No drag-reorder, no resize, no edit or remove, no "add widget". Those belong
 * to the board's own page, where the thing you are editing is the thing you are
 * looking at. On the home page the board is a GUEST: the user came for their
 * home view and pinned a board beside it, and a grip handle that silently
 * rewrites someone else's shared dashboard from a page not about that dashboard
 * is a trap rather than a convenience.
 *
 * The tiles themselves are identical — AnalyticsQuestionTile resolves every
 * figure under the reader's own scope, exactly as on the board's page. A shared
 * board embedded here shows this viewer's numbers, not its author's.
 *
 * ── WHAT THIS COMPONENT DOES NOT OWN ───────────────────────────────────────
 * Entitlement and permission. The caller decides whether to render it at all;
 * by the time a board reaches this component it has already been resolved out
 * of the sync stream, which means RLS served it.
 */
import { useMetricCatalog } from '@/composables/useAnalytics.js'

defineOptions({ name: 'DashboardEmbeddedGrid' })

const props = defineProps({
  // The dashboard to render. Passing the ID rather than the row keeps this
  // component in line with the house rule: components receive an id and query
  // their own data.
  dashboardId: { type: String, required: true },
})

const widgets = useLiveQueryWithDeps(
  [() => props.dashboardId],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AnalyticsWidget.where('dashboardId', id).exec()
    return rows.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  },
  { models: 'AnalyticsWidget', initial: [] },
)

const { metrics } = useMetricCatalog()

const metricsByKey = computed(() => {
  const out = {}
  for (const m of metrics.value ?? []) out[m.metricKey] = m
  return out
})

const MAX_SPAN = 4

/**
 * A widget's column span, clamped — same rule as DashboardDetail.
 *
 * Clamped on READ rather than trusted: the value arrives from a synced row that
 * a future build, or a hand-written definition, could have written outside the
 * range. A bad value should render as a sane tile, not as a board that
 * overflows horizontally on every viewport.
 */
function spanOf(w) {
  const n = Number(w?.colSpan)
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_SPAN, Math.max(1, Math.round(n)))
}

/** The stored QUESTION — never an answer. The tile resolves it per viewer. */
function questionOf(w) {
  return {
    metricKey: w.metricKey,
    viz: w.viz,
    dimension: w.dimension,
    periodToken: w.periodToken,
    compare: w.compare,
    title: w.title,
    filters: w.filters ?? {},
  }
}
</script>

<template>
  <!--
    An empty board is a real state, not an error: the owner may not have added
    tiles yet, or every tile's metric may be one this reader cannot resolve. Say
    so plainly rather than rendering a blank region that reads as broken.
  -->
  <div
    v-if="(widgets?.length ?? 0) === 0"
    class="tw:flex tw:items-center tw:justify-center tw:py-10 tw:text-sm tw:text-secondary"
  >
    This dashboard has no tiles yet.
  </div>

  <ContentGrid v-else min="22rem">
    <!--
      The span is an inline style, not a Tailwind class: `tw:col-span-{{ n }}`
      cannot work, because Tailwind scans source text for literal class names
      and never generates an interpolated one. `grid-column: span N` is already
      capped by the browser to the number of columns that exist, so a span of 3
      degrades to full width on a one-column phone layout instead of forcing
      horizontal scroll.
    -->
    <div
      v-for="w in widgets"
      :key="w.id"
      :style="{ gridColumn: `span ${spanOf(w)} / span ${spanOf(w)}` }"
    >
      <AnalyticsQuestionTile
        :question="questionOf(w)"
        :metric="metricsByKey[w.metricKey] ?? null"
      />
    </div>
  </ContentGrid>
</template>
