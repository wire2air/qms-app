import { describe, it, expect, vi, beforeEach } from 'vitest'
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

let savedSetting = null
const setSetting = vi.fn(async (key, value) => {
  savedSetting = value
})
vi.mock('@/composables/useUserSettings', () => ({
  useUserSettings: () => ({
    getSetting: (key, fallback) => (savedSetting !== null ? savedSetting : fallback),
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
}

const DashboardHome = (await import('./DashboardHome.vue')).default

function mountHome() {
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
    savedSetting = null
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
    savedSetting = null
    setSetting.mockClear()
  })

  it('silently drops a saved widget id whose permission was since revoked', () => {
    // The user previously enabled 'audits' while they held audit_management:read.
    savedSetting = ['kpis', 'my-tasks', 'audits']
    grantedPermissions = [] // permission since revoked
    const w = mountHome()

    // No error, no dangling widget — it just isn't in the rendered grid.
    expect(w.find('.stub-audits').exists()).toBe(false)
    expect(w.find('.stub-my-tasks').exists()).toBe(true)
  })

  it('keeps a saved widget id whose permission is still held', () => {
    savedSetting = ['kpis', 'my-tasks', 'audits']
    grantedPermissions = ['audit_management:read']
    const w = mountHome()
    expect(w.find('.stub-audits').exists()).toBe(true)
  })
})
