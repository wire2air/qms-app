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
import { canManageCustomMetrics } from '@/utils/analyticsCustomMetricAccess.js'
import { currentSession } from '@/utils/currentSession'
import {
  IconMathFunction,
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

const viewer = computed(() => ({
  canManage: !!currentSession.value?.permissions?.includes?.('reports_dashboards:manage'),
}))
const canManage = computed(() => canManageCustomMetrics(viewer.value))

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

async function togglePublish(m) {
  try {
    await publishMetric({ id: m.id, next: !m.isPublished })
    toast.success(
      m.isPublished
        ? 'Metric unpublished. It stays saved and stops being counted.'
        : 'Metric published. Figures appear once the next refresh runs.',
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
        <BaseButton v-if="canManage && entitled !== false" size="sm" @click="create">
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
            canManage
              ? 'Create one to measure something the shipped metrics do not cover.'
              : 'Nobody has defined a metric for this workspace yet.'
          "
        >
          <template #action>
            <BaseButton v-if="canManage" size="sm" @click="create">
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

            <div class="tw:mt-3 tw:flex tw:items-center tw:justify-between">
              <BaseButton
                v-if="canManage"
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

              <div v-if="canManage" class="tw:flex tw:items-center tw:gap-1">
                <BaseButton
                  size="sm"
                  variant="ghost"
                  :aria-label="`Edit metric ${m.name}`"
                  @click="edit(m)"
                >
                  <IconPencil :size="14" aria-hidden="true" />
                </BaseButton>
                <BaseButton
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
