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
  it('returns a single archive descriptor', () => {
    expect(buildLogBookActions({}, {}).map((a) => a.id)).toEqual(['archive'])
  })

  it('archive is a danger action visible only with canUpdate + a loaded log book', () => {
    const a = (gates) => buildLogBookActions(gates, {})[0]
    expect(a({ canUpdate: true, hasLogBook: true }).visible).toBe(true)
    expect(a({ canUpdate: true, hasLogBook: true }).variant).toBe('danger')
    expect(a({ canUpdate: false, hasLogBook: true }).visible).toBe(false)
    expect(a({ canUpdate: true, hasLogBook: false }).visible).toBe(false)
  })

  it('wires the archive handler to onSelect', () => {
    const archive = vi.fn()
    buildLogBookActions({}, { archive })[0].onSelect()
    expect(archive).toHaveBeenCalled()
  })
})
