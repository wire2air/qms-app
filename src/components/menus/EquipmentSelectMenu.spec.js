import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * EquipmentSelectMenu — the picker Inspections & Logs uses to attach a log book
 * to an instrument (calibration logs, PM logs, equipment routines).
 *
 * All of its behaviour is in the list it hands `BaseSelect`, so that is what is
 * asserted. Three rules live here and nowhere else:
 *
 *   • RETIRED equipment is hidden by default. A decommissioned instrument must
 *     not be the subject of a NEW calibration log — and the register hides
 *     retired rows too, so a picker that offered them would be the only surface
 *     in the product suggesting they are still usable.
 *   • `includeRetired` is the escape hatch, for admin/archival views.
 *   • The site / department props CASCADE. A log book scoped to one site must
 *     not offer another site's gear; this is the only filter standing between
 *     the two, because `equipment_sel` is a bare company_id match and every
 *     instrument in the tenant is readable.
 */
let rows = []
vi.mock('@models/index', () => ({
  db: { Equipment: { where: () => ({ exec: async () => rows }) } },
}))

const EquipmentSelectMenu = (await import('./EquipmentSelectMenu.vue')).default

const SelectStub = {
  name: 'BaseSelect',
  props: [
    'modelValue',
    'options',
    'optionLabel',
    'optionValue',
    'required',
    'multiple',
    'clearable',
    'nullLabel',
    'disabled',
  ],
  template: '<div class="select" />',
}

async function mountMenu(props = {}) {
  const w = mount(EquipmentSelectMenu, {
    props,
    global: { stubs: { BaseSelect: SelectStub, EquipmentBadgeById: { template: '<span />' } } },
  })
  await flushPromises()
  return w
}

const offered = (w) => w.findComponent(SelectStub).props('options')

function eq(over = {}) {
  return {
    id: 'eq-1',
    name: 'Instrument',
    code: 'EQ-1',
    statusId: 'IN_SERVICE',
    siteId: 'site-1',
    departmentId: 'dept-1',
    ...over,
  }
}

beforeEach(() => {
  rows = []
})

describe('EquipmentSelectMenu', () => {
  it('hides RETIRED equipment by default', async () => {
    rows = [
      eq({ id: 'live', name: 'Live Gauge' }),
      eq({ id: 'gone', name: 'Old Gauge', statusId: 'RETIRED' }),
    ]
    const w = await mountMenu()
    expect(offered(w).map((o) => o.id)).toEqual(['live'])
  })

  it('includeRetired brings them back for an archival view', async () => {
    rows = [
      eq({ id: 'live', name: 'Live Gauge' }),
      eq({ id: 'gone', name: 'Old Gauge', statusId: 'RETIRED' }),
    ]
    const w = await mountMenu({ includeRetired: true })
    expect(offered(w).map((o) => o.id).sort()).toEqual(['gone', 'live'])
  })

  it('offers OUT_OF_SERVICE equipment, and carries the status through so it can be flagged', async () => {
    // Out of service is temporary downtime, not decommissioning — a PM log book
    // for gear that is down is exactly the thing you want to create. The option
    // slot renders an "Out of service" pill, which needs statusId on the option.
    rows = [eq({ id: 'down', name: 'Down Machine', statusId: 'OUT_OF_SERVICE' })]
    const w = await mountMenu()
    expect(offered(w)).toEqual([
      { id: 'down', name: 'Down Machine', code: 'EQ-1', statusId: 'OUT_OF_SERVICE' },
    ])
  })

  it('cascades on site', async () => {
    rows = [eq({ id: 'here', siteId: 'site-1' }), eq({ id: 'elsewhere', siteId: 'site-2' })]
    const w = await mountMenu({ siteId: 'site-1' })
    expect(offered(w).map((o) => o.id)).toEqual(['here'])
  })

  it('cascades on department, independently of site', async () => {
    rows = [
      eq({ id: 'ops', departmentId: 'dept-2' }),
      eq({ id: 'qa', departmentId: 'dept-1' }),
    ]
    const w = await mountMenu({ departmentId: 'dept-2' })
    expect(offered(w).map((o) => o.id)).toEqual(['ops'])
  })

  it('a null site or department is NOT a filter', async () => {
    rows = [eq({ id: 'a', siteId: 'site-1' }), eq({ id: 'b', siteId: null })]
    const w = await mountMenu({ siteId: null, departmentId: null })
    expect(offered(w).map((o) => o.id).sort()).toEqual(['a', 'b'])
  })

  it('sorts by name, so the list is scannable rather than in insertion order', async () => {
    rows = [eq({ id: '1', name: 'Zeta' }), eq({ id: '2', name: 'Alpha' }), eq({ id: '3', name: 'Mu' })]
    const w = await mountMenu()
    expect(offered(w).map((o) => o.name)).toEqual(['Alpha', 'Mu', 'Zeta'])
  })

  it('projects only id/name/code/statusId — the picker never carries the whole row', async () => {
    rows = [eq({ notes: 'secret', supplierId: 'sup-1' })]
    const w = await mountMenu()
    expect(Object.keys(offered(w)[0]).sort()).toEqual(['code', 'id', 'name', 'statusId'])
  })
})
