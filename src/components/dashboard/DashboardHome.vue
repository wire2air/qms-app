<script setup>
/**
 * QA dashboard — live widgets over IDB (no fake data). Users pick which
 * widgets show via the Customize dialog AND drag panels to reorder them; both
 * the selection and the order are persisted on users.settings.dashboardWidgets
 * (§39, an ordered array of enabled ids), so it follows the user across devices.
 *
 * The grid reorders by drag OR by keyboard, both through useListReorder. The
 * move onto that composable initially dropped `ghostClass: 'dashboard-ghost'`
 * — the composable built its Sortable options from a fixed list and silently
 * ignored the rest — so the 40%-opacity drop placeholder disappeared. Rather
 * than accept that as the price of keyboard access, the composable now forwards
 * ghostClass, which is a two-line passthrough and the same shape of omission it
 * already documents for `onEnd`. A cosmetic option going missing without a word
 * is how the NEXT consumer loses something that matters.
 */
import { IconAdjustmentsHorizontal, IconLayoutDashboard } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession'
import { useUserSettings } from '@/composables/useUserSettings'
import { useAnalyticsEntitlement } from '@/composables/useAnalytics.js'
import DashboardMyTasks from './DashboardMyTasks.vue'
import DashboardOpenNcs from './DashboardOpenNcs.vue'
import DashboardCapasDue from './DashboardCapasDue.vue'
import DashboardQuickActions from './DashboardQuickActions.vue'
import DashboardQcLots from './DashboardQcLots.vue'
import DashboardDocsPending from './DashboardDocsPending.vue'
import DashboardRecentAudits from './DashboardRecentAudits.vue'

const companyName = computed(() => currentSession.value?.name || currentSession.value?.code || '')

// ── Widget registry ───────────────────────────────────────────────────────
// Order here = the default order. kpis is a full-width summary strip pinned
// above the draggable grid; the rest reorder freely.
// `permission` gates a module widget on the same `:read` the sidebar/route guard
// use — a user without access never sees the widget (or its counts / links into
// a module they can't open), and can't enable it from the Customize dialog.
// Undefined = always available (kpis, my-tasks, quick-actions).
const WIDGETS = [
  { id: 'kpis', label: 'KPI Summary', full: true },
  { id: 'my-tasks', label: 'My Tasks' },
  { id: 'open-ncs', label: 'Open Nonconformances', permission: 'ncr:read' },
  { id: 'capas-due', label: 'CAPAs Due', permission: 'capa:read' },
  { id: 'quick-actions', label: 'Quick Actions' },
  { id: 'qc-lots', label: 'QC Inspection Lots', permission: 'inspection_qc:read' },
  { id: 'docs-pending', label: 'Documents Pending Approval', permission: 'document_control:read' },
  { id: 'audits', label: 'Audits', permission: 'audit_management:read' },
]
// Widgets the current user is permitted to see; drives both the rendered grid
// and the Customize dialog so a gated widget can never be enabled or shown.
const availableWidgets = computed(() =>
  WIDGETS.filter((w) => !w.permission || isAllowed([w.permission])),
)
const availableIds = computed(() => availableWidgets.value.map((w) => w.id))
// id → component for the reorderable grid (kpis excluded — rendered separately).
const GRID_COMPONENTS = {
  'my-tasks': DashboardMyTasks,
  'open-ncs': DashboardOpenNcs,
  'capas-due': DashboardCapasDue,
  'quick-actions': DashboardQuickActions,
  'qc-lots': DashboardQcLots,
  'docs-pending': DashboardDocsPending,
  audits: DashboardRecentAudits,
}
const GRID_IDS = Object.keys(GRID_COMPONENTS)

const toast = useToast()
const { getSetting, setSetting } = useUserSettings()

const enabledIds = computed(() => {
  const ids = getSetting('dashboardWidgets', null)
  if (!Array.isArray(ids)) return availableIds.value
  return ids.filter((id) => availableIds.value.includes(id))
})
const kpisOn = computed(() => enabledIds.value.includes('kpis'))

// ── Starred dashboards ─────────────────────────────────────────────────────
// A chip row above the widgets: "Home" plus one chip per starred analytics
// dashboard. Selecting a board APPENDS it below the home widgets rather than
// replacing them — the home view stays put, and a pinned board reads as an
// addition to it.
const { starredIds, pruneMissing } = useStarredDashboards()

// Tri-state: null while the check is in flight, so the row does not flash in
// and out on every load. A tenant without Reports & Dashboards never sees it.
//
// Gated on actually having a star: this is the HOME page, loaded by every user
// on every session, and most have starred nothing. An unconditional query here
// would add a GraphQL round trip to every page load to answer a question the
// page would then not use.
const { entitled } = useAnalyticsEntitlement({
  enabled: () => starredIds.value.length > 0,
})

// Resolve the starred ids to live rows. RLS decides what is in the sync stream,
// so a board that has been deleted — or flipped from `shared` back to `private`
// by its owner — simply is not here, and must render as nothing rather than as
// a chip that leads to an empty page.
const starredDashboards = useLiveQueryWithDeps(
  [() => starredIds.value.join(',')],
  async (db, [joined]) => {
    const ids = joined ? joined.split(',') : []
    if (!ids.length) return []
    const rows = await Promise.all(ids.map((id) => db.AnalyticsDashboard.findByPk(id)))
    // Keep the user's own order, drop what no longer resolves.
    return ids.map((id, i) => rows[i]).filter(Boolean)
  },
  { models: 'AnalyticsDashboard', initial: [] },
)

// Self-heal the stored list, the same way enabledIds self-heals against the
// widget registry above. Without this a board someone unshared leaves a dead id
// in the setting for ever.
//
// Guarded on a non-empty resolve: a live query returns [] before its first read
// too, and pruning on that would wipe every star on a slow load.
watch(starredDashboards, (list) => {
  if (!list) return
  if (!starredIds.value.length) return
  if (!list.length) return
  pruneMissing(list.map((d) => d.id))
})

const HOME_CHIP = 'home'
const activeChip = ref(HOME_CHIP)

const chips = computed(() => [
  { value: HOME_CHIP, label: 'Home' },
  ...(starredDashboards.value || []).map((d) => ({ value: d.id, label: d.name })),
])

// Only worth drawing when there is something to switch TO. A lone "Home" chip
// is a control that does nothing.
const showChips = computed(() => entitled.value === true && chips.value.length > 1)

const selectedDashboard = computed(() =>
  activeChip.value === HOME_CHIP
    ? null
    : (starredDashboards.value || []).find((d) => d.id === activeChip.value) || null,
)

// If the selected board stops resolving while it is open — unshared in another
// tab, or deleted — fall back to Home rather than leaving a chip selected that
// no longer names anything.
watch([activeChip, starredDashboards], () => {
  if (activeChip.value === HOME_CHIP) return
  const stillThere = (starredDashboards.value || []).some((d) => d.id === activeChip.value)
  if (!stillThere) activeChip.value = HOME_CHIP
})

// Local, reorderable copy of the enabled grid widgets (in saved order). The
// watch only reacts to MEMBERSHIP changes (a widget toggled in the Customize
// dialog) — an order-only change to the setting (our own drag persist) is
// ignored, otherwise it would echo back and revert the drop.
const gridOrder = ref([])
watch(
  enabledIds,
  (ids) => {
    const enabled = ids.filter((id) => GRID_IDS.includes(id))
    const sameSet =
      enabled.length === gridOrder.value.length &&
      enabled.every((id) => gridOrder.value.includes(id))
    if (sameSet) return
    // Preserve the current drag order; append newly-enabled, drop disabled.
    const kept = gridOrder.value.filter((id) => enabled.includes(id))
    gridOrder.value = [...kept, ...enabled.filter((id) => !kept.includes(id))]
  },
  { immediate: true },
)

// Reorder via the header grip, by drag OR by keyboard — the house composable
// owns both, plus the live-region announcement. Replaced a raw `useSortable` on
// 2026-09-17: the grip it drove was an `aria-hidden` <span>, so the order this
// PERSISTS was mouse-only (WCAG 2.1.1). See DashboardWidgetCard's header.
//
// The old handler moved the array twice — `moveArrayElement` updates gridOrder
// only on the next tick, so it recomputed the same splice by hand to get an
// order worth saving. useListReorder splices the array the getter returns
// SYNCHRONOUSLY, in one place, before it calls onEnd; by then gridOrder.value
// already holds the new order and persistOrder's default argument is correct.
// That is also what makes the keyboard path persist for free — it runs the same
// moveItem + onEnd pair, and there is no drag event to read indices off.
const gridRef = ref(null)

/** What a widget is CALLED — the same label its card shows in its header. */
function widgetLabel(id) {
  return WIDGETS.find((w) => w.id === id)?.label || id
}

useListReorder(gridRef, () => gridOrder.value, {
  handle: '[data-drag-handle]',
  ghostClass: 'dashboard-ghost',
  // Named rather than generic: the grid can hold seven panels, and "Moved to
  // position 2 of 6" leaves a screen-reader user to work out which one moved.
  announce: (id, to, total) => `${widgetLabel(id)} moved to position ${to + 1} of ${total}.`,
  // Awaited and caught, unlike the drag-only handler this replaced, which let
  // the save promise float. A rejected save used to be invisible-but-harmless:
  // the panels stayed where they were dropped and the order silently reverted
  // on reload. Now that the keyboard path persists through here too, a listener
  // who has just been TOLD the panel moved deserves to hear if it did not stick.
  async onEnd() {
    try {
      await persistOrder()
    } catch (err) {
      toast.error(err?.message || 'Could not save the new dashboard order')
    }
  },
})

async function persistOrder(order = gridOrder.value) {
  await setSetting('dashboardWidgets', [...(kpisOn.value ? ['kpis'] : []), ...order])
}

const showCustomize = ref(false)
async function saveEnabled(ids) {
  await setSetting('dashboardWidgets', ids)
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconLayoutDashboard" title="Dashboard">
      <template #subtitle>
        Welcome back! Here's what's happening with {{ companyName }} today.
      </template>
      <template #actions>
        <BaseButton variant="outline" size="sm" @click="showCustomize = true">
          <template #icon><IconAdjustmentsHorizontal :size="16" /></template>
          Customize
        </BaseButton>
      </template>
    </PageHeader>

    <!--
      Starred dashboards. Renders only when at least one board is starred, so
      the default home page is exactly what it was before this existed.

      BaseTabs rather than a hand-rolled button row: it is a real WAI-ARIA
      tablist with roving tabindex and Arrow/Home/End, and it handles horizontal
      overflow with edge fades and chevrons — which starts mattering at about
      eight stars on a laptop. There is no BaseChip in this design system
      despite what the CLAUDE.md table claims; `variant="pills"` is the chip
      look.
    -->
    <BaseTabs
      v-if="showChips"
      v-model="activeChip"
      :tabs="chips"
      variant="pills"
      ariaLabel="Home and starred dashboards"
    />

    <!-- KPI row (full width) -->
    <DashboardKpis v-if="kpisOn" />

    <!-- Reorderable widget grid: drag a panel by its header grip, or focus the
         grip and use the arrow keys. `:key` is the widget ID, not the loop
         index — an index key would keep each DOM node in place and rewrite its
         contents, so a moved panel's grip would stay focused on whatever now
         sits at that position and a run of ↑ presses would walk a different
         widget each time. IDs come from GRID_COMPONENTS' keys and enabledIds
         is filtered against them, so they are unique by construction. -->
    <div
      ref="gridRef"
      class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:xl:grid-cols-3 tw:gap-4 tw:items-start"
    >
      <component :is="GRID_COMPONENTS[id]" v-for="id in gridOrder" :key="id" />
    </div>

    <div
      v-if="!enabledIds.length"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-20 tw:text-secondary tw:gap-2"
    >
      <div class="tw:text-sm">Your dashboard is empty.</div>
      <BaseButton variant="outline" size="sm" @click="showCustomize = true">Add widgets</BaseButton>
    </div>

    <!--
      The selected starred board, APPENDED below the home widgets rather than
      replacing them: the home view stays where it was and the board reads as an
      addition to it.

      PageSection titles it, so a reader can tell whose numbers these are —
      without that, a second grid of tiles under the home widgets is
      unattributed. Read-only by design; see DashboardEmbeddedGrid.
    -->
    <PageSection
      v-if="selectedDashboard"
      :title="selectedDashboard.name"
      :icon="IconLayoutDashboard"
    >
      <DashboardEmbeddedGrid :dashboardId="selectedDashboard.id" />
    </PageSection>

    <DashboardCustomizeDialog
      v-model="showCustomize"
      :widgets="availableWidgets"
      :enabledIds="enabledIds"
      @save="saveEnabled"
    />
  </BasePage>
</template>

<style scoped>
/* The drop placeholder while a panel is being dragged. `:deep` because the
   class lands on a child component's root, which scoped styles cannot reach. */
:deep(.dashboard-ghost) {
  opacity: 0.4;
}
</style>
