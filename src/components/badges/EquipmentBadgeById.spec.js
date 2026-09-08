import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * The Equipment badge triad — the module's only presence OUTSIDE the register.
 *
 * `EquipmentBadgeById` is what Inspections & Logs renders when a log book names
 * its instrument, and what `EquipmentSelectMenu` renders in its selected slot.
 * Nothing had ever mounted either.
 *
 * Two behaviours are worth pinning, and they pull in opposite directions:
 *
 *   • The badge's `initial` is `{ id }`, not null — so it renders the raw id
 *     immediately while IndexedDB resolves, rather than flashing blank. That is
 *     deliberate, and it is the OPPOSITE of the SiteBadgeById fix (where a
 *     soft-deleted site rendering nothing was the finding). Here a live query
 *     that resolves to null hides the badge entirely, and the fallback only
 *     covers the loading instant.
 *   • RETIRED equipment renders struck-through, which is the only place in the
 *     product where an instrument's status is visible away from the register.
 */
const findByPk = vi.fn()
vi.mock('@models/index', () => ({ db: { Equipment: { findByPk: (...a) => findByPk(...a) } } }))

const EquipmentBadgeById = (await import('./EquipmentBadgeById.vue')).default
const EquipmentBadge = (await import('./EquipmentBadge.vue')).default

beforeEach(() => findByPk.mockReset())

describe('EquipmentBadgeById', () => {
  it('renders the instrument name and code once IndexedDB resolves', async () => {
    findByPk.mockResolvedValue({ id: 'eq-1', name: 'Vernier Calipers', code: 'EQ-1', statusId: 'IN_SERVICE' })
    const w = mount(EquipmentBadgeById, { props: { equipmentId: 'eq-1' } })
    await flushPromises()

    expect(w.findComponent(EquipmentBadge).exists()).toBe(true)
    expect(w.text()).toContain('Vernier Calipers')
    expect(w.text()).toContain('EQ-1')
  })

  it('renders nothing at all for a null id', async () => {
    const w = mount(EquipmentBadgeById, { props: { equipmentId: null } })
    await flushPromises()
    expect(w.findComponent(EquipmentBadge).exists()).toBe(false)
    expect(findByPk, 'and does not query for it either').not.toHaveBeenCalled()
  })

  it('re-resolves when the id changes', async () => {
    findByPk.mockResolvedValueOnce({ id: 'a', name: 'First' })
    const w = mount(EquipmentBadgeById, { props: { equipmentId: 'a' } })
    await flushPromises()
    expect(w.text()).toContain('First')

    findByPk.mockResolvedValueOnce({ id: 'b', name: 'Second' })
    await w.setProps({ equipmentId: 'b' })
    await flushPromises()
    expect(w.text()).toContain('Second')
  })
})

describe('EquipmentBadge — status is the only thing that changes the styling', () => {
  const mountBadge = (equipment) => mount(EquipmentBadge, { props: { equipment } })

  it('strikes through a RETIRED instrument', () => {
    // The register hides RETIRED rows by default, so a log book that still
    // points at a decommissioned instrument is the ONLY place a user sees this.
    // Rendering it identically to a live one would silently attach a live-looking
    // instrument to a calibration log.
    const w = mountBadge({ id: 'eq-1', name: 'Old Gauge', statusId: 'RETIRED' })
    expect(w.html()).toContain('tw:line-through')
  })

  it('tints an OUT_OF_SERVICE instrument amber, and leaves an in-service one plain', () => {
    expect(mountBadge({ id: 'a', name: 'A', statusId: 'OUT_OF_SERVICE' }).html()).toContain(
      'tw:text-amber-700',
    )
    const live = mountBadge({ id: 'b', name: 'B', statusId: 'IN_SERVICE' }).html()
    expect(live).not.toContain('tw:text-amber-700')
    expect(live).not.toContain('tw:line-through')
  })

  it('falls back to the id, then to an em dash, rather than rendering blank', () => {
    expect(mountBadge({ id: 'eq-77' }).text()).toContain('eq-77')
    expect(mountBadge({}).text()).toContain('—')
  })

  it('carries no labels in SCHEME_MAP — styling only (badge-triad convention)', async () => {
    const source = (await import('./EquipmentBadge.vue?raw')).default
    const scheme = /const SCHEME_MAP = \{([\s\S]*?)\n\}/.exec(source)[1]
    expect(scheme, 'a label here would make the badge a second source of truth').not.toMatch(
      /name:|label:/,
    )
  })
})
