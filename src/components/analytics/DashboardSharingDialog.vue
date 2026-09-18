<script setup>
/**
 * Change who can open a dashboard.
 *
 * ── WHY THIS COMPONENT EXISTS AT ALL ────────────────────────────────────────
 * `analytics_dashboards.visibility` has been a real, CHECK-constrained column
 * since the table shipped — `private` | `shared`, with an RLS read policy and a
 * covering index (`analytics_dashboards_read_idx`) built around it. The badge
 * displayed it, the list page grouped by it, and DashboardsHome even told people
 * "New dashboards start private. Share one when you want the team to see it."
 *
 * Nothing could set it. The only write anywhere in the app was
 * DashboardsHome's create, hardcoded to VISIBILITY.PRIVATE, and the sole
 * `v-model` on a visibility field in the whole of `src/` belonged to
 * ReportBuilderDialog — reports, not dashboards. So every dashboard was private
 * forever, the "Shared with you" group could never fill, and the caption above
 * the create box promised something the UI had no way to do.
 *
 * ── WHY A DIALOG RATHER THAN A SELECT IN THE HEADER ─────────────────────────
 * Because the choice is not the hard part — understanding it is. "Private" here
 * means private from EVERYONE, the company owner and administrators included,
 * which is unusual in this codebase and is the thing people get wrong. And
 * "shared" shares the QUESTION, never the answer: two people opening the same
 * board legitimately see different figures, because a widget stores a metric key
 * and a period, never a number. Both sentences live in VISIBILITY_META and both
 * need room to be read, which a header control does not have.
 *
 * ── THE GATE MIRRORS THE SERVER, AND ONLY THAT ──────────────────────────────
 * canEditDashboard() is the same predicate as analytics_dashboards_update_rls
 * (rls.sql): your own board, or any board if you hold reports_dashboards:manage
 * — with the company owner short-circuited inside isAllowed. It decides whether
 * the button is drawn. It is NOT the enforcement: RLS refuses the write no
 * matter what this component offers.
 *
 * Deliberately NO extra client-side rule. The UPDATE policy's WITH CHECK
 * constrains company_id and nothing else, so a manage-holder may re-share any
 * board they can edit — including a seeded one. Blocking that here would put a
 * rule in the mirror that the server does not hold, which is exactly what
 * analyticsDashboardAccess.js warns against. The seeded-board hazard is real, so
 * it is SAID rather than enforced — see the banner below.
 */
import { VISIBILITY, canEditDashboard } from '@/utils/analyticsDashboardAccess.js'
import { IconAlertTriangle } from '@tabler/icons-vue'

const props = defineProps({
  // A live SyncEngine row, or null while the parent is still resolving one.
  dashboard: { type: Object, default: null },
  // The parent already computed this to decide whether to draw its trigger;
  // passed in rather than recomputed so the two can never disagree.
  viewer: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['saved'])
const open = defineModel('open', { type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)
const visibility = ref(VISIBILITY.PRIVATE)

// Re-seed every time the dialog opens, so cancelling and reopening does not
// resurrect the abandoned choice. A plain string, so unlike ReportBuilderDialog
// there is no clone to get wrong — the DataCloneError that made the report Edit
// button silently inert cannot arise here.
watch(
  () => [open.value, props.dashboard?.id],
  () => {
    if (!open.value) return
    visibility.value = props.dashboard?.visibility ?? VISIBILITY.PRIVATE
  },
  { immediate: true },
)

const canEdit = computed(() => canEditDashboard(props.dashboard, props.viewer))

const changed = computed(
  () => !!props.dashboard && visibility.value !== props.dashboard.visibility,
)

/**
 * Taking a SHIPPED board private is recoverable only by hand, and the reason is
 * not obvious from the screen.
 *
 * Seeded persona boards are inserted as 'shared' and owned by the company
 * owner (20260817190000-analytics-persona-dashboards.js). Setting one to
 * private therefore hides it from the entire company except that one account —
 * and the next upgrade does NOT put it back: the re-seed's ON CONFLICT DO
 * UPDATE touches description, persona and is_system, never visibility.
 *
 * So it is not irreversible — someone can set it back to Shared here — but
 * nothing will do it FOR them, and the board is missing for everyone until they
 * do. Compare the DELETE policy, which refuses seeded boards outright for the
 * same class of reason. The write is still allowed, so the honest thing is to
 * make the consequence legible at the moment of choosing.
 */
const unsharingSeededBoard = computed(
  () => !!props.dashboard?.isSystem && visibility.value === VISIBILITY.PRIVATE,
)

const setVisibility = useLiveMutation(async (db, { id, value }) => {
  const d = await db.AnalyticsDashboard.findByPk(id)
  // Not a redundant check: the board can be deleted by someone else while this
  // dialog sits open, and assigning onto undefined would fail with a message
  // that says nothing about what happened.
  if (!d) throw new Error('That dashboard no longer exists.')
  d.visibility = value
  await d.save()
  return d
})

async function save() {
  if (!canEdit.value || !changed.value || saving.value) return
  saving.value = true
  try {
    const saved = await setVisibility({ id: props.dashboard.id, value: visibility.value })
    toast.success(
      visibility.value === VISIBILITY.SHARED
        ? 'Dashboard shared with your team'
        : 'Dashboard is now private',
    )
    emit('saved', saved)
    open.value = false
  } catch (err) {
    // Surfaced, never swallowed. RLS refusing this write is the expected
    // failure — a board someone else owns, or an entitlement that lapsed —
    // and a silent no-op would read as the save having worked.
    toast.error(err?.message || 'Could not change who can see this dashboard')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    title="Sharing"
    subtitle="Who can open this dashboard. Sharing shares the question, not the answer — every reader still sees only the records their own access allows."
    size="md"
    persistent
    showClose
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <!--
        The purpose-built picker, not a BaseSelect assembled here. It already
        derives its two options from VISIBILITY_META — so the wording in the
        dropdown, the badge tooltip and the list page can never drift apart —
        and it renders the badge itself as the selected value, which keeps the
        chosen state reading identically to how it reads everywhere else.

        It had no callers before this dialog. That is the whole shape of this
        gap: the column, the RLS policy, the badge, the list grouping and this
        picker were all built, and nothing ever put the picker on a screen.
      -->
      <DashboardVisibilitySelectMenu
        v-model="visibility"
        label="Visibility"
        :disabled="!canEdit"
      />

      <BaseBanner
        v-if="unsharingSeededBoard"
        tone="warning"
        :icon="IconAlertTriangle"
        title="This is a board Qability ships"
        message="Making it private leaves it visible to its owner alone, and everyone else loses it. An upgrade will not put it back — re-seeding updates the description and persona, never the visibility — so someone has to set it back to Shared here by hand."
      />
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :loading="saving"
        :disabled="!canEdit || !changed"
        submitLabel="Save"
        :submitTitle="!changed ? 'Nothing to change' : undefined"
        @cancel="close"
        @submit="save"
      />
    </template>
  </BaseDialog>
</template>
