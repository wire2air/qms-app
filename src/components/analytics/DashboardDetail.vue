<script setup>
/**
 * One dashboard, rendered.
 *
 * ── WHAT "RENDERING A DASHBOARD" ACTUALLY IS ────────────────────────────────
 * Not loading data. The stored rows contain a metric key, a dimension, a period
 * token and some filters — no numbers at all — so opening a board means asking
 * each tile to compute its own answer under the CURRENT viewer's access scope.
 * This component therefore fetches the widget DEFINITIONS and nothing else; each
 * AnalyticsQuestionTile issues its own requests.
 *
 * That is what makes sharing safe. Two people opening the same board run the
 * same questions and legitimately get different figures, and neither can ever
 * see the other's — because the other's numbers were never written down.
 *
 * ── EDIT AFFORDANCES ARE A COURTESY, NOT THE GATE ───────────────────────────
 * canEditDashboard() decides whether to SHOW the edit controls. It is not the
 * enforcement: RLS is, and it refuses the write regardless of what the client
 * offers. The client-side check exists so we don't present a button that
 * produces an error — not because hiding it protects anything.
 */
import { canEditDashboard, reindexPositions } from '@/utils/analyticsDashboardAccess.js'
import { currentSession } from '@/utils/currentSession'
import { IconChartBar, IconPlus, IconGripVertical, IconPencil, IconTrash } from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const dashboardId = computed(() => String(route.params.id ?? ''))

// `dashboard` deliberately has NO `initial`, so it stays undefined until the
// first result lands. The template distinguishes undefined (still loading) from
// null (genuinely not found / not readable) — collapsing the two would flash
// "Dashboard not found" on every navigation.
const dashboard = useLiveQueryWithDeps(
  [() => dashboardId.value],
  async (db, [id]) => (id ? await db.AnalyticsDashboard.findByPk(id) : null),
  { models: 'AnalyticsDashboard' },
)

// Definitions only. Never values.
const widgets = useLiveQueryWithDeps(
  [() => dashboardId.value],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AnalyticsWidget.where('dashboardId', id).exec()
    return rows.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  },
  { models: 'AnalyticsWidget', initial: [] },
)

const { metrics, loading: metricsLoading } = useMetricCatalog()

const metricsByKey = computed(() => {
  const out = {}
  for (const m of metrics.value ?? []) out[m.metricKey] = m
  return out
})

/**
 * What a widget is CALLED, for the reorder grip's label and its move
 * announcement. Falls back the same way the tile itself does — a blank title
 * means "use the metric's own name" — so the spoken name matches the seen one.
 */
function widgetLabel(w) {
  return w?.title?.trim() || metricsByKey.value[w?.metricKey]?.name || 'Widget'
}

const viewer = computed(() => ({
  userId: currentSession.value?.id ?? null,
  // The server is authoritative; this only decides which buttons to draw.
  canManage: !!currentSession.value?.permissions?.includes?.('reports_dashboards:manage'),
}))

const canEdit = computed(() => canEditDashboard(dashboard.value, viewer.value))

// ── widget dialog ───────────────────────────────────────────────────────────
const dialogOpen = ref(false)
const editing = ref(null)

function addWidget() {
  editing.value = null
  dialogOpen.value = true
}
function editWidget(w) {
  editing.value = w
  dialogOpen.value = true
}

const nextPosition = computed(() => (widgets.value?.length ?? 0))

// ── delete ──────────────────────────────────────────────────────────────────
const removeWidget = useLiveMutation(async (db, id) => {
  const w = await db.AnalyticsWidget.findByPk(id)
  if (w) await w.delete()
})

async function confirmRemove(w) {
  try {
    await removeWidget(w.id)
    toast.success('Widget removed')
  } catch (err) {
    toast.error(err?.message || 'Could not remove the widget')
  }
}

// ── drag reorder ────────────────────────────────────────────────────────────
// Reuses the app's existing sortable wrapper rather than adding a drag library.
// Positions are renumbered densely on drop: sparse or duplicated positions sort
// unstably, and a board whose tiles reshuffle on reload reads as a bug even
// though every value is correct.
const gridRef = ref(null)

const persistOrder = useLiveMutation(async (db, ordered) => {
  for (const { id, position } of ordered) {
    const w = await db.AnalyticsWidget.findByPk(id)
    if (w && w.position !== position) {
      w.position = position
      await w.save()
    }
  }
})

useListReorder(
  gridRef,
  () => widgets.value ?? [],
  {
    handle: '[data-drag-handle]',
    // Named rather than generic: a board can hold a dozen tiles, and "Moved to
    // position 3 of 9" leaves a screen-reader user to work out which tile moved.
    announce: (w, to, total) => `${widgetLabel(w)} moved to position ${to + 1} of ${total}.`,
    async onEnd() {
      if (!canEdit.value) return
      try {
        await persistOrder(reindexPositions(widgets.value ?? []))
      } catch (err) {
        toast.error(err?.message || 'Could not save the new order')
      }
    },
  },
)

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
  <BasePage width="wide">
    <PageHeader
      :icon="IconChartBar"
      :title="dashboard?.name || 'Dashboard'"
      :subtitle="dashboard?.description || ''"
    >
      <template #actions>
        <DashboardVisibilityBadgeById v-if="dashboard" :visibilityId="dashboard.visibility" />
        <BaseButton v-if="canEdit" size="sm" @click="addWidget">
          <IconPlus :size="14" aria-hidden="true" />
          Add widget
        </BaseButton>
      </template>
    </PageHeader>

    <BaseEmptyState
      v-if="dashboard === null"
      title="Dashboard not found"
      description="It may have been deleted, or it may be private to someone else."
    >
      <template #action>
        <BaseButton size="sm" variant="outline" @click="router.push('/analytics/dashboards')">
          Back to dashboards
        </BaseButton>
      </template>
    </BaseEmptyState>

    <template v-else>
      <BaseEmptyState
        v-if="(widgets?.length ?? 0) === 0"
        title="No widgets yet"
        :description="
          canEdit
            ? 'Add a tile and pick what it should answer.'
            : 'The owner has not added any tiles to this dashboard.'
        "
      >
        <template #action>
          <BaseButton v-if="canEdit" size="sm" @click="addWidget">
            <IconPlus :size="14" aria-hidden="true" />
            Add widget
          </BaseButton>
        </template>
      </BaseEmptyState>

      <ContentGrid v-else ref="gridRef" min="22rem">
        <div
          v-for="w in widgets"
          :key="w.id"
          :data-id="w.id"
          class="tw:relative tw:group"
        >
          <div
            v-if="canEdit"
            class="tw:absolute tw:right-2 tw:top-2 tw:z-10 tw:flex tw:items-center tw:gap-1
                   tw:opacity-0 tw:group-hover:opacity-100 tw:focus-within:opacity-100
                   tw:transition-opacity"
          >
            <button
              data-drag-handle
              type="button"
              class="tw:cursor-grab tw:rounded tw:p-1 tw:text-secondary hover:tw:text-on-main"
              :aria-label="`Reorder ${widgetLabel(w)}. Use arrow keys to move it, Home or End to send it to either end.`"
              aria-keyshortcuts="ArrowUp ArrowDown Home End"
            >
              <IconGripVertical :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="tw:rounded tw:p-1 tw:text-secondary hover:tw:text-on-main"
              aria-label="Edit widget"
              @click="editWidget(w)"
            >
              <IconPencil :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="tw:rounded tw:p-1 tw:text-secondary hover:tw:text-bad"
              aria-label="Remove widget"
              @click="confirmRemove(w)"
            >
              <IconTrash :size="16" aria-hidden="true" />
            </button>
          </div>

          <AnalyticsQuestionTile
            :question="questionOf(w)"
            :metric="metricsByKey[w.metricKey] ?? null"
          />
        </div>
      </ContentGrid>

      <AnalyticsWidgetDialog
        v-model:open="dialogOpen"
        :dashboardId="dashboardId"
        :metrics="metrics ?? []"
        :metricsLoading="metricsLoading"
        :widget="editing"
        :nextPosition="nextPosition"
      />
    </template>
  </BasePage>
</template>
