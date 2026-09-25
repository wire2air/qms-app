<script setup>
/**
 * The metrics this workspace defined for itself.
 *
 * ── WHY A SEPARATE PAGE FROM DASHBOARDS AND REPORTS ─────────────────────────
 * Because a metric is not a view of data, it is a DEFINITION of what a number
 * means — and once published it is what every dashboard tile, report section and
 * alert threshold in the tenant counts. Filing it under "Dashboards" would put
 * the vocabulary inside one of its consumers.
 *
 * ── THE THREE STATES A ROW CAN BE IN, AND WHY EACH IS ITS OWN BADGE ────────
 *   • Published — compiled, live, usable everywhere a shipped metric is.
 *   • Draft     — compiled fine, deliberately not live. Costs nothing: the
 *                 rollup fan-out enqueues one job per ACTIVE metric, so a draft
 *                 is free to keep.
 *   • Needs attention — saved, but the last edit did not compile, so there is
 *                 no metric behind it at all.
 *
 * That third state is the one worth designing for. It is reachable without the
 * user doing anything wrong: publishing is server-cleared when a definition stops
 * compiling, so a metric that worked yesterday can be sitting here broken today
 * because a status vocabulary changed underneath it. If the list did not say so,
 * the only symptom would be a tile that quietly stopped appearing.
 */
import {
  canCreateCustomMetrics,
  canUpdateCustomMetrics,
  canDeleteCustomMetrics,
  metricState,
  metricStateRank,
  METRIC_STATE_OPTIONS,
  METRIC_SORT_OPTIONS,
} from '@/utils/analyticsCustomMetricAccess.js'
import { isAllowed } from '@/utils/currentSession'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. Same reasoning
// as ReportDetail's export: request_metric_refresh returns a graphile-worker job
// id, not a record, so there is nothing for the SyncEngine to cache or broadcast.
import { DateTime } from 'luxon'
import { graphqlRequest } from '@syncEngine/network/graphqlClient.js'
import {
  IconMathFunction,
  IconRefresh,
  IconClock,
  IconPlus,
  IconLock,
  IconEye,
  IconPencil,
  IconTrash,
  IconAlertTriangle,
  IconSearch,
} from '@tabler/icons-vue'

const toast = useToast()
const { entitled } = useAnalyticsEntitlement()

// Unsorted on purpose. Ordering is a user choice now (`sort` below), and it is
// applied AFTER each row's state is derived — a sort by status cannot run here,
// because the state depends on the metric catalog, which is a server-computed
// aggregate this query has no access to.
const metrics = useLiveQuery(async (db) => db.AnalyticsCustomMetric.where().exec(), {
  models: 'AnalyticsCustomMetric',
  initial: [],
})

// The metric catalog: which metrics have rollup rows (catalogRow / stateOf
// below). The field vocabulary, the tenant's own module templates and the
// dimension cap the builder needs moved with it to CustomMetricEditor when the
// builder became a page.
const { metrics: catalog } = useMetricCatalog()

// The field vocabulary came BACK to this page when every card grew a Preview:
// draftCatalogRow reads `kind` and `groupable` off these to work out a metric's
// dimensions and unit, so the preview panel cannot render without them. Shared
// with CustomMetricEditor rather than copied — the tenant filter inside is a
// security filter, and a second copy of one drifts.
const { fields: moduleFields } = useAnalyticsModuleFields()

// The metric whose preview is open, or null. One at a time: each preview
// recomputes a rollup server-side, and a list this long makes that cost easy to
// trigger by browsing.
const previewing = ref(null)
const previewOpen = computed({
  get: () => !!previewing.value,
  set: (v) => {
    if (!v) previewing.value = null
  },
})

// Whether each metric has ever refreshed, and what that run produced. The
// catalog cannot answer this — it lists only metrics that HAVE rollup rows, so
// it is silent about exactly the ones in question. See metricState().
const { byMetricKey: refreshState } = useCustomMetricRefreshState()

/**
 * The state badge and caption must agree, so both read this rather than
 * re-deriving the condition. Three call sites disagreeing about which metric is
 * "empty" is how a filter starts contradicting the badge beside it — the same
 * reasoning `decorated` already applies.
 */
function stateOf(m) {
  return metricState(m, !!catalogRow(m), refreshState.value.get(metricKeyOf(m)) ?? null)
}

/** When the refresh last ran, for the "no matching records" caption. */
function checkedAt(m) {
  const iso = refreshState.value.get(metricKeyOf(m))?.lastRefreshedAt
  if (!iso) return 'recently'
  const when = DateTime.fromISO(iso)
  return when.isValid ? when.formatDate('datetime') : 'recently'
}

// Three verbs since the 2026-09-21 permission split: a role may now author
// metrics without being trusted to destroy them, which the single
// `reports_dashboards:manage` key could not express. Mirrors
// analytics_custom_metrics_{insert,update,delete}_rls one for one.
//
// `isAllowed` rather than a raw permissions.includes(): it short-circuits true
// for a company owner, who holds no role_module_permissions rows at all. The
// line this replaces read the array directly and so drew a read-only page for
// the owner of the tenant — the RLS would have allowed every write.
const viewer = computed(() => ({
  canCreate: isAllowed(['analytics_metrics:create']),
  canUpdate: isAllowed(['analytics_metrics:update']),
  canDelete: isAllowed(['analytics_metrics:delete']),
}))
const canCreate = computed(() => canCreateCustomMetrics(viewer.value))
const canUpdate = computed(() => canUpdateCustomMetrics(viewer.value))
const canDelete = computed(() => canDeleteCustomMetrics(viewer.value))

const router = useRouter()

// The builder is a page now (CustomMetricEditor) — see its header for why.
function create() {
  router.push('/analytics/metrics/new')
}
function edit(m) {
  router.push(`/analytics/metrics/${m.id}`)
}

const removeMetric = useLiveMutation(async (db, id) => {
  const m = await db.AnalyticsCustomMetric.findByPk(id)
  if (m) await m.delete()
})

async function remove(m) {
  try {
    await removeMetric(m.id)
    // Said explicitly, because deleting a definition also deletes the compiled
    // metric and every rollup bucket behind it — a tile pointing at it will stop
    // resolving, and that is not obvious from "Deleted".
    toast.success('Metric deleted. Any tile using it will stop showing a figure.')
  } catch (err) {
    toast.error(err?.message || 'Could not delete the metric')
  }
}

const publishMetric = useLiveMutation(async (db, { id, next }) => {
  const m = await db.AnalyticsCustomMetric.findByPk(id)
  if (!m) throw new Error('That metric no longer exists.')
  m.isPublished = next
  await m.save()
  return m
})

// ── refreshing one metric on demand ─────────────────────────────────────────
/**
 * A compiled metric's key, which is how the rollup and the catalog address it.
 *
 * The compiler derives it as 'custom.' || the definition's uuid with the hyphens
 * stripped, so it is computable here rather than needing a round trip. Mirrored
 * from analytics_compile_custom_metric(); if that ever changes, this follows.
 */
function metricKeyOf(m) {
  return `custom.${String(m.id).replace(/-/g, '')}`
}

const REQUEST_METRIC_REFRESH = `
  mutation RequestMetricRefresh($pMetricKey: String!) {
    requestMetricRefresh(input: { pMetricKey: $pMetricKey }) {
      # The graphile-worker job id. Not used: repeat requests collapse onto one
      # job by job_key, so the id is not a handle to anything a second click
      # could act on, and there is no job-status surface to poll.
      result
    }
  }
`

/** Metric keys with a refresh in flight, so only the clicked card spins. */
const refreshing = ref(new Set())

/**
 * The catalog row for a metric, or null while it has never been rolled up.
 *
 * metric_catalog() omits a metric with no rollup rows entirely, so a null here
 * is exactly the "published but not yet computed" state — the one the user hits
 * after publishing and cannot otherwise see.
 */
function catalogRow(m) {
  const key = metricKeyOf(m)
  return (catalog.value ?? []).find((c) => c.metricKey === key) ?? null
}

async function refreshMetric(m) {
  const key = metricKeyOf(m)
  if (refreshing.value.has(key)) return
  refreshing.value = new Set([...refreshing.value, key])
  try {
    await graphqlRequest(REQUEST_METRIC_REFRESH, { pMetricKey: key })
    // "Queued", not "refreshed". add_job returns as soon as the row is written,
    // so claiming the figure is current would be a guess about work that has not
    // started. The user watches computed_at instead.
    toast.success('Refresh queued. The figure updates when it finishes, usually within a minute.')
  } catch (err) {
    // The function raises a distinct message per refusal — no manage permission,
    // a plan without Reports & Dashboards, a metric that is not active. Showing
    // the server's words keeps which-one-happened visible.
    toast.error(err?.message || 'Could not queue a refresh')
  } finally {
    const next = new Set(refreshing.value)
    next.delete(key)
    refreshing.value = next
  }
}

/** Title-cased module slug, matching the builder. */
function moduleLabel(id) {
  return String(id ?? '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ── filtering, sorting and grouping ─────────────────────────────────────────
/**
 * ── WHY THIS IS NOT `useTableFilters` ──────────────────────────────────────
 * That composable filters a flat list for a DataTable. This page ends in
 * GROUPED sections, and one of its filters (status) keys off a value that is
 * not on the record — it is derived per row from the metric catalog. So the
 * pipeline is: derive state → filter → sort → group, and only the middle two
 * steps are what the composable does.
 */
const filters = ref({ search: '', moduleId: null, state: null, sort: 'name' })

const hasActiveFilters = computed(
  () =>
    !!filters.value.search.trim() ||
    !!filters.value.moduleId ||
    !!filters.value.state ||
    filters.value.sort !== 'name',
)

function clearFilters() {
  filters.value = { search: '', moduleId: null, state: null, sort: 'name' }
}

/**
 * Every metric with its state and module label resolved once.
 *
 * Derived here rather than in the template so the badge, the status filter and
 * the status sort all read the SAME value. Three call sites re-deriving it is
 * how a filter starts disagreeing with the badge beside it.
 */
const decorated = computed(() =>
  (metrics.value ?? []).map((m) => ({
    metric: m,
    state: stateOf(m),
    moduleId: m.moduleId ?? '',
    moduleName: moduleLabel(m.moduleId),
  })),
)

/**
 * Module options, built from the metrics that EXIST rather than from the
 * registry.
 *
 * Offering every module a tenant could write a metric for would mean a dropdown
 * where most choices return nothing — a filter that can produce an empty list
 * is a filter people stop trusting. Count in the label for the same reason the
 * section headers carry one: it answers "is there anything here" before the
 * click.
 */
const moduleOptions = computed(() => {
  const counts = new Map()
  for (const row of decorated.value) {
    counts.set(row.moduleId, (counts.get(row.moduleId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: `${moduleLabel(value)} (${count})`, count }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const visible = computed(() => {
  const term = filters.value.search.trim().toLowerCase()
  const { moduleId, state } = filters.value
  return decorated.value.filter((row) => {
    if (moduleId && row.moduleId !== moduleId) return false
    if (state && row.state !== state) return false
    if (!term) return true
    // Description too: a metric named "DOC total" is findable by the sentence
    // that says what it totals, which is often the only memorable part.
    const haystack = `${row.metric.name ?? ''} ${row.metric.description ?? ''}`.toLowerCase()
    return haystack.includes(term)
  })
})

/**
 * The sections the page renders: one per module, each already sorted.
 *
 * Sections are always ordered by module name — the chosen sort applies WITHIN a
 * section. Sorting the sections themselves by, say, status would mean a module
 * heading moving every time a metric finishes compiling, and the grouping is
 * there to be a stable place to look.
 */
const groups = computed(() => {
  const byModule = new Map()
  for (const row of visible.value) {
    if (!byModule.has(row.moduleId)) byModule.set(row.moduleId, [])
    byModule.get(row.moduleId).push(row)
  }

  const sort = filters.value.sort
  const compare = {
    name: (a, b) => String(a.metric.name).localeCompare(String(b.metric.name)),
    // Inside one module every row shares a module name, so this degrades to
    // name order rather than leaving the list in whatever order IndexedDB
    // returned. The sort still does real work across sections.
    module: (a, b) =>
      a.moduleName.localeCompare(b.moduleName) ||
      String(a.metric.name).localeCompare(String(b.metric.name)),
    status: (a, b) =>
      metricStateRank(a.state) - metricStateRank(b.state) ||
      String(a.metric.name).localeCompare(String(b.metric.name)),
  }[sort]

  return [...byModule.entries()]
    .map(([moduleId, rows]) => ({
      moduleId,
      label: moduleLabel(moduleId),
      rows: rows.slice().sort(compare),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

async function togglePublish(m) {
  // ⚠ Read the intent BEFORE the mutation, not after.
  //
  // `m` is a live SyncEngine record, and the ObjectPool guarantees that the same
  // id resolves to the same Vue object everywhere — so the findByPk inside
  // publishMetric returns THIS object, and `m.isPublished = next` mutates it in
  // place. Reading `m.isPublished` in the toast therefore read the value the
  // save had just written, and every message described the opposite of what had
  // happened: publishing a metric reported "Metric unpublished."
  //
  // The reactivity that makes the card update without a refetch is the same
  // reactivity that moved this value underneath the toast. Capturing `next`
  // first is what makes the message describe the action rather than re-read
  // state that the action has already changed.
  const next = !m.isPublished
  try {
    await publishMetric({ id: m.id, next })
    toast.success(
      next
        ? 'Metric published. It will appear in dashboards within 15 minutes, once the next analytics refresh runs.'
        : 'Metric unpublished. It stays saved and stops being counted.',
    )
  } catch (err) {
    toast.error(err?.message || 'Could not change whether this metric is published')
  }
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconMathFunction" title="Metrics">
      <template #actions>
        <BaseButton v-if="canCreate && entitled !== false" size="sm" @click="create">
          <IconPlus :size="14" aria-hidden="true" />
          New metric
        </BaseButton>
      </template>
    </PageHeader>

    <PageSection v-if="entitled === false" variant="card">
      <BaseEmptyState
        :icon="IconLock"
        title="Not included in your plan"
        description="Reports & Dashboards is not part of your current subscription."
      />
    </PageSection>

    <template v-else>
      <PageSection variant="card">
        <BaseText variant="caption" color="secondary">
          Metrics defined here sit alongside the ones Qability ships. Publish one and it can be
          used on a dashboard, in a report or as an alert threshold — and like every other metric,
          each reader sees only the records their own access allows.
        </BaseText>
      </PageSection>

      <!-- Only once there is something to filter. A toolbar above an empty
           state is three controls that can only ever produce the same empty
           state. -->
      <BaseFilterBar
        v-if="(metrics?.length ?? 0) > 0"
        v-model:search="filters.search"
        searchPlaceholder="Search metrics…"
        :showClear="hasActiveFilters"
        @clear="clearFilters"
      >
        <template #filters>
          <BaseSelect
            v-model="filters.moduleId"
            :options="moduleOptions"
            nullLabel="All modules"
            :clearable="true"
            :searchable="false"
            size="sm"
            aria-label="Filter by module"
          />
          <BaseSelect
            v-model="filters.state"
            :options="METRIC_STATE_OPTIONS"
            nullLabel="Any status"
            :clearable="true"
            :searchable="false"
            size="sm"
            aria-label="Filter by status"
          />
          <BaseSelect
            v-model="filters.sort"
            :options="METRIC_SORT_OPTIONS"
            :required="true"
            :searchable="false"
            size="sm"
            aria-label="Sort metrics"
          />
        </template>
      </BaseFilterBar>

      <PageSection v-if="(metrics?.length ?? 0) === 0">
        <BaseEmptyState
          title="No metrics defined yet"
          :description="
            canCreate
              ? 'Create one to measure something the shipped metrics do not cover.'
              : 'Nobody has defined a metric for this workspace yet.'
          "
        >
          <template #action>
            <BaseButton v-if="canCreate" size="sm" @click="create">
              <IconPlus :size="14" aria-hidden="true" />
              New metric
            </BaseButton>
          </template>
        </BaseEmptyState>
      </PageSection>

      <!-- Distinct from "none defined": metrics exist, the filters just exclude
           them all. Saying so — and offering the way back — is the difference
           between a narrowed list and an app that looks broken. -->
      <PageSection v-else-if="groups.length === 0">
        <BaseEmptyState
          :icon="IconSearch"
          title="No metrics match"
          description="Nothing here matches the current search and filters."
        >
          <template #action>
            <BaseButton size="sm" variant="outline" @click="clearFilters">
              Clear filters
            </BaseButton>
          </template>
        </BaseEmptyState>
      </PageSection>

      <!-- One section per module. The count is in the heading rather than a
           badge on each card: the question this grouping answers is "how much
           has this module been measured", and that is a per-module number. -->
      <template v-else>
        <PageSection
          v-for="group in groups"
          :key="group.moduleId"
          :title="group.label"
          :subtitle="`${group.rows.length} ${group.rows.length === 1 ? 'metric' : 'metrics'}`"
        >
          <ContentGrid min="20rem">
            <BaseCard v-for="{ metric: m } in group.rows" :key="m.id" class="tw:h-full">
              <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
                <!-- No module line here any more: the section heading above
                     already names it, and repeating it on every card inside
                     that section is the same word twice on one screen. -->
                <div class="tw:min-w-0">
                  <BaseText weight="medium" class="tw:truncate">{{ m.name }}</BaseText>
                </div>
                <BaseBadge
                  v-if="m.compileError"
                  class="tw:bg-amber-100 tw:text-amber-800"
                  aria-label="Needs attention"
                >
                  <template #icon>
                    <IconAlertTriangle :size="12" aria-hidden="true" />
                  </template>
                  Needs attention
                </BaseBadge>
                <!--
                  The fourth state, and the one that prompted all of this.

                  metric_catalog() omits a metric with no rollup rows, so between
                  publishing and the next */15 tick a metric is not merely empty —
                  it is ABSENT from every picker, with nothing anywhere saying why.
                  The obvious reading is that publishing failed.

                  Absence from the catalog is exactly that window, so it is what
                  this badge tests. No timestamp is claimed: the catalog carries no
                  computed_at, and inventing one would be worse than saying nothing.
                -->
                <!--
                  Ran, and matched nothing. NOT an error — the definition is
                  valid and zero is the honest answer — but it will never show a
                  figure until someone changes it, so it must not sit under a
                  badge that says "wait".
                -->
                <BaseBadge
                  v-else-if="stateOf(m) === 'empty'"
                  class="tw:bg-orange-100 tw:text-orange-800"
                >
                  <template #icon>
                    <IconAlertTriangle :size="12" aria-hidden="true" />
                  </template>
                  No matching records
                </BaseBadge>
                <BaseBadge
                  v-else-if="m.isPublished && !catalogRow(m)"
                  class="tw:bg-amber-100 tw:text-amber-800"
                >
                  <template #icon>
                    <IconClock :size="12" aria-hidden="true" />
                  </template>
                  Preparing
                </BaseBadge>
                <BaseBadge v-else-if="m.isPublished" class="tw:bg-blue-100 tw:text-blue-700">
                  Published
                </BaseBadge>
                <BaseBadge v-else class="tw:bg-gray-100 tw:text-gray-700">Draft</BaseBadge>
              </div>

              <BaseText
                v-if="m.description"
                variant="caption"
                color="secondary"
                class="tw:mt-1 tw:line-clamp-2"
              >
                {{ m.description }}
              </BaseText>

              <!-- The compiler's own words. Not paraphrased: it names the field or
                   the rule that failed, and a friendlier summary would lose the
                   one detail that makes it fixable. -->
              <BaseText v-if="m.compileError" variant="caption" color="bad" class="tw:mt-2">
                {{ m.compileError }}
              </BaseText>

              <!-- Says what "Preparing" means, so the badge is not another thing
                   to decode. Only while it applies. -->
              <!--
                Names the cause and the fix. The old copy said "figures are
                worked out every 15 minutes" for this case too — a promise the
                metric could never keep, which is how a filter on a status that
                does not exist went unnoticed.
              -->
              <BaseText
                v-else-if="stateOf(m) === 'empty'"
                variant="caption"
                color="secondary"
                class="tw:mt-2"
              >
                Checked {{ checkedAt(m) }} — nothing matched. The definition is valid, so this is a real zero: usually a filter
                naming a value that no record uses. Edit to check the filters.
              </BaseText>
              <BaseText
                v-else-if="m.isPublished && !catalogRow(m)"
                variant="caption"
                color="secondary"
                class="tw:mt-2"
              >
                Not on dashboards yet — figures are worked out every 15 minutes. Refresh now to
                skip the wait.
              </BaseText>

              <div class="tw:mt-3 tw:flex tw:items-center tw:justify-between">
                <BaseButton
                  v-if="canUpdate"
                  size="sm"
                  variant="outline"
                  :disabled="!!m.compileError && !m.isPublished"
                  :title="
                    m.compileError && !m.isPublished
                      ? 'Fix the problem above before publishing'
                      : undefined
                  "
                  @click="togglePublish(m)"
                >
                  {{ m.isPublished ? 'Unpublish' : 'Publish' }}
                </BaseButton>
                <span v-else />

                <div class="tw:flex tw:items-center tw:gap-1">
                  <!--
                    On EVERY card, including drafts and the ones that matched
                    nothing. The preview endpoint takes a definition rather than
                    an id and rolls its transaction back, so "is it published"
                    simply does not apply — unlike Refresh below.

                    It earns its place most on the two states that currently
                    send the reader to Edit: a draft, which has no figures
                    anywhere else, and "No matching records", where seeing the
                    empty result beside the filters is the whole diagnosis.
                  -->
                  <BaseButton
                    size="sm"
                    variant="ghost"
                    :aria-label="`Preview metric ${m.name}`"
                    title="See this metric's figures, computed live"
                    @click="previewing = m"
                  >
                    <IconEye :size="14" aria-hidden="true" />
                  </BaseButton>
                  <!-- Only for a published metric with no compile error: there is
                       nothing to recompute for a draft (the rollup fan-out skips
                       inactive metrics) or for one that never compiled. -->
                  <BaseButton
                    v-if="canUpdate && m.isPublished && !m.compileError"
                    size="sm"
                    variant="ghost"
                    :loading="refreshing.has(metricKeyOf(m))"
                    :aria-label="`Refresh metric ${m.name} now`"
                    title="Recompute this metric now instead of waiting for the next 15-minute refresh"
                    @click="refreshMetric(m)"
                  >
                    <IconRefresh :size="14" aria-hidden="true" />
                  </BaseButton>
                  <BaseButton
                    v-if="canUpdate"
                    size="sm"
                    variant="ghost"
                    :aria-label="`Edit metric ${m.name}`"
                    @click="edit(m)"
                  >
                    <IconPencil :size="14" aria-hidden="true" />
                  </BaseButton>
                  <BaseButton
                    v-if="canDelete"
                    size="sm"
                    variant="ghost"
                    :aria-label="`Delete metric ${m.name}`"
                    @click="remove(m)"
                  >
                    <IconTrash :size="14" aria-hidden="true" />
                  </BaseButton>
                </div>
              </div>
            </BaseCard>
          </ContentGrid>
        </PageSection>
      </template>
    </template>

    <!-- One at a time, and nothing runs until the panel's own Preview button is
         pressed: each run recomputes a rollup server-side. -->
    <CustomMetricPreviewDialog
      v-model="previewOpen"
      :metric="previewing"
      :fields="moduleFields || []"
    />
  </BasePage>
</template>
