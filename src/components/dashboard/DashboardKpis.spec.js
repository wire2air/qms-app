import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Fixture rows the mocked db hands back per model. Reassigned per test.
let ncRows = []
let capaRows = []
let taskRows = []
let lotRows = []

vi.mock('@models/index', () => ({
  db: {
    Nonconformance: { where: () => ({ exec: async () => ncRows }) },
    Capa: { where: () => ({ exec: async () => capaRows }) },
    TaskInstance: {
      where: (field, val) => ({
        exec: async () => taskRows.filter((t) => t[field] === val),
      }),
    },
    InspectionLot: { where: () => ({ exec: async () => lotRows }) },
  },
}))

// Isolate from the real currentSession module (syncEngine/decorator graph) —
// same pattern as src/router/permissionGuard.spec.js.
const currentSession = { value: { userId: 'u1' } }
let grantedPermissions = []
vi.mock('@/utils/currentSession', () => ({
  currentSession,
  isAllowed: (needed) => needed.every((p) => grantedPermissions.includes(p)),
}))

const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }

const DashboardKpis = (await import('./DashboardKpis.vue')).default

function mountWidget() {
  return mount(DashboardKpis, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

const ALL_PERMS = ['ncr:read', 'capa:read', 'inspection_qc:read']

describe('DashboardKpis — permission-gated cards (CMP-02)', () => {
  beforeEach(() => {
    ncRows = []
    capaRows = []
    taskRows = []
    lotRows = []
    grantedPermissions = ALL_PERMS
    currentSession.value = { userId: 'u1' }
  })

  it('renders all 4 cards when every permission is held', async () => {
    const w = mountWidget()
    await flushPromises()
    expect(w.text()).toContain('Open NCs')
    expect(w.text()).toContain('Open CAPAs')
    expect(w.text()).toContain('My Open Tasks')
    expect(w.text()).toContain('QC Lots Awaiting Disposition')
  })

  it('hides a card whose permission is not held, but keeps the ungated My Open Tasks card', async () => {
    grantedPermissions = ['capa:read'] // no ncr:read, no inspection_qc:read
    const w = mountWidget()
    await flushPromises()

    expect(w.text()).not.toContain('Open NCs')
    expect(w.text()).toContain('Open CAPAs')
    expect(w.text()).toContain('My Open Tasks') // permission: null — always shown
    expect(w.text()).not.toContain('QC Lots Awaiting Disposition')
  })

  it("My Open Tasks only ever shows the CURRENT user's tasks, never a teammate's", async () => {
    taskRows = [
      { id: 't1', assignedTo: 'u1', statusId: 'ASSIGNED', dueDate: null },
      { id: 't2', assignedTo: 'someone-else', statusId: 'ASSIGNED', dueDate: null },
    ]
    const w = mountWidget()
    await flushPromises()

    // Only u1's row counts — the client-side assignedTo filter this module's
    // pack (finding 4 / DS-03) relies on to stay safe under the broader
    // task_instance_select_rls policy.
    const card = w.findAll('a').find((a) => a.text().includes('My Open Tasks'))
    expect(card.text()).toContain('1')
  })

  it('does not count a CANCELLED nonconformance as an open NC (D-1)', async () => {
    ncRows = [
      { id: '1', statusId: 'OPEN', dueDate: null },
      { id: '2', statusId: 'CANCELLED', dueDate: null },
    ]
    const w = mountWidget()
    await flushPromises()

    const card = w.findAll('a').find((a) => a.text().includes('Open NCs'))
    expect(card.text()).toContain('1')
  })
})
