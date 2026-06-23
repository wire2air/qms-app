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

  it('delete is a danger action visible only when canUpdate', () => {
    const del = (gates) => buildOptionSetActions(gates, {})[0]
    expect(del({ canUpdate: true }).visible).toBe(true)
    expect(del({ canUpdate: true }).variant).toBe('danger')
    expect(del({ canUpdate: false }).visible).toBe(false)
  })

  it('wires the delete handler to onSelect', () => {
    const del = vi.fn()
    buildOptionSetActions({}, { delete: del })[0].onSelect()
    expect(del).toHaveBeenCalled()
  })
})
