<script setup>
/**
 * Put an already-composed question on a board.
 *
 * The one hand-off every metric surface was missing. The command centre and the
 * Explorer could both show a metric and neither could put it anywhere: a user
 * who found the right metric had to memorise its name, navigate to Dashboards,
 * open a board, open Add widget and find it again in a 140-row select. This
 * dialog is that step, and it is deliberately the ONLY new decision — the
 * question arrives fully formed from the surface that already knows it.
 *
 * Why a dialog and not a drawer, against the usual rule: CLAUDE.md reserves the
 * dialog for "a blocking must-resolve decision". Choosing the destination board
 * is exactly that — there is one question, it has no useful partial state, and
 * the surface underneath is what the user is comparing against. A drawer would
 * imply they can keep working while it is open; they cannot, because the next
 * click either commits the tile or abandons it.
 *
 * Boards are filtered to the ones the caller may actually write to. Offering
 * the rest produces a Save button that 403s, which teaches the user that the
 * feature is unreliable rather than that the board was someone else's.
 */
import { IconLayoutDashboard } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession'
import { DEFAULT_PERIOD_TOKEN } from '@/utils/analyticsPeriods.js'
import { canEditDashboard } from '@/utils/analyticsDashboardAccess.js'

const props = defineProps({
  /**
   * The question to store, already clamped by the caller. Shape matches
   * AnalyticsQuestionBuilder's model.
   */
  question: { type: Object, default: null },
  /** The catalog row, for the default title and the summary line. */
  metric: { type: Object, default: null },
})

const emit = defineEmits(['saved'])
const open = defineModel('open', { type: Boolean, default: false })

const toast = useToast()

const saving = ref(false)
const targetDashboard = ref(null)

const viewer = computed(() => ({
  userId: currentSession.value?.id ?? null,
  canManage: isAllowed(['analytics_dashboards:manage']),
}))

const dashboards = useLiveQuery(async (db) => await db.AnalyticsDashboard.where().exec(), {
  models: 'AnalyticsDashboard',
  initial: [],
})

const writable = computed(() =>
  (dashboards.value ?? [])
    .filter((d) => canEditDashboard(d, viewer.value))
    .map((d) => ({ value: d.id, label: d.name })),
)

/**
 * Re-seed on open so a cancelled attempt does not preselect last time's board,
 * and so a board deleted since the last open cannot linger as a stale target.
 * Not autoFilled: writing to the wrong board is silent — the tile simply is not
 * where the user expected — so the destination is always an explicit choice.
 */
watch(open, (isOpen) => {
  if (isOpen) targetDashboard.value = null
})

const canSave = computed(
  () => !!props.question?.metricKey && !!targetDashboard.value && !saving.value,
)

const saveAsWidget = useLiveMutation(async (db, { dashboardId, attrs }) => {
  // Appended, not inserted: position is the board's order and the user has not
  // been shown the board, so any other choice would be a guess about intent.
  const existing = await db.AnalyticsWidget.where('dashboardId', dashboardId).exec()
  const w = db.AnalyticsWidget.create({ ...attrs, dashboardId, position: existing.length })
  await w.save()
  return w
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  const q = props.question
  const board = writable.value.find((d) => d.value === targetDashboard.value)
  try {
    const saved = await saveAsWidget({
      dashboardId: targetDashboard.value,
      attrs: {
        metricKey: q.metricKey,
        title: q.title?.trim() ? q.title.trim() : null,
        viz: q.viz,
        dimension: q.dimension || null,
        periodToken: q.periodToken || DEFAULT_PERIOD_TOKEN,
        compare: q.compare || null,
        filters: q.filters ?? {},
      },
    })
    // useLiveMutation resolves with `undefined` on failure rather than throwing
    // (useLiveQuery.js:161-176), so everything below must be gated on the
    // returned record or a refused save reports success and closes.
    if (!saved) return

    // Names the board, because the tile lands somewhere the user is not looking.
    toast.success(`Added to ${board?.label ?? 'the dashboard'}`)
    emit('saved', { dashboardId: targetDashboard.value, widget: saved })
    open.value = false
  } catch (err) {
    toast.error(err?.message || 'Could not add the tile')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    title="Add to dashboard"
    subtitle="The tile is appended to the end of the board. Everyone sees it resolved under their own access."
    size="md"
    showClose
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div
        v-if="metric"
        class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-3"
      >
        <IconLayoutDashboard :size="16" class="tw:mt-0.5 tw:shrink-0 tw:text-secondary" />
        <div class="tw:flex tw:flex-col">
          <BaseText variant="body">{{ question?.title?.trim() || metric.name }}</BaseText>
          <BaseText v-if="metric.description" variant="caption" color="secondary">
            {{ metric.description }}
          </BaseText>
        </div>
      </div>

      <BaseSelect
        v-model="targetDashboard"
        :options="writable"
        label="Dashboard"
        :required="true"
        :autoFill="false"
        placeholder="Choose a dashboard"
      />

      <BaseEmptyState
        v-if="!writable.length"
        title="No dashboards you can edit"
        description="Create a dashboard first, or ask its owner to share it with you for editing."
      />
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :loading="saving"
        :disabled="!canSave"
        submitLabel="Add tile"
        :submitTitle="canSave ? undefined : 'Choose a dashboard first.'"
        @cancel="close"
        @submit="save"
      />
    </template>
  </BaseDialog>
</template>
