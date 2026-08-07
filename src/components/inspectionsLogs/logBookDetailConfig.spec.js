import { describe, it, expect, vi } from 'vitest'
import { buildLogBookSections, buildLogBookActions } from './logBookDetailConfig.js'

describe('buildLogBookSections', () => {
  it('returns a single details section', () => {
    const s = buildLogBookSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

describe('buildLogBookActions', () => {
  it('returns a single mark-obsolete descriptor', () => {
    expect(buildLogBookActions({}, {}).map((a) => a.id)).toEqual(['obsolete'])
  })

  it('obsolete is a danger action visible only with canUpdate + a loaded, non-obsolete book', () => {
    const a = (gates) => buildLogBookActions(gates, {})[0]
    expect(a({ canUpdate: true, hasLogBook: true }).visible).toBe(true)
    expect(a({ canUpdate: true, hasLogBook: true }).variant).toBe('danger')
    expect(a({ canUpdate: false, hasLogBook: true }).visible).toBe(false)
    expect(a({ canUpdate: true, hasLogBook: false }).visible).toBe(false)
    // Already obsolete → no action (reactivation happens on the Details tab).
    expect(a({ canUpdate: true, hasLogBook: true, isObsolete: true }).visible).toBe(false)
  })

  it('wires the markObsolete handler to onSelect', () => {
    const markObsolete = vi.fn()
    buildLogBookActions({}, { markObsolete })[0].onSelect()
    expect(markObsolete).toHaveBeenCalled()
  })
})
