import { describe, it, expect, vi } from 'vitest'
import { buildOptionSetSections, buildOptionSetActions } from './optionSetDetailConfig.js'

describe('buildOptionSetSections', () => {
  it('always returns a single details section', () => {
    const s = buildOptionSetSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
    expect(s[0].label).toBeTruthy()
  })
})

describe('buildOptionSetActions', () => {
  it('returns a single delete descriptor', () => {
    expect(buildOptionSetActions({}, {}).map((a) => a.id)).toEqual(['delete'])
  })

  it('delete is a danger action visible only when canDelete', () => {
    const del = (gates) => buildOptionSetActions(gates, {})[0]
    expect(del({ canDelete: true }).visible).toBe(true)
    expect(del({ canDelete: true }).variant).toBe('danger')
    expect(del({ canDelete: false }).visible).toBe(false)
  })

  it('CFL L-1: canUpdate alone no longer reveals Delete', () => {
    // The regression this finding is about. The detail page gated Delete on
    // option_sets:update while OptionSetsTab / OptionSetsHome gated the
    // identical operation on option_sets:delete, so the same button obeyed two
    // different permissions depending on which page you reached it from. A role
    // holding update but not delete — the seeded `Quality Manager` on app-db is
    // exactly that — got the button here and not there.
    //
    // Asserted explicitly rather than left to the test above: swapping the gate
    // back would still satisfy a `canDelete: true` case if someone passed both.
    const del = (gates) => buildOptionSetActions(gates, {})[0]
    expect(del({ canUpdate: true }).visible).toBe(false)
    expect(del({ canUpdate: true, canDelete: false }).visible).toBe(false)
    expect(del({ canUpdate: false, canDelete: true }).visible).toBe(true)
  })

  it('is hidden when no gates are supplied at all — fail closed', () => {
    expect(buildOptionSetActions({}, {})[0].visible).toBe(false)
    expect(buildOptionSetActions(undefined, {})[0].visible).toBe(false)
  })

  it('wires the delete handler to onSelect', () => {
    const del = vi.fn()
    buildOptionSetActions({}, { delete: del })[0].onSelect()
    expect(del).toHaveBeenCalled()
  })
})
