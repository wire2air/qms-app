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
} from '@/utils/analyticsCustomMetricAccess.js'
import { isAllowed } from '@/utils/currentSession'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. Same reasoning
// as ReportDetail's export: request_metric_refresh returns a graphile-worker job
// id, not a record, so there is nothing for the SyncEngine to cache or broadcast.
import { graphqlRequest } from '@syncEngine/network/graphqlClient.js'
import {
  IconMathFunction,
  IconRefresh,
  IconClock,
  IconPlus,
  IconLock,
  IconPencil,
  IconTrash,
  IconAlertTriangle,
} from '@tabler/icons-vue'

const toast = useToast()
const { entitled } = useAnalyticsEntitlement()

const metrics = useLiveQuery(
  async (db) => {
    const rows = await db.AnalyticsCustomMetric.where().exec()
    return rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  },
  { models: 'AnalyticsCustomMetric', initial: [] },
)

// The whole vocabulary, fetched ONCE here and handed to the dialog. The builder
// slices it by module and source table; re-querying it per dialog open would
// re-read the same static reference data on every click.
const fields = useLiveQuery(async (db) => db.AnalyticsModuleField.where().exec(), {
  models: 'AnalyticsModuleField',
  initial: [],
})

// The cap belongs to the ROLLUP (analytics_dimension_capacity), not to this
// page, so it is read from the catalog rather than written here — the same
// reasoning AnalyticsQuestionBuilder uses. Falls back to 3, which is the value
// the rollup ships with, so the builder still works if the catalog is empty.
const { metrics: catalog } = useMetricCatalog()
const dimensionCap = computed(() => catalog.value?.[0]?.dimensionCapacity ?? 3)

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

const dialogOpen = ref(false)
const editing = ref(null)

function create() {
  editing.value = null
  dialogOpen.value = true
}
function edit(m) {
  editing.value = m
  dialogOpen.value = true
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

/** Title-cased module slug, matching the builder. */
function moduleLabel(id) {
  return String(id ?? '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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

      <PageSection>
        <BaseEmptyState
          v-if="(metrics?.length ?? 0) === 0"
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

        <ContentGrid v-else min="20rem">
          <BaseCard v-for="m in metrics" :key="m.id" class="tw:h-full">
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
              <div class="tw:min-w-0">
                <BaseText weight="medium" class="tw:truncate">{{ m.name }}</BaseText>
                <BaseText variant="caption" color="secondary">
                  {{ moduleLabel(m.moduleId) }}
                </BaseText>
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

              <div v-if="canUpdate || canDelete" class="tw:flex tw:items-center tw:gap-1">
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

      <CustomMetricBuilderDialog
        v-model:open="dialogOpen"
        :metric="editing"
        :fields="fields ?? []"
        :dimensionCap="dimensionCap"
      />
    </template>
  </BasePage>
</template>
