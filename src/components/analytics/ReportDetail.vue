<script setup>
/**
 * One saved report, rendered ON SCREEN — the other half of Phase 7's exit
 * criterion, "a report renders identically on screen and in PDF".
 *
 * ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
 * It is not a renderer. It is a re-reading of the SAME definition through the
 * SAME metric functions the exporter uses, drawn with the SAME components the
 * rest of analytics uses. Every figure below is produced by
 * AnalyticsQuestionTile issuing its own request — exactly as on a dashboard —
 * so a number here is a number the server computed for THIS viewer, never one
 * passed down as a prop.
 *
 * A second renderer is how the screen and the PDF start disagreeing, and the
 * disagreement would be silent: both surfaces would keep rendering, and only
 * somebody holding a printout next to a browser would ever notice.
 *
 * ── THE CONTRACT WITH backend/worker/tasks/export_analytics_report.js ───────
 * `definition` is:
 *
 *   { periodToken, sections: [ { title, metricKeys: [...], breakdown: { metricKey, dimension } } ] }
 *
 * and the exporter's GATHER block resolves it with precisely two calls:
 *
 *   metric_value(metricKey)
 *   metric_breakdown(metricKey, dimension, NULL, NULL, 25, 5, 'contribution')
 *
 * The questions built below reproduce those argument lists exactly — see
 * metricQuestion() and breakdownQuestion(), which explain each value. Anything
 * that looks like a stylistic default here (limit 25, min cell 5, a
 * conspicuously absent period) is not: it is the exporter's call signature, and
 * changing one without the other breaks the exit criterion.
 *
 * ── THE ONE HONEST CAVEAT: periodToken IS DISPLAYED, NOT APPLIED ────────────
 * The exporter prints `periodToken` on the cover sheet, in the PDF header and
 * in the delivery email — and then calls `metric_value(metricKey)` with NO
 * window, so the server's own default period is what every figure is actually
 * computed over. For the default token (`last_12_months`) that is the same
 * thing, because resolvePeriodToken() deliberately returns nulls for it and
 * lets the server pick whole months. For any OTHER token it is not, and the
 * label overstates what the numbers mean.
 *
 * This screen therefore does not resolve the token either, and that is a
 * deliberate choice rather than an oversight: matching the exporter keeps the
 * two surfaces identical, which is the criterion, while "fixing" only this side
 * would make the screen quietly disagree with every PDF ever sent. The fix
 * belongs in the exporter's GATHER block — resolve the token to dates there and
 * pass them to both metric functions — at which point this file should start
 * passing `periodToken` through to the tiles, in the same change.
 *
 * ── EXPORT IS A REQUEST, NOT A DOWNLOAD ─────────────────────────────────────
 * The buttons enqueue a job; the worker emails the file to the requester. There
 * is no link to hand back, on purpose: every figure in that file is resolved
 * under one named person's scope, and a URL is transferable while a scope is
 * not. The toast says what actually happens rather than implying a download
 * that is never coming.
 *
 * ── WHY THE MUTATION GOES OVER graphqlRequest AND NOT THE SYNCENGINE ────────
 * Same reason the reads do (CLAUDE.md rule #4, useServerQuery.js's header):
 * analytics is the SyncEngine exception. `request_report_export` returns a
 * graphile-worker job id, not a record — there is nothing to write to IndexedDB
 * and nothing to broadcast — so it is fired directly at /api/graphql through
 * the app's existing client, session cookie and all.
 */
import {
  IconCalendarClock,
  IconFileAnalytics,
  IconFileSpreadsheet,
  IconFileTypePdf,
} from '@tabler/icons-vue'
import { graphqlRequest } from '@syncEngine/network/graphqlClient.js'
import { isAllowed } from '@/utils/currentSession'
import { useMetricCatalog } from '@/composables/useAnalytics.js'
import { DEFAULT_PERIOD_TOKEN, periodTokenLabel } from '@/utils/analyticsPeriods.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const reportId = computed(() => String(route.params.id ?? ''))

// ── tabs ────────────────────────────────────────────────────────────────────
//
// The report and its delivery schedules are two different objects with two
// different permission stories (rendering needs `:read`; a LIVE schedule needs
// `:export`), so they are separate tabs rather than one long page.
//
// Backed by `?tab=` so a schedule is linkable — "the Monday pack is going to the
// wrong people" is a message somebody sends with a URL in it, and a tab that
// only exists in component state cannot be the target of one. `replace` rather
// than `push`, so flipping tabs does not fill the back button with the same page.
const TABS = [
  { value: 'report', label: 'Report', icon: IconFileAnalytics },
  { value: 'schedules', label: 'Schedules', icon: IconCalendarClock },
]

const activeTab = ref(
  TABS.some((t) => t.value === route.query.tab) ? String(route.query.tab) : 'report',
)

watch(activeTab, (tab) => {
  if ((route.query.tab ?? 'report') === tab) return
  router.replace({
    query: { ...route.query, tab: tab === 'report' ? undefined : tab },
  })
})

// Back/forward and inbound links move the tab, not just the URL.
watch(
  () => route.query.tab,
  (tab) => {
    const next = TABS.some((t) => t.value === tab) ? String(tab) : 'report'
    if (activeTab.value !== next) activeTab.value = next
  },
)

// No `initial`, exactly as DashboardDetail does it: `report` stays UNDEFINED
// until the first result lands, so the template can tell "still loading" from
// null, "genuinely not found or not readable by you". Collapsing the two would
// flash "Report not found" on every navigation.
const report = useLiveQueryWithDeps(
  [() => reportId.value],
  async (db, [id]) => (id ? await db.AnalyticsReport.findByPk(id) : null),
  { models: 'AnalyticsReport' },
)

const definition = computed(() => report.value?.definition ?? {})

// Same fallback the exporter applies, so an older report with no token reads
// the same on both surfaces.
const periodToken = computed(() => definition.value?.periodToken ?? DEFAULT_PERIOD_TOKEN)

const sections = computed(() =>
  Array.isArray(definition.value?.sections) ? definition.value.sections : [],
)

// Permission-filtered server-side. A metric missing from here is one this
// viewer may not read — AnalyticsQuestionTile says so explicitly, which is a
// different and truer claim than an empty tile ("there is no data").
const { metrics, loaded: catalogLoaded } = useMetricCatalog()

const metricsByKey = computed(() => {
  const out = {}
  for (const m of metrics.value ?? []) out[m.metricKey] = m
  return out
})

/** The exporter's `section.metricKeys ?? []`. */
function metricKeysOf(section) {
  return Array.isArray(section?.metricKeys) ? section.metricKeys : []
}

/** The exporter's `if (section.breakdown?.metricKey && section.breakdown?.dimension)`. */
function hasBreakdown(section) {
  return !!(section?.breakdown?.metricKey && section?.breakdown?.dimension)
}

/**
 * One metric → `metric_value(metricKey)`.
 *
 * `viz: 'kpi'` is the VALUE source, so the tile delegates to AnalyticsKpiCard,
 * which fetches the row itself and prints the same five facts the exporter puts
 * in its columns: name, value, unit, effective scope and computed-at.
 *
 * No `periodToken`: resolvePeriodToken() maps an absent token to
 * `{ periodStart: null, periodEnd: null }`, which is the exporter's argument
 * list. See the header for why this is matched rather than corrected here.
 *
 * `compare` is 'previous_period' because that is `metric_value`'s own default
 * for `p_compare`, which is what the exporter gets by omitting it.
 */
function metricQuestion(metricKey) {
  return {
    metricKey,
    viz: 'kpi',
    dimension: null,
    compare: 'previous_period',
    filters: {},
  }
}

/**
 * One breakdown → `metric_breakdown(metricKey, dimension, NULL, NULL, 25, 5, 'contribution')`.
 *
 * `viz: 'table'` is the BREAKDOWN source, rendered by AnalyticsBreakdownList,
 * which already handles the two row types the PDF also distinguishes: the
 * residual bucket (never drillable) and a withheld cell (reads as "Withheld",
 * never as 0).
 *
 * `limit: 25` and `rankBy: 'contribution'` are the exporter's literals, not
 * this component's taste — the tile would otherwise default to 10, and a screen
 * showing 10 segments next to a PDF showing 25 is exactly the drift this file
 * exists to prevent. `minCell` is left at AnalyticsQuestionTile's default of 5,
 * which is the exporter's 5.
 */
function breakdownQuestion(section) {
  return {
    metricKey: section.breakdown.metricKey,
    viz: 'table',
    dimension: section.breakdown.dimension,
    compare: 'previous_period',
    filters: { limit: 25, rankBy: 'contribution' },
  }
}

// ── export ──────────────────────────────────────────────────────────────────
//
// Verified against the built PostGraphile v5 schema, not guessed: the pg
// argument names are camelCased VERBATIM, so `p_report_id` → `pReportId` and
// `p_format` → `pFormat`. The `p_` prefix is NOT stripped by
// PgSimplifyInflectionPreset. A wrong name here fails at request time with
// nothing on screen but a toast, which is why it was checked rather than
// assumed.
const REQUEST_REPORT_EXPORT = `
  mutation RequestReportExport($pReportId: UUID!, $pFormat: String!) {
    requestReportExport(input: { pReportId: $pReportId, pFormat: $pFormat }) {
      # The graphile-worker job id. Nothing is done with it — there is no job
      # status surface yet, and inventing one that polls would be a second
      # source of truth for "is my export ready" alongside the email that
      # actually delivers it.
      result
    }
  }
`

/** 'xlsx' | 'pdf' | null — which format is currently being requested. */
const requesting = ref(null)

// A courtesy, not the gate. `request_report_export` re-checks
// reports_dashboards:export as app_user and raises without it; this only
// decides whether to draw a button that would always fail. Same helper
// AnalyticsWidget uses for its per-tile export.
const canExport = computed(() => isAllowed(['reports_dashboards:export']))

async function requestExport(format) {
  if (requesting.value || !reportId.value) return
  requesting.value = format
  try {
    await graphqlRequest(REQUEST_REPORT_EXPORT, {
      pReportId: reportId.value,
      pFormat: format,
    })
    // Honest about the delivery mechanism. There is no download and no link —
    // see the header.
    toast.success("Export queued. We'll email it to you when it's ready.")
  } catch (err) {
    // The function raises a distinct message for each refusal — missing
    // `:export`, a plan without Reports & Dashboards, a report this caller
    // cannot read, an unsupported format. Show what the server said; a generic
    // "Export failed" would throw away the only thing that tells the user which
    // of those four happened.
    toast.error(err?.message || 'Could not start that export')
  } finally {
    requesting.value = null
  }
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader
      :icon="IconFileAnalytics"
      :title="report?.name || 'Report'"
      :subtitle="report?.description || ''"
    >
      <template #actions>
        <DashboardVisibilityBadgeById v-if="report" :visibilityId="report.visibility" />

        <template v-if="canExport">
          <BaseButton
            size="sm"
            variant="outline"
            :disabled="!report || requesting !== null"
            :isLoading="requesting === 'xlsx'"
            @click="requestExport('xlsx')"
          >
            <IconFileSpreadsheet :size="14" aria-hidden="true" />
            Email as Excel
          </BaseButton>
          <BaseButton
            size="sm"
            variant="outline"
            :disabled="!report || requesting !== null"
            :isLoading="requesting === 'pdf'"
            @click="requestExport('pdf')"
          >
            <IconFileTypePdf :size="14" aria-hidden="true" />
            Email as PDF
          </BaseButton>
        </template>
      </template>
    </PageHeader>

    <BaseEmptyState
      v-if="report === null"
      title="Report not found"
      description="It may have been deleted, or it may be private to someone else."
    >
      <template #action>
        <BaseButton size="sm" variant="outline" @click="router.push('/analytics/reports')">
          Back to reports
        </BaseButton>
      </template>
    </BaseEmptyState>

    <template v-else>
      <!-- Panels must be CHILDREN of BaseTabs, not siblings: BaseTabPanel reads
           the active id from the tabs `provide()` context, and a panel outside it
           warns in dev and renders nothing in production. -->
      <BaseTabs v-model="activeTab" :tabs="TABS" variant="underline" ariaLabel="Report sections">
        <BaseTabPanel value="report" class="tw:flex tw:flex-col tw:gap-6 tw:pt-4">
          <!-- The same three facts the PDF prints under its title. "Resolved for
               you" replaces the PDF's "Resolved for user: <id>" because on screen
               the reader IS that user — the claim is identical, the phrasing is
               the one that means something to a person looking at it. -->
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-1">
            <BaseText variant="caption" color="secondary">
              Period: {{ periodTokenLabel(periodToken) }}
            </BaseText>
            <BaseText variant="caption" color="secondary">
              Resolved for you — figures reflect your access scope
            </BaseText>
          </div>

          <BaseEmptyState
            v-if="sections.length === 0"
            title="This report has no sections yet"
            description="A report is a list of sections, each asking for some metrics and, optionally, one breakdown."
          />

          <template v-else>
            <section
              v-for="(section, index) in sections"
              :key="index"
              class="tw:flex tw:flex-col tw:gap-3"
            >
              <!-- The exporter's `section.title || 'Section'`. -->
              <BaseText variant="subheading" weight="bold">
                {{ section.title || 'Section' }}
              </BaseText>

              <ContentGrid v-if="metricKeysOf(section).length" min="18rem">
                <AnalyticsQuestionTile
                  v-for="metricKey in metricKeysOf(section)"
                  :key="metricKey"
                  :question="metricQuestion(metricKey)"
                  :metric="metricsByKey[metricKey] ?? null"
                  :catalogLoaded="catalogLoaded"
                />
              </ContentGrid>

              <AnalyticsQuestionTile
                v-if="hasBreakdown(section)"
                :question="breakdownQuestion(section)"
                :metric="metricsByKey[section.breakdown.metricKey] ?? null"
                :catalogLoaded="catalogLoaded"
              />
            </section>
          </template>

          <!-- Word for word the PDF's footnote. It is the same claim about the same
               numbers, so it is stated in the same place on both surfaces rather
               than being something only the printout admits to. -->
          <BaseText variant="caption" color="secondary">
            Figures are resolved under your access scope. The same report run by a
            different person may legitimately show different numbers. Cells marked as
            withheld fall below the small-cell threshold and are suppressed to prevent
            identifying an individual.
          </BaseText>
        </BaseTabPanel>

        <!-- Lazy by default, so opening the report does not query schedules or
             their run history for the many readers who never look. -->
        <BaseTabPanel value="schedules" class="tw:pt-4">
          <ReportSchedulesTab :reportId="reportId" />
        </BaseTabPanel>
      </BaseTabs>
    </template>
  </BasePage>
</template>
