import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'

// Docs/modules/dashboard 19-production-readiness.md's other top recommended
// test: "a unit/component test for the widget-registry permission filter +
// settings self-heal (R5/R7 — the mechanism behind this pack's headline
// security finding)". Before this pass, nothing exercised WIDGETS filtering
// or the enabledIds self-heal at all.

// The stubbed grid children (below) never mount for real, but DashboardHome
// statically imports their .vue files, which import useLiveQuery(WithDeps),
// which imports the real @models/index at module-load time regardless of
// whether the composable is ever called. That file's decorator-based model
// classes (@ClientModel/@Property) need the babel plugin vite.config.js wires
// in but this project's (intentionally lighter) vitest.config.js does not —
// loading it for real is a parse error, not a runtime one. Same avoidance as
// useLiveQuery.spec.js's own comment.
vi.mock('@models/index', () => ({ db: {} }))

let grantedPermissions = []
vi.mock('@/utils/currentSession', () => ({
  currentSession: { value: { name: 'Acme', userId: 'u1' } },
  isAllowed: (needed) => needed.every((p) => grantedPermissions.includes(p)),
}))

// Keyed by setting name, NOT one shared slot. The bag holds several unrelated
// keys — `dashboardWidgets` here, `starredDashboards` for the chip row — and a
// key-agnostic stub hands each reader whatever the last writer stored. That is
// how the starred-dashboards code came to read the widget array and issue a
// live entitlement query from this test.
const saved = {}
const setSetting = vi.fn(async (key, value) => {
  saved[key] = value
})
vi.mock('@/composables/useUserSettings', () => ({
  useUserSettings: () => ({
    getSetting: (key, fallback) => (key in saved ? saved[key] : fallback),
    setSetting,
  }),
}))

// useSortable drives real drag-and-drop DOM wiring this test doesn't exercise
// (drag itself is a browser/e2e concern) — no-op it so mounting doesn't reach
// for real pointer-event plumbing.
vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: () => {},
  moveArrayElement: () => {},
}))

// Every grid widget is a live-query component with its own db needs — stub
// them all so this file tests ONLY DashboardHome's registry/filter/self-heal
// logic, per the pack's own framing of what R5/R7 need pinned.
const stubs = {
  DashboardKpis: true,
  DashboardMyTasks: { template: '<div class="stub-my-tasks" />' },
  DashboardOpenNcs: { template: '<div class="stub-open-ncs" />' },
  DashboardCapasDue: { template: '<div class="stub-capas-due" />' },
  DashboardQuickActions: { template: '<div class="stub-quick-actions" />' },
  DashboardQcLots: { template: '<div class="stub-qc-lots" />' },
  DashboardDocsPending: { template: '<div class="stub-docs-pending" />' },
  DashboardRecentAudits: { template: '<div class="stub-audits" />' },
  DashboardEmbeddedGrid: { template: '<div class="stub-embedded-board" />' },
}

// ── Starred-dashboard chips ────────────────────────────────────────────────
// The chip row needs three things stubbed: the entitlement probe (a real
// GraphQL round trip), the live query that resolves ids to board rows, and
// DashboardEmbeddedGrid (its own live-query component). `starredBoards` is the
// dial each test turns.
let starredBoards = []
vi.mock('@/composables/useAnalyticsEntitlement', () => ({
  useAnalyticsEntitlement: () => ({ entitled: ref(true) }),
}))
vi.mock('@/composables/useLiveQuery', () => ({
  useLiveQuery: () => ref([]),
  useLiveQueryWithDeps: () => computed(() => starredBoards),
}))

const DashboardHome = (await import('./DashboardHome.vue')).default

/**
 * PageHeader teleports its title and #actions into the app chrome. Those
 * targets live in MainHeader, which is not mounted here, so without them Vue
 * warns on mount and — once an action becomes conditional — THROWS on update
 * while trying to patch into a null container.
 *
 * Creating them makes the teleport resolve, which is what lets a test toggle a
 * v-if'd header action at all. Nothing asserts on their contents; they exist so
 * the component under test can render the way it does in the app.
 */
function mountHome() {
  for (const id of ['main-header-title', 'main-header-actions']) {
    if (!document.getElementById(id)) {
      const el = document.createElement('div')
      el.id = id
      document.body.appendChild(el)
    }
  }
  return mount(DashboardHome, { global: { stubs } })
}

const ALL_PERMS = [
  'ncr:read',
  'capa:read',
  'inspection_qc:read',
  'document_control:read',
  'audit_management:read',
]

describe('DashboardHome — widget-registry permission gate (R5)', () => {
  beforeEach(() => {
    grantedPermissions = []
    for (const k of Object.keys(saved)) delete saved[k]
    setSetting.mockClear()
  })

  it('renders every gated grid widget when all 5 module permissions are held', () => {
    grantedPermissions = ALL_PERMS
    const w = mountHome()
    expect(w.find('.stub-open-ncs').exists()).toBe(true)
    expect(w.find('.stub-capas-due').exists()).toBe(true)
    expect(w.find('.stub-qc-lots').exists()).toBe(true)
    expect(w.find('.stub-docs-pending').exists()).toBe(true)
    expect(w.find('.stub-audits').exists()).toBe(true)
    // Ungated widgets always render regardless of permissions.
    expect(w.find('.stub-my-tasks').exists()).toBe(true)
    expect(w.find('.stub-quick-actions').exists()).toBe(true)
  })

  it('a widget with no matching permission never mounts, even structurally', () => {
    grantedPermissions = [] // holds nothing
    const w = mountHome()
    expect(w.find('.stub-open-ncs').exists()).toBe(false)
    expect(w.find('.stub-capas-due').exists()).toBe(false)
    expect(w.find('.stub-qc-lots').exists()).toBe(false)
    expect(w.find('.stub-docs-pending').exists()).toBe(false)
    expect(w.find('.stub-audits').exists()).toBe(false)
    // The two intentionally-ungated grid widgets are unaffected.
    expect(w.find('.stub-my-tasks').exists()).toBe(true)
    expect(w.find('.stub-quick-actions').exists()).toBe(true)
  })

  it('a gated widget the Customize dialog would show is structurally absent from its own data (CMP-11)', () => {
    grantedPermissions = ['ncr:read'] // only NCR
    const w = mountHome()
    const dialog = w.findComponent({ name: 'DashboardCustomizeDialog' })
    const ids = dialog.props('widgets').map((x) => x.id)
    expect(ids).toContain('open-ncs')
    expect(ids).not.toContain('capas-due')
    expect(ids).not.toContain('audits')
  })
})

describe('DashboardHome — stale-permission self-heal (R7)', () => {
  beforeEach(() => {
    grantedPermissions = []
    for (const k of Object.keys(saved)) delete saved[k]
    setSetting.mockClear()
  })

  it('silently drops a saved widget id whose permission was since revoked', () => {
    // The user previously enabled 'audits' while they held audit_management:read.
    saved.dashboardWidgets = ['kpis', 'my-tasks', 'audits']
    grantedPermissions = [] // permission since revoked
    const w = mountHome()

    // No error, no dangling widget — it just isn't in the rendered grid.
    expect(w.find('.stub-audits').exists()).toBe(false)
    expect(w.find('.stub-my-tasks').exists()).toBe(true)
  })

  it('keeps a saved widget id whose permission is still held', () => {
    saved.dashboardWidgets = ['kpis', 'my-tasks', 'audits']
    grantedPermissions = ['audit_management:read']
    const w = mountHome()
    expect(w.find('.stub-audits').exists()).toBe(true)
  })
})

/**
 * The chips SWITCH the view — they do not stack it.
 *
 * The first build APPENDED the selected board below the home widgets, and it
 * read wrong in use: you pick a board and the thing you picked is off-screen
 * under a full grid of unrelated widgets, with no sign it loaded. Reported from
 * the running app, not caught here, because nothing in this file touched the
 * chip row at all.
 *
 * What is pinned is the exclusivity in BOTH directions, because a one-way
 * assertion passes for a build that renders neither, or both.
 */
describe('DashboardHome — starred board replaces the home view', () => {
  beforeEach(() => {
    grantedPermissions = [...ALL_PERMS]
    for (const k of Object.keys(saved)) delete saved[k]
    saved.starredDashboards = ['d1']
    starredBoards = [{ id: 'd1', name: 'Custom Metrics' }]
  })

  it('shows the home widgets and no board until a chip is picked', () => {
    const wrapper = mountHome()
    expect(wrapper.find('.stub-my-tasks').exists()).toBe(true)
    expect(wrapper.find('.stub-embedded-board').exists()).toBe(false)
  })

  it('swaps the widgets out for the board when its chip is picked', async () => {
    const wrapper = mountHome()
    wrapper.vm.activeChip = 'd1'
    await wrapper.vm.$nextTick()

    // The board is on screen...
    expect(wrapper.find('.stub-embedded-board').exists()).toBe(true)
    // ...and the home widgets are GONE, not merely pushed below it. This is the
    // assertion the reported bug would fail.
    expect(wrapper.find('.stub-my-tasks').exists()).toBe(false)
    expect(wrapper.find('.stub-quick-actions').exists()).toBe(false)
  })

  // Switching back must RESTORE the home view — "Home" is the way back, and a
  // one-way swap would strand the user on a board.
  it('restores the home widgets when Home is picked again', async () => {
    const wrapper = mountHome()

    wrapper.vm.activeChip = 'd1'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.stub-my-tasks').exists()).toBe(false)

    wrapper.vm.activeChip = 'home'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.stub-my-tasks').exists()).toBe(true)
    expect(wrapper.find('.stub-embedded-board').exists()).toBe(false)
  })

  /**
   * Customize edits the home widget set, so it must not be offered over a
   * board — the dialog would list widgets that are not on screen.
   *
   * Asserted on the flag rather than the rendered button: PageHeader teleports
   * its #actions slot out of this wrapper, so wrapper.text() is empty here and
   * a text assertion would pass for ANY markup, including none.
   */
  it('withdraws the Customize affordance while a board is open', async () => {
    const wrapper = mountHome()
    expect(wrapper.vm.showHomeWidgets).toBe(true)

    wrapper.vm.activeChip = 'd1'
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showHomeWidgets).toBe(false)
  })
})
