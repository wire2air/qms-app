import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// Docs/modules/dashboard 2026-09-07 addendum, finding 3: Quick Actions' 6
// tiles used to render unconditionally, unlike every other widget on the
// page (DashboardKpis' cards, the registry-level widget gates) — a viewer
// without a destination's permission saw a tile that dead-ended at
// /no-access. Each tile now carries the same permission its own route guard
// (or DashboardKpis' matching card) requires.
let grantedPermissions = []
vi.mock('@/utils/currentSession', () => ({
  isAllowed: (needed) => needed.every((p) => grantedPermissions.includes(p)),
}))

const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }

const DashboardQuickActions = (await import('./DashboardQuickActions.vue')).default

function mountWidget() {
  return mount(DashboardQuickActions, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('DashboardQuickActions — per-tile permission gating', () => {
  beforeEach(() => {
    grantedPermissions = []
  })

  it('shows only the always-open tile (My Tasks) when no permission is held', async () => {
    const w = mountWidget()
    expect(w.text()).toContain('My Tasks')
    expect(w.text()).not.toContain('Report Nonconformance')
    expect(w.text()).not.toContain('New CAPA')
    expect(w.text()).not.toContain('Documents')
    expect(w.text()).not.toContain('QC Inspection')
    expect(w.text()).not.toContain('Audits')
  })

  it('shows every tile once every permission is held', async () => {
    grantedPermissions = [
      'ncr:read',
      'capa:create',
      'document_control:read',
      'inspection_qc:read',
      'audit_management:read',
    ]
    const w = mountWidget()
    expect(w.text()).toContain('Report Nonconformance')
    expect(w.text()).toContain('New CAPA')
    expect(w.text()).toContain('Documents')
    expect(w.text()).toContain('QC Inspection')
    expect(w.text()).toContain('Audits')
  })

  // /capas/create is a write route — permissionGuard.js's createPermissionFrom
  // derives capa:create (not capa:read) for it. The tile must require the
  // permission the route guard actually checks, not the sibling list page's.
  it('gates "New CAPA" on capa:create, matching the route guard for /capas/create', async () => {
    grantedPermissions = ['capa:read'] // read only, no create
    let w = mountWidget()
    expect(w.text()).not.toContain('New CAPA')

    grantedPermissions = ['capa:create'] // create without read
    w = mountWidget()
    expect(w.text()).toContain('New CAPA')
  })
})
