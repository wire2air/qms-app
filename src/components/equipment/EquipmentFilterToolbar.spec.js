import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * EquipmentFilterToolbar — the register's filter surface.
 *
 * Small, but it owns two things nothing else does. First, the chips are the ONLY
 * affordance for undoing a filter: the filter menu is a checkbox list inside a
 * popover, and a user who narrowed the register to VEHICLE and forgot has no
 * other way back. Second, the toolbar writes filter state as ARRAYS, and the
 * register's live query does `statuses.includes(...)` — so a chip remover that
 * wrote a scalar, or dropped the wrong value, would filter the register to
 * nothing with no error anywhere.
 *
 * The enum lists here are the third copy of STATUSES/CATEGORIES (the dialog's
 * <option>s and the server's frozen maps are the other two), so they are
 * asserted against, not just exercised.
 */
const MenuStub = {
  name: 'BaseFilterMenu',
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template: '<div class="filter-menu" :data-groups="items.map(i => i.group).join(\',\')" />',
}

function mountToolbar(filters) {
  return mount(EquipmentFilterToolbarLoaded, {
    props: { filters },
    global: { stubs: { BaseFilterMenu: MenuStub } },
  })
}

const EquipmentFilterToolbarLoaded = (await import('./EquipmentFilterToolbar.vue')).default

describe('EquipmentFilterToolbar — the applied-filter chips', () => {
  it('shows no chip row at all when nothing is filtered', () => {
    const w = mountToolbar({ search: '', status: [], category: [] })
    expect(w.text()).not.toContain('Filters')
    expect(w.text()).not.toContain('Clear all')
  })

  it('renders one removable chip per applied value, labelled for humans', () => {
    const w = mountToolbar({ search: '', status: ['IN_SERVICE', 'RETIRED'], category: ['VEHICLE'] })
    expect(w.text()).toContain('In service')
    expect(w.text()).toContain('Retired')
    expect(w.text()).toContain('Vehicle')
    // The stored value is the enum; the chip shows the label. A chip reading
    // "IN_SERVICE" would mean the label map had drifted out of the toolbar.
    expect(w.text()).not.toContain('IN_SERVICE')
    expect(w.findAll('button[aria-label^="Remove"]')).toHaveLength(3)
  })

  it('removing a chip drops exactly that value and keeps the array shape', async () => {
    const w = mountToolbar({ search: '', status: ['IN_SERVICE', 'RETIRED'], category: ['VEHICLE'] })
    await w.find('button[aria-label="Remove Retired filter"]').trigger('click')

    const next = w.emitted('update:filters').at(-1)[0]
    expect(Array.isArray(next.status), 'the register does statuses.includes() on this').toBe(true)
    expect(next.status).toEqual(['IN_SERVICE'])
    expect(next.category, 'the other dimension is untouched').toEqual(['VEHICLE'])
  })

  it('Clear all resets every dimension INCLUDING the search box', async () => {
    const w = mountToolbar({ search: 'calipers', status: ['RETIRED'], category: ['VEHICLE'] })
    await w.find('button.tw\\:ms-1').trigger('click')

    const next = w.emitted('update:filters').at(-1)[0]
    expect(next).toMatchObject({ search: '', status: [], category: [] })
  })

  it('an unlabelled enum value falls back to itself rather than rendering blank', () => {
    // `database/seeder-local.sql` seeds categories ('LAB', 'PRODUCTION') that no
    // write path can produce and no label map knows. They must still be
    // removable — a blank chip with a Remove button is unusable.
    const w = mountToolbar({ search: '', status: [], category: ['LAB'] })
    expect(w.text()).toContain('LAB')
    expect(w.find('button[aria-label="Remove LAB filter"]').exists()).toBe(true)
  })

  it('tolerates a non-array filter value instead of throwing', () => {
    // The filter state is URL-synced (`syncUrl: true`), so a hand-edited or
    // stale query string can deliver a scalar where an array is expected.
    expect(() => mountToolbar({ search: '', status: 'IN_SERVICE', category: null })).not.toThrow()
  })
})

describe('EquipmentFilterToolbar — the dimensions it offers', () => {
  it('offers exactly status and category', () => {
    const w = mountToolbar({ search: '', status: [], category: [] })
    expect(w.find('.filter-menu').attributes('data-groups')).toBe('status,category')
  })

  it('the option lists are the server enums, and nothing else', () => {
    const w = mountToolbar({ search: '', status: [], category: [] })
    const items = w.findComponent(MenuStub).props('items')
    expect(items.find((i) => i.group === 'status').options.map((o) => o.value)).toEqual([
      'IN_SERVICE',
      'OUT_OF_SERVICE',
      'RETIRED',
    ])
    expect(items.find((i) => i.group === 'category').options.map((o) => o.value)).toEqual([
      'INSTRUMENT',
      'MACHINE',
      'VEHICLE',
      'SENSOR',
      'OTHER',
    ])
  })
})
